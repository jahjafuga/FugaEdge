// Beat B2b — one-shot backfill of trades.total_fees_precise / gross_pnl_precise
// for pre-B2a rows. schema 41 -> 42.
//
// B1 added the columns (NOT NULL DEFAULT 0); B2a populates them at full
// precision on NEW imports. Every row that predates B2a still carries
// precise = 0,0, so a Beat B3 SUM(*_precise) would undercount it to zero. This
// copies each such row's already-stored 2dp value into its precise column so
// old rows sum at 2dp precision (no worse than today's round-then-sum) rather
// than 0. The raw is gone from those rows' original import, so 2dp is the
// honest ceiling for existing data — re-import won't refresh (content_hash
// dedup skips), only delete+reimport would; B3's total shrinks the drift but
// won't fully tie out for pre-B2a rows. Expected, documented.
//
// Structure mirrors migrate-content-hash.ts, simpler (one set-based UPDATE, no
// per-row hashing). Idempotency, strongest guard first:
//   1. Version gate  — runs only on a DB that predates schema 42.
//   2. Per-row WHERE — total_fees_precise = 0 AND gross_pnl_precise = 0, so a
//      B2a-precise row (>=1 nonzero column) is NEVER clobbered, a genuine-zero
//      row is a harmless 0 -> 0 no-op, and a re-run finds no both-zero rows.
//   3. Settings latch — final belt-and-suspenders, set inside the transaction.
// The pre-migration backup closure is INJECTED by database.ts (throws to abort)
// so the file-copy stays out of this module — no node-only APIs here.

import type Database from 'better-sqlite3'

// Schema version at/after which the precise columns are already backfilled. The
// migration runs only on DBs that predate this.
export const PRECISE_BACKFILL_TARGET_SCHEMA_VERSION = 42

// Settings latch — redundant given the version gate + both-zero WHERE, kept as a
// third layer because the prior data migrations all set one.
export const PRECISE_BACKFILL_MIGRATION_LATCH_KEY = 'precise_backfill_migration_done'

// Copy each pre-B2a row's 2dp value into its precise column. WHERE both precise
// columns are 0 is the clobber guard: AND (not OR) means a row with EITHER
// precise column already nonzero was written by B2a and is left exactly as-is.
const BACKFILL_SQL = `
  UPDATE trades
     SET total_fees_precise = total_fees,
         gross_pnl_precise  = gross_pnl
   WHERE total_fees_precise = 0 AND gross_pnl_precise = 0
`

export interface PreciseBackfillResult {
  ran: boolean
  reason?:
    | 'fresh-install'
    | 'already-migrated'
    | 'latched'
    | 'inconsistent-state'
    | 'backup-failed'
    | 'transaction-failed'
  /** Rows whose precise columns were copied from their 2dp values. */
  backfilled: number
}

export interface PreciseBackfillOptions {
  /** Invoked once, after guards pass and BEFORE the UPDATE. A throw aborts the
   *  migration without writing — same contract as the content-hash backup. */
  backup?: () => void
}

export function migrateBackfillPreciseColumns(
  conn: Database.Database,
  priorVersion: number,
  opts: PreciseBackfillOptions = {},
): PreciseBackfillResult {
  // Guard 1 — version gate.
  if (priorVersion === 0) {
    return { ran: false, reason: 'fresh-install', backfilled: 0 }
  }
  if (priorVersion >= PRECISE_BACKFILL_TARGET_SCHEMA_VERSION) {
    return { ran: false, reason: 'already-migrated', backfilled: 0 }
  }

  // Guard 3 — settings latch.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(PRECISE_BACKFILL_MIGRATION_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') {
      return { ran: false, reason: 'latched', backfilled: 0 }
    }
  } catch {
    return { ran: false, reason: 'inconsistent-state', backfilled: 0 }
  }

  // Pre-migration backup. A throw aborts without mutating data.
  try {
    opts.backup?.()
  } catch (e) {
    console.error(
      `[FE db] precise-backfill migration: backup failed, aborting migration: ${e}`,
    )
    return { ran: false, reason: 'backup-failed', backfilled: 0 }
  }

  // The UPDATE + latch write commit atomically.
  let backfilled = 0
  const run = conn.transaction(() => {
    const info = conn.prepare(BACKFILL_SQL).run()
    backfilled = info.changes
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(PRECISE_BACKFILL_MIGRATION_LATCH_KEY)
  })

  try {
    run()
  } catch (e) {
    console.error(
      `[FE db] precise-backfill migration: transaction failed and rolled back, ` +
        `data left untouched: ${e}`,
    )
    return { ran: false, reason: 'transaction-failed', backfilled: 0 }
  }

  console.info(
    `[FE db] precise-backfill migration: backfilled ${backfilled} pre-B2a row(s) ` +
      `to 2dp precision`,
  )
  return { ran: true, backfilled }
}
