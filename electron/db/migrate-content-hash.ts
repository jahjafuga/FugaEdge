// v0.2.1 — one-shot backfill of trades.content_hash for pre-v0.2.1 rows.
//
// Adds a second dedup hash alongside the v0.1.6 exec_hash. The new hash is
// computed from intrinsic fill content (symbol, UTC timestamp, side, qty,
// price) rather than the per-fill broker IDs that drive exec_hash. Catches
// the cross-format duplicate cases the wider dedup investigation surfaced
// on 2026-05-26 (scenarios b1 / b2 / b3).
//
// Per ARCHITECTURE.md: the pure hash function lives in
// src/core/import/build-round-trips.ts; this module is electron-side glue
// (DB connection, transaction handling, three-layer idempotency guards,
// pre-migration backup closure).
//
// Idempotency: three guards stacked, strongest first.
//   1. Version gate — runs only on a DB that predates schema 20.
//   2. Per-row gate — only rows where content_hash IS NULL are touched, so
//      a re-run after partial failure resumes from where it stopped.
//   3. Settings latch — final belt-and-suspenders, set inside the
//      transaction.
//
// Historical-duplicate handling: a row whose computed content_hash collides
// with another row's already-computed content_hash within this migration is
// a historical duplicate (the v0.1.6 exec_hash dedup let it through because
// the same logical fill carried different IDs). The OLDER row (lower id)
// wins the hash; the newer row's content_hash stays NULL. Both rows remain
// in the DB — the migration doesn't delete anything. The partial UNIQUE
// index permits NULLs, so the loser rows coexist; they just won't catch
// future content-hash dedup attempts against themselves (which is moot —
// they're already duplicates of the winner that WILL catch).

import type Database from 'better-sqlite3'
import { hashFillsByContent } from '@/core/import/build-round-trips'
import type { Execution, RoundTripExecution } from '@shared/import-types'

// Schema version at/after which content_hash is already populated. The
// migration runs only on DBs that predate this.
const CONTENT_HASH_TARGET_SCHEMA_VERSION = 20

// Settings latch — redundant given the version gate + per-row WHERE clause,
// kept as a third layer because the prior migrations all set one.
export const CONTENT_HASH_MIGRATION_LATCH_KEY = 'content_hash_migration_done'

// ── Pure conversion helper (unit-tested) ──────────────────────────────────

export interface BlobToContentHashResult {
  /** Computed content_hash, or null when the blob is unusable. */
  hash: string | null
  /** Reason the hash is null. Distinguishes "no fills" from "JSON broken"
   *  from "fills array but no usable rows" for the migration log. */
  reason?: 'malformed-json' | 'not-an-array' | 'empty-fills' | 'no-valid-fills'
}

// Given the trade row's symbol and the JSON blob of fills, reconstruct the
// minimal Execution shape needed by hashFillsByContent (symbol, time, side,
// qty, price) and compute the content_hash. Returns null + reason on any
// shape problem — the caller logs the reason and leaves content_hash NULL
// for that row.
export function computeContentHashFromBlob(
  symbol: string,
  executionsJson: string,
): BlobToContentHashResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(executionsJson)
  } catch {
    return { hash: null, reason: 'malformed-json' }
  }
  if (!Array.isArray(parsed)) {
    return { hash: null, reason: 'not-an-array' }
  }
  if (parsed.length === 0) {
    return { hash: null, reason: 'empty-fills' }
  }

  // Reconstruct Execution[] from RoundTripExecution[] + the trade-row
  // symbol. Only the fields hashFillsByContent reads are populated; other
  // Execution fields aren't needed and stay undefined (the hash helper
  // doesn't touch them).
  const execs: Execution[] = []
  for (const f of parsed as RoundTripExecution[]) {
    if (
      typeof f.side !== 'string' ||
      typeof f.qty !== 'number' ||
      typeof f.price !== 'number' ||
      typeof f.time !== 'string'
    ) {
      continue
    }
    if (f.side !== 'B' && f.side !== 'S') continue
    execs.push({
      // ID fields aren't read by hashFillsByContent but the Execution type
      // requires them; populate with the actual fill IDs so the executions
      // object stays type-coherent.
      trade_id: f.trade_id ?? '',
      order_id: f.order_id ?? '',
      symbol,
      side: f.side,
      is_short: f.side === 'S',
      qty: f.qty,
      price: f.price,
      time: f.time,
      // date is read by other pipelines but not by hashFillsByContent —
      // derive defensively from the time string.
      date: f.time.slice(0, 10),
    })
  }
  if (execs.length === 0) {
    return { hash: null, reason: 'no-valid-fills' }
  }

  try {
    return { hash: hashFillsByContent(execs) }
  } catch {
    // hashFillsByContent throws on unparseable time. Treat as malformed.
    return { hash: null, reason: 'malformed-json' }
  }
}

// ── DB glue ───────────────────────────────────────────────────────────────

export interface ContentHashMigrationResult {
  /** True only when the migration actually ran the conversion transaction. */
  ran: boolean
  reason?:
    | 'fresh-install'
    | 'already-migrated'
    | 'latched'
    | 'inconsistent-state'
    | 'backup-failed'
    | 'transaction-failed'
  /** Rows that received a content_hash. */
  backfilled: number
  /** Rows whose hash collided with an older row's — left NULL, older row wins. */
  historicalDuplicates: number
  /** Rows where executions_json couldn't be parsed or had no usable fills. */
  skippedMalformed: number
  /** Rows that already had content_hash populated before this run — counted
   *  for the per-row gate's diagnostic and skipped from the UPDATE sweep. */
  alreadyMigrated: number
}

export interface ContentHashMigrationOptions {
  /** Invoked once, after guards pass and BEFORE any row is mutated. Throws
   *  abort the migration without writing — same contract as the tz-utc
   *  migration's backup closure. Omitted by unit tests. */
  backup?: () => void
  /** Optional observer for the start of the backfill sweep, so the boot
   *  path can emit a "Updating dedup index… (N rows)" banner. Called with
   *  the row count BEFORE any UPDATE runs. */
  onStart?: (rowsToMigrate: number) => void
}

const EMPTY_COUNTS = {
  backfilled: 0,
  historicalDuplicates: 0,
  skippedMalformed: 0,
  alreadyMigrated: 0,
}

export function migrateContentHash(
  conn: Database.Database,
  priorVersion: number,
  opts: ContentHashMigrationOptions = {},
): ContentHashMigrationResult {
  // Guard 1 — version gate.
  if (priorVersion === 0) {
    return { ran: false, reason: 'fresh-install', ...EMPTY_COUNTS }
  }
  if (priorVersion >= CONTENT_HASH_TARGET_SCHEMA_VERSION) {
    return { ran: false, reason: 'already-migrated', ...EMPTY_COUNTS }
  }

  // Guard 3 — settings latch.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(CONTENT_HASH_MIGRATION_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') {
      return { ran: false, reason: 'latched', ...EMPTY_COUNTS }
    }
  } catch {
    return { ran: false, reason: 'inconsistent-state', ...EMPTY_COUNTS }
  }

  // Pre-migration backup. Throw = abort without mutating data.
  try {
    opts.backup?.()
  } catch (e) {
    console.error(
      `[FE db] content-hash migration: backup failed, aborting migration: ${e}`,
    )
    return { ran: false, reason: 'backup-failed', ...EMPTY_COUNTS }
  }

  const started = Date.now()

  // Phase 1 — read rows still missing content_hash and compute hashes in
  // memory. Computation is pure; no DB writes here.
  type Row = { id: number; symbol: string; executions_json: string }
  const rows = conn
    .prepare(
      'SELECT id, symbol, executions_json FROM trades WHERE content_hash IS NULL ORDER BY id ASC',
    )
    .all() as Row[]

  opts.onStart?.(rows.length)

  if (rows.length === 0) {
    // Nothing to do — but still set the latch so the per-row gate isn't the
    // only thing standing between us and a re-entry. Don't run the transaction
    // if literally zero rows; just set the latch.
    try {
      conn
        .prepare(
          `INSERT INTO settings (key, value) VALUES (?, 'true')
           ON CONFLICT(key) DO UPDATE SET value = 'true'`,
        )
        .run(CONTENT_HASH_MIGRATION_LATCH_KEY)
    } catch (e) {
      console.error(`[FE db] content-hash migration: latch write failed: ${e}`)
    }
    return { ran: true, ...EMPTY_COUNTS }
  }

  let backfilled = 0
  let historicalDuplicates = 0
  let skippedMalformed = 0

  // Per-hash map. Older rows (lower id) win — rows are pre-sorted ASC.
  const winnerByHash = new Map<string, number>()
  const updates: { id: number; hash: string }[] = []
  const losers: { id: number; hash: string; winnerId: number }[] = []
  const skips: { id: number; reason: string }[] = []

  for (const r of rows) {
    const res = computeContentHashFromBlob(r.symbol, r.executions_json)
    if (res.hash === null) {
      skips.push({ id: r.id, reason: res.reason ?? 'unknown' })
      skippedMalformed++
      continue
    }
    const winner = winnerByHash.get(res.hash)
    if (winner == null) {
      winnerByHash.set(res.hash, r.id)
      updates.push({ id: r.id, hash: res.hash })
    } else {
      losers.push({ id: r.id, hash: res.hash, winnerId: winner })
      historicalDuplicates++
    }
  }

  // Phase 2 — single transaction wraps the UPDATEs + the collision-count
  // write + the latch write so all three commit atomically. The count is
  // inside the transaction (not after run()) so that the banner-state
  // marker can't end up missing while the latch fires — that would leave
  // the user with no surfacing for duplicates and no way to re-trigger the
  // migration on next launch.
  const run = conn.transaction(() => {
    const upd = conn.prepare('UPDATE trades SET content_hash = ? WHERE id = ?')
    for (const u of updates) {
      upd.run(u.hash, u.id)
      backfilled++
    }
    if (losers.length > 0) {
      conn
        .prepare(
          `INSERT INTO settings (key, value) VALUES ('content_hash_migration_collisions', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(String(losers.length))
    }
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(CONTENT_HASH_MIGRATION_LATCH_KEY)
  })

  try {
    run()
  } catch (e) {
    console.error(
      `[FE db] content-hash migration: transaction failed and rolled back, ` +
        `data left untouched: ${e}`,
    )
    return { ran: false, reason: 'transaction-failed', ...EMPTY_COUNTS }
  }

  if (losers.length > 0) {
    console.warn(
      `[FE db] content-hash migration: ${losers.length} historical duplicate(s) ` +
        `detected; older row wins, newer rows kept with content_hash NULL ` +
        `(see Trades-page banner for user surfacing)`,
    )
    for (const l of losers) {
      console.warn(
        `  trade id=${l.id} is a content_hash duplicate of trade id=${l.winnerId}`,
      )
    }
  }
  if (skips.length > 0) {
    console.warn(
      `[FE db] content-hash migration: ${skips.length} row(s) skipped due to ` +
        `unusable executions_json — content_hash left NULL`,
    )
    for (const s of skips) {
      console.warn(`  trade id=${s.id}: ${s.reason}`)
    }
  }

  console.info(
    `[FE db] content-hash migration: backfilled=${backfilled}, ` +
      `historicalDuplicates=${historicalDuplicates}, ` +
      `skippedMalformed=${skippedMalformed}, ` +
      `duration=${Date.now() - started}ms`,
  )

  return {
    ran: true,
    backfilled,
    historicalDuplicates,
    skippedMalformed,
    alreadyMigrated: 0,
  }
}
