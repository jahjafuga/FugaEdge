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
// Idempotency / safety: two guards plus an ordered latch write.
//   1. Version gate — runs only on a DB that predates schema 24.
//   2. Settings latch — checked up front; WRITTEN ONLY AFTER the recompute
//      returns successfully. If recompute throws, the latch stays unset so the
//      migration retries on the next launch (with a fresh backup). recompute is
//      idempotent (deterministic from `trades`), so a retry is safe.

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

  // Safe-on-failure: recompute FIRST; the latch is written only if it returns.
  // A throw here leaves the latch unset → the migration retries next launch.
  try {
    recomputeSummaryForDates(new Set(dates))
  } catch (e) {
    console.error(
      `[FE db] scratch-reclassify migration: recompute failed, latch NOT set, ` +
        `will retry next launch: ${e}`,
    )
    return { ran: false, reason: 'recompute-failed', datesRecomputed: 0 }
  }

  // Latch only after a successful recompute.
  try {
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(SCRATCH_RECLASSIFY_MIGRATION_LATCH_KEY)
  } catch (e) {
    console.error(
      `[FE db] scratch-reclassify migration: latch write failed: ${e}`,
    )
  }

  console.info(
    `[FE db] scratch-reclassify migration: completed, ${dates.length} date(s) ` +
      `recomputed, duration=${Date.now() - started}ms`,
  )

  return { ran: true, datesRecomputed: dates.length }
}
