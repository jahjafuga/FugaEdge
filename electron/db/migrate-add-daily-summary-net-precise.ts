// Precision pass Beat F3 — schema 43 -> 44. Two effects, in dependency order:
//
//   (1) ADD COLUMN daily_summary.total_pnl_precise (additive, ALWAYS — the B1/F0 idiom).
//       The full-precision daily net the HEADLINE readers (equity curve, month calendar)
//       sum, so they stop showing round-then-sum drift. Migration-only (NOT in SCHEMA_SQL's
//       daily_summary CREATE), PRAGMA-gated so it runs on every DB including fresh installs.
//       Sits ABOVE the version gate.
//
//   (2) A one-time REBUILD of every live trade date's daily_summary so total_pnl_precise is
//       populated for existing dates (the migrate-scratch-reclassify idiom: version gate +
//       latch + injected backup that aborts on failure). recomputeSummaryForDates derives
//       the column from SUM(gross_pnl_precise) - SUM(total_fees_precise) and KEEPS the 2dp
//       total_pnl untouched, so the green-days badges stay byte-identical. The rebuild is
//       WRAPPED in conn.transaction() — F3's addition over the scratch-reclassify precedent
//       (which recomputes outside a txn) — so a mid-rebuild crash rolls back the whole cache
//       rewrite; the latch lives INSIDE the txn, so a rollback also un-sets it and the
//       migration retries next launch (recompute is deterministic from trades — safe).
//
// *** THE RETRY THIS PROMISES IS REAL -- BUT ONLY SINCE THE IN-PROGRESS MARKER. ***
// Until it shipped, this sentence was FALSE. db.exec(SCHEMA_SQL) (database.ts:185) DURABLY
// stamps _meta.schema_version BEFORE any migration in migrateAfterSchema runs, so the next boot
// read the NEW version and this migration's version gate returned 'already-migrated' -- BEFORE
// its latch, the one thing that knew it never ran, was ever consulted. A rolled-back migration
// was simply dead. The marker records the version the chain STARTED from and is cleared only on
// SUCCESS, so an unfinished run really is resumed. See src/core/db/migrationChain.ts.
//
// The rebuild depends on daily_summary already being keyed (date, account_id): F3 is
// registered AFTER migrateDailySummaryAccount (database.ts) so recomputeSummaryForDates'
// grouped INSERT has its account_id column.
//
// Structure mirrors migrate-add-net-precise-and-fix-fees.ts (ALTER above the gate) +
// migrate-scratch-reclassify.ts (distinct-date rebuild). The pre-migration backup closure
// is INJECTED by database.ts (throws to abort) so no node-only APIs live here.

import type Database from 'better-sqlite3'
import { recomputeSummaryForDates } from '../trades/recompute-summary'

// Schema version at/after which the precise cache column + rebuild are already applied.
// The rebuild runs only on DBs that predate this; the ALTER is PRAGMA-gated and always runs.
export const DAILY_SUMMARY_NET_PRECISE_TARGET_SCHEMA_VERSION = 44

// Settings latch — redundant given the version gate, kept as a third layer (the prior data
// migrations all set one) and, living inside the rebuild transaction, it doubles as the
// crash marker: a rolled-back rebuild leaves it unset so the migration retries.
export const DAILY_SUMMARY_NET_PRECISE_MIGRATION_LATCH_KEY =
  'daily_summary_net_precise_migration_done'

export interface DailySummaryNetPreciseMigrationResult {
  ran: boolean
  reason?:
    | 'fresh-install'
    | 'already-migrated'
    | 'latched'
    | 'inconsistent-state'
    | 'backup-failed'
    | 'transaction-failed'
  /** Distinct live dates handed to recomputeSummaryForDates. */
  datesRebuilt: number
}

export interface DailySummaryNetPreciseMigrationOptions {
  /** Invoked once, after guards pass and BEFORE the rebuild. A throw aborts the rebuild
   *  without writing (and without setting the latch) — the B2b/F0 backup contract. */
  backup?: () => void
}

export function migrateAddDailySummaryNetPrecise(
  conn: Database.Database,
  priorVersion: number,
  opts: DailySummaryNetPreciseMigrationOptions = {},
): DailySummaryNetPreciseMigrationResult {
  // Part 1 — additive ALTER, ALWAYS (B1/F0 idiom). PRAGMA-gated so it is idempotent and
  // runs on every DB, fresh installs included — total_pnl_precise is migration-only.
  const cols = conn.prepare('PRAGMA table_info(daily_summary)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'total_pnl_precise')) {
    conn.exec('ALTER TABLE daily_summary ADD COLUMN total_pnl_precise REAL NOT NULL DEFAULT 0')
  }

  // Part 2 — one-time rebuild (scratch-reclassify idiom). Version-gated BELOW the ALTER so
  // a fresh DB gets the column but skips the (no trades) rebuild.
  // Guard 1 — version gate.
  if (priorVersion === 0) return { ran: false, reason: 'fresh-install', datesRebuilt: 0 }
  if (priorVersion >= DAILY_SUMMARY_NET_PRECISE_TARGET_SCHEMA_VERSION) {
    return { ran: false, reason: 'already-migrated', datesRebuilt: 0 }
  }

  // Guard 2 — settings latch.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(DAILY_SUMMARY_NET_PRECISE_MIGRATION_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') return { ran: false, reason: 'latched', datesRebuilt: 0 }
  } catch {
    return { ran: false, reason: 'inconsistent-state', datesRebuilt: 0 }
  }

  // Pre-migration backup. A throw aborts before rebuilding (latch stays unset).
  try {
    opts.backup?.()
  } catch (e) {
    console.error(
      `[FE db] daily-summary net-precise migration: backup failed, aborting: ${e}`,
    )
    return { ran: false, reason: 'backup-failed', datesRebuilt: 0 }
  }

  // Rebuild every live date's cache + latch, atomically. The wrap means a mid-rebuild crash
  // rolls back the whole cache rewrite AND the latch, so the migration retries next launch.
  let datesRebuilt = 0
  const run = conn.transaction(() => {
    const dates = (
      conn
        .prepare('SELECT DISTINCT date FROM trades WHERE deleted_at IS NULL')
        .all() as { date: string }[]
    ).map((r) => r.date)
    datesRebuilt = dates.length
    recomputeSummaryForDates(new Set(dates))
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(DAILY_SUMMARY_NET_PRECISE_MIGRATION_LATCH_KEY)
  })

  try {
    run()
  } catch (e) {
    console.error(
      `[FE db] daily-summary net-precise migration: rebuild transaction failed and rolled ` +
        `back, cache left untouched, will retry next launch: ${e}`,
    )
    return { ran: false, reason: 'transaction-failed', datesRebuilt: 0 }
  }

  console.info(
    `[FE db] daily-summary net-precise migration: rebuilt ${datesRebuilt} date(s) with ` +
      `total_pnl_precise`,
  )
  return { ran: true, datesRebuilt }
}
