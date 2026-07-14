// v0.2.3 — one-shot backfill of the daily_summary cache after the scratch
// definition changed.
//
// Commit 2a/2b moved every win/loss/scratch classification onto
// |net_pnl| <= SCRATCH_EPSILON (shared/trade-classification.ts), replacing the
// old ±$2 band / bare-sign checks. daily_summary.winners/losers are STORED
// (written by recompute-summary.ts on import + lifecycle ops) and read DIRECTLY
// by the dashboard's per-day card. After 2b the WRITE path uses the new
// definition, but pre-existing rows still hold the old counts. This migration
// recomputes every live date once so the stored cache matches the new
// definition; without it the dashboard would disagree with the live-computed
// surfaces for historical dates.
//
// Non-destructive: it only rewrites the DERIVED daily_summary cache from
// `trades` (the source of truth is never touched; the cache is rebuildable at
// any time, and normal import/edit activity re-derives any touched date). A
// pre-migration backup is taken anyway — defense-in-depth + consistency with
// the other schema migrations; the caller passes the backup closure.
//
// Idempotency / safety: two guards plus an ATOMIC recompute+latch.
//   1. Version gate — runs only on a DB that predates schema 24.
//   2. Settings latch — checked up front, and WRITTEN IN THE SAME TRANSACTION AS the recompute.
//      A throw rolls back both, so the latch stays unset and the migration retries on the next
//      launch. recompute is idempotent (deterministic from `trades`), so a retry is safe.
//
// *** THE RETRY THIS PROMISES IS REAL -- BUT ONLY SINCE THE IN-PROGRESS MARKER. ***
// Until it shipped, this sentence was FALSE. db.exec(SCHEMA_SQL) (database.ts:185) DURABLY
// stamps _meta.schema_version BEFORE any migration in migrateAfterSchema runs, so the next boot
// read the NEW version and this migration's version gate returned 'already-migrated' -- BEFORE
// its latch, the one thing that knew it never ran, was ever consulted. A rolled-back migration
// was simply dead. The marker records the version the chain STARTED from and is cleared only on
// SUCCESS, so an unfinished run really is resumed. See src/core/db/migrationChain.ts.
//
// The latch write used to sit OUTSIDE the recompute, and its failure was logged and SWALLOWED —
// the cache could be rewritten with nothing on disk recording it. Harmless here (the recompute
// is deterministic), but it is the same shape as the sentiment-polarity defect, where it was not.

import type Database from 'better-sqlite3'
import { recomputeSummaryForDates } from '../trades/recompute-summary'

// Schema version at/after which daily_summary is already on the epsilon
// definition. The migration runs only on DBs that predate this.
const SCRATCH_RECLASSIFY_TARGET_SCHEMA_VERSION = 24

// Settings latch — set only after a successful recompute.
export const SCRATCH_RECLASSIFY_MIGRATION_LATCH_KEY =
  'scratch_reclassify_migration_done'

export interface ScratchReclassifyMigrationResult {
  /** True only when the migration actually ran the recompute. */
  ran: boolean
  reason?:
    | 'fresh-install'
    | 'already-migrated'
    | 'latched'
    | 'inconsistent-state'
    | 'backup-failed'
    | 'recompute-failed'
  /** Distinct live dates handed to recomputeSummaryForDates. */
  datesRecomputed: number
}

export interface ScratchReclassifyMigrationOptions {
  /** Invoked once, after guards pass and BEFORE the recompute. Throwing aborts
   *  the migration without recomputing (and without setting the latch) — same
   *  contract as the other migrations' backup closures. Omitted by unit tests. */
  backup?: () => void
}

export function migrateScratchReclassify(
  conn: Database.Database,
  priorVersion: number,
  opts: ScratchReclassifyMigrationOptions = {},
): ScratchReclassifyMigrationResult {
  // Guard 1 — version gate.
  if (priorVersion === 0) {
    return { ran: false, reason: 'fresh-install', datesRecomputed: 0 }
  }
  if (priorVersion >= SCRATCH_RECLASSIFY_TARGET_SCHEMA_VERSION) {
    return { ran: false, reason: 'already-migrated', datesRecomputed: 0 }
  }

  // Guard 2 — settings latch.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(SCRATCH_RECLASSIFY_MIGRATION_LATCH_KEY) as
      | { value: string }
      | undefined
    if (row?.value === 'true') {
      return { ran: false, reason: 'latched', datesRecomputed: 0 }
    }
  } catch {
    return { ran: false, reason: 'inconsistent-state', datesRecomputed: 0 }
  }

  // Pre-migration backup. Throw = abort before recomputing (latch stays unset).
  try {
    opts.backup?.()
  } catch (e) {
    console.error(
      `[FE db] scratch-reclassify migration: backup failed, aborting: ${e}`,
    )
    return { ran: false, reason: 'backup-failed', datesRecomputed: 0 }
  }

  const started = Date.now()

  // Every distinct live date — recompute rewrites daily_summary for each under
  // the new epsilon definition (recompute-summary.ts, Commit 2b).
  const dates = (
    conn
      .prepare('SELECT DISTINCT date FROM trades WHERE deleted_at IS NULL')
      .all() as { date: string }[]
  ).map((r) => r.date)

  console.info(
    `[FE db] scratch-reclassify migration: recomputing daily_summary for ` +
      `${dates.length} live date(s)`,
  )

  // The recompute AND the latch, in ONE transaction — the migrate-add-daily-summary-net-precise
  // idiom (the other recompute-based migration, which already does exactly this).
  //
  // recomputeSummaryForDates is safe to enclose: it opens no transaction of its own, and it
  // reaches the SAME connection we hold — openDatabase() returns a cached singleton, and
  // database.ts assigns it (:161) before migrateAfterSchema (:186) ever calls us. Its own
  // header states the contract: "every statement here runs inside whatever db.transaction the
  // caller has open" (trades/recompute-summary.ts:19-22).
  //
  // The latch used to be a separate statement whose failure was logged and SWALLOWED, so the
  // cache could be rewritten with nothing on disk recording that it had been. Harmless in
  // isolation — the recompute is deterministic from `trades`, so a re-run reproduces it — but it
  // is the same shape as the sentiment defect, and a swallowed latch sitting next to a fixed one
  // is how the next person concludes the swallow was deliberate.
  try {
    const run = conn.transaction(() => {
      recomputeSummaryForDates(new Set(dates))
      conn
        .prepare(
          `INSERT INTO settings (key, value) VALUES (?, 'true')
           ON CONFLICT(key) DO UPDATE SET value = 'true'`,
        )
        .run(SCRATCH_RECLASSIFY_MIGRATION_LATCH_KEY)
    })
    run()
  } catch (e) {
    console.error(
      `[FE db] scratch-reclassify migration: transaction failed and rolled back, ` +
        `daily_summary UNCHANGED, will retry next launch: ${e}`,
    )
    return { ran: false, reason: 'recompute-failed', datesRecomputed: 0 }
  }

  console.info(
    `[FE db] scratch-reclassify migration: completed, ${dates.length} date(s) ` +
      `recomputed, duration=${Date.now() - started}ms`,
  )

  return { ran: true, datesRecomputed: dates.length }
}
