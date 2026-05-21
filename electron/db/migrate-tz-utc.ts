// Day 8.5 Commit B — one-shot conversion of stored timestamps from
// bare-local-Eastern to true UTC.
//
// Pre-Commit-B every parser stored wall-clock US/Eastern (with no offset) in
// trades.open_time, trades.close_time, executions.timestamp_utc, and the
// `time` field of every fill inside trades.executions_json. Commit B flips the
// parsers to emit true UTC; this migration brings every PRE-EXISTING row into
// the same representation so the `timestamp_utc` column name finally tells the
// truth and the chart / hour-of-day consumers read one consistent zone.
//
// This module is deliberately electron-, fs-, and better-sqlite3-free at
// runtime: the DB connection is passed in, and `better-sqlite3` is imported
// type-only (its native binary is built for Electron's ABI and won't load
// under vitest's plain-Node runner). The pure conversion helpers
// (barLocalToUtcField, convertExecutionsJsonBlob) carry all the data-integrity
// logic and are unit-tested directly; migrateTimestampsToUtc is thin glue —
// guards + three SQL sweeps + one transaction — reviewed in the diff.

import type Database from 'better-sqlite3'
import { localEasternToUtc } from '@/lib/format'

// Schema version at/after which the timestamps are already UTC. The migration
// runs only on DBs that predate this (see migrateTimestampsToUtc guard 1).
const TZ_UTC_TARGET_SCHEMA_VERSION = 19

// Settings latch — redundant given the version gate + the per-row `NOT LIKE
// '%Z'` filter, kept as belt-and-suspenders and set inside the transaction so
// it commits atomically with the converted data.
export const TZ_MIGRATION_LATCH_KEY = 'tz_utc_migration_done'

// ── Pure conversion helpers (unit-tested) ─────────────────────────────────

// Convert one stored timestamp field to true UTC. Idempotent: a value that
// already ends in `Z` is returned unchanged — this is the per-row guard that
// makes a re-run a no-op. null / undefined / blank → null (e.g. an open
// trade's close_time). Throws (via localEasternToUtc) on a non-blank string
// that isn't a parseable "YYYY-MM-DDTHH:MM:SS" — callers wrap each row in
// try/catch and treat a throw as a skipped-malformed row.
export function barLocalToUtcField(
  value: string | null | undefined,
): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.endsWith('Z')) return trimmed
  return localEasternToUtc(trimmed.slice(0, 10), trimmed.slice(11, 19))
}

export interface BlobConversionResult {
  /** The blob to store. Byte-identical to the input when nothing changed
   *  (converted === 0) so the migration never rewrites an untouched row. */
  json: string
  /** Number of fills whose `time` was converted to UTC. */
  converted: number
  /** Fills whose `time` was a non-blank string that wouldn't parse — left
   *  exactly as-is (log-and-continue policy). */
  skippedFills: number
  /** True when the whole blob is unparseable JSON or not a JSON array — the
   *  blob is returned untouched and the caller logs + counts it. */
  malformed: boolean
}

// Convert the `time` field of every fill in a trades.executions_json blob.
// Each fill's time uses the date embedded in its OWN time string (not the
// trade's `date` column) — barLocalToUtcField slices it. A fill with no
// `time`, or an already-`Z` time, is left alone and not counted.
export function convertExecutionsJsonBlob(json: string): BlobConversionResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { json, converted: 0, skippedFills: 0, malformed: true }
  }
  if (!Array.isArray(parsed)) {
    return { json, converted: 0, skippedFills: 0, malformed: true }
  }

  let converted = 0
  let skippedFills = 0
  for (const fill of parsed) {
    if (!fill || typeof fill !== 'object') continue
    const t = (fill as { time?: unknown }).time
    if (typeof t !== 'string' || t === '') continue
    try {
      const utc = barLocalToUtcField(t)
      if (utc != null && utc !== t) {
        ;(fill as { time: string }).time = utc
        converted++
      }
    } catch {
      // Unparseable fill time — leave it exactly as-is, count it, move on.
      skippedFills++
    }
  }

  return {
    json: converted > 0 ? JSON.stringify(parsed) : json,
    converted,
    skippedFills,
    malformed: false,
  }
}

// ── DB glue ───────────────────────────────────────────────────────────────

export interface TzMigrationResult {
  /** True only when the migration actually ran the conversion transaction. */
  ran: boolean
  /** Why the migration did not run (when ran === false). */
  reason?:
    | 'fresh-install'
    | 'already-migrated'
    | 'latched'
    | 'inconsistent-state'
    | 'backup-failed'
    | 'transaction-failed'
  tradesConverted: number
  execsConverted: number
  blobsConverted: number
  skippedMalformed: number
  alreadyUtc: number
}

export interface TzMigrationOptions {
  /** Invoked once, after the guards pass and BEFORE any row is mutated.
   *  database.ts supplies the Electron/fs pre-migration backup here. If it
   *  throws, the migration aborts without mutating data — a missing backup
   *  must never be silently overridden. Omitted by unit tests. */
  backup?: () => void
}

const EMPTY_COUNTS = {
  tradesConverted: 0,
  execsConverted: 0,
  blobsConverted: 0,
  skippedMalformed: 0,
  alreadyUtc: 0,
}

// One-shot bare-local-Eastern → UTC data migration. Three idempotency guards,
// strongest first:
//   1. version gate — runs only on a DB that predates schema 19. After one
//      launch SCHEMA_SQL stamps schema_version=19, so the next launch's
//      priorVersion is 19 and this returns immediately. A failed migration
//      does NOT auto-retry by design — the rolled-back transaction leaves the
//      data intact and the pre-migration backup is the recovery path.
//   2. per-row `NOT LIKE '%Z'` — a converted value ends in Z, a bare-local
//      one never does; double-conversion is structurally impossible even if
//      this function is somehow re-entered.
//   3. settings latch — redundant given (1)+(2), set inside the transaction.
//
// All three UPDATE sweeps run inside ONE transaction: a failure rolls the
// whole thing back, so the DB is never left half-converted.
export function migrateTimestampsToUtc(
  conn: Database.Database,
  priorVersion: number,
  opts: TzMigrationOptions = {},
): TzMigrationResult {
  // Guard 1 — version gate.
  if (priorVersion === 0) {
    return { ran: false, reason: 'fresh-install', ...EMPTY_COUNTS }
  }
  if (priorVersion >= TZ_UTC_TARGET_SCHEMA_VERSION) {
    return { ran: false, reason: 'already-migrated', ...EMPTY_COUNTS }
  }

  // Guard 3 — settings latch.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(TZ_MIGRATION_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') {
      return { ran: false, reason: 'latched', ...EMPTY_COUNTS }
    }
  } catch {
    // settings table missing on a version>0 DB is a wildly inconsistent
    // state we shouldn't try to recover from here.
    return { ran: false, reason: 'inconsistent-state', ...EMPTY_COUNTS }
  }

  // Pre-migration backup. A throw here means no safety net was written, so
  // the migration aborts without touching data (next launch can't retry —
  // version gate — but the data is untouched and a re-install can restore).
  try {
    opts.backup?.()
  } catch (e) {
    console.error(
      `[FE db] tz-utc migration: backup failed, aborting migration: ${e}`,
    )
    return { ran: false, reason: 'backup-failed', ...EMPTY_COUNTS }
  }

  const started = Date.now()
  let tradesConverted = 0
  let execsConverted = 0
  let blobsConverted = 0
  let skippedMalformed = 0
  let alreadyUtc = 0

  const run = conn.transaction(() => {
    // Sweep 1 — trades.open_time / trades.close_time.
    const totalTrades = (
      conn.prepare('SELECT COUNT(*) AS n FROM trades').get() as { n: number }
    ).n
    const tradeRows = conn
      .prepare(
        `SELECT id, open_time, close_time FROM trades
         WHERE open_time NOT LIKE '%Z'
            OR (close_time IS NOT NULL AND close_time NOT LIKE '%Z')`,
      )
      .all() as { id: number; open_time: string; close_time: string | null }[]
    alreadyUtc += totalTrades - tradeRows.length
    const updTrade = conn.prepare(
      'UPDATE trades SET open_time = ?, close_time = ? WHERE id = ?',
    )
    for (const r of tradeRows) {
      try {
        const open = barLocalToUtcField(r.open_time)
        if (open == null) {
          throw new Error(`open_time empty/unparseable: "${r.open_time}"`)
        }
        const close = barLocalToUtcField(r.close_time)
        updTrade.run(open, close, r.id)
        tradesConverted++
      } catch (e) {
        skippedMalformed++
        console.warn(`[FE db] tz-utc migration: skipped trade id=${r.id}: ${e}`)
      }
    }

    // Sweep 2 — executions.timestamp_utc.
    const totalExecs = (
      conn.prepare('SELECT COUNT(*) AS n FROM executions').get() as {
        n: number
      }
    ).n
    const execRows = conn
      .prepare(
        `SELECT id, timestamp_utc FROM executions
         WHERE timestamp_utc NOT LIKE '%Z'`,
      )
      .all() as { id: number; timestamp_utc: string }[]
    alreadyUtc += totalExecs - execRows.length
    const updExec = conn.prepare(
      'UPDATE executions SET timestamp_utc = ? WHERE id = ?',
    )
    for (const r of execRows) {
      try {
        const utc = barLocalToUtcField(r.timestamp_utc)
        if (utc == null) {
          throw new Error(
            `timestamp_utc empty/unparseable: "${r.timestamp_utc}"`,
          )
        }
        updExec.run(utc, r.id)
        execsConverted++
      } catch (e) {
        skippedMalformed++
        console.warn(
          `[FE db] tz-utc migration: skipped execution id=${r.id}: ${e}`,
        )
      }
    }

    // Sweep 3 — `time` inside every trades.executions_json blob.
    const blobRows = conn
      .prepare('SELECT id, executions_json FROM trades')
      .all() as { id: number; executions_json: string }[]
    const updBlob = conn.prepare(
      'UPDATE trades SET executions_json = ? WHERE id = ?',
    )
    for (const r of blobRows) {
      const res = convertExecutionsJsonBlob(r.executions_json)
      if (res.malformed) {
        skippedMalformed++
        console.warn(
          `[FE db] tz-utc migration: skipped executions_json for trade ` +
            `id=${r.id} (unparseable JSON, blob left untouched)`,
        )
        continue
      }
      if (res.skippedFills > 0) {
        skippedMalformed += res.skippedFills
        console.warn(
          `[FE db] tz-utc migration: ${res.skippedFills} unparseable fill ` +
            `time(s) left as-is in trade id=${r.id}`,
        )
      }
      if (res.converted > 0) {
        updBlob.run(res.json, r.id)
        blobsConverted++
      }
    }

    // Guard 3 — latch, inside the transaction so it commits atomically with
    // the converted rows.
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(TZ_MIGRATION_LATCH_KEY)
  })

  try {
    run()
  } catch (e) {
    // Transaction rolled back — data is fully intact (no partial state).
    console.error(
      `[FE db] tz-utc migration: transaction failed and rolled back, ` +
        `data left unconverted: ${e}`,
    )
    return { ran: false, reason: 'transaction-failed', ...EMPTY_COUNTS }
  }

  console.info(
    `[FE db] tz-utc migration: trades converted=${tradesConverted}, ` +
      `executions converted=${execsConverted}, ` +
      `executions_json blobs converted=${blobsConverted}, ` +
      `skipped malformed=${skippedMalformed}, already-utc=${alreadyUtc}, ` +
      `duration=${Date.now() - started}ms`,
  )

  return {
    ran: true,
    tradesConverted,
    execsConverted,
    blobsConverted,
    skippedMalformed,
    alreadyUtc,
  }
}
