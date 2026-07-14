// Catalyst-recovery Beat 1 — schema 45 -> 46. The migration WRAPPER around the pure
// backfillOrphanCatalysts core. Mirrors migrate-mistakes-backfill.ts: version gate + settings latch
// + injected backup-that-aborts + the work wrapped in one transaction (the latch lives INSIDE the
// txn, so a rollback un-sets it and the migration retries next launch).
//
// *** THE RETRY THIS PROMISES IS REAL -- BUT ONLY SINCE THE IN-PROGRESS MARKER. ***
// Until it shipped, this sentence was FALSE. db.exec(SCHEMA_SQL) (database.ts:185) DURABLY
// stamps _meta.schema_version BEFORE any migration in migrateAfterSchema runs, so the next boot
// read the NEW version and this migration's version gate returned 'already-migrated' -- BEFORE
// its latch, the one thing that knew it never ran, was ever consulted. A rolled-back migration
// was simply dead. The marker records the version the chain STARTED from and is cleared only on
// SUCCESS, so an unfinished run really is resumed. See src/core/db/migrationChain.ts.
//
// The core does the SQLite work (enumerate orphans from the DATA, insert the missing catalyst_def
// rows) and NEVER touches trades.catalyst_type. The electron-specific fs backup is INJECTED by
// database.ts (opts.backup) so no node-only APIs live here — this module stays unit-testable
// against an in-memory engine.

import type Database from 'better-sqlite3'
import { backfillOrphanCatalysts, type CatalystBackfillReport } from '../catalyst/backfill'

// Schema version at/after which the backfill is already applied. It runs only on DBs that predate
// this (any post-vocabulary DB that never backfilled — priorVersion 35..45).
export const CATALYST_BACKFILL_TARGET_SCHEMA_VERSION = 46

// Settings latch — redundant given the version gate, kept as a third layer (the prior data
// migrations all set one) and, living inside the transaction, doubles as the crash marker: a
// rolled-back backfill leaves it unset so the migration retries next launch.
export const CATALYST_BACKFILL_MIGRATION_LATCH_KEY = 'catalyst_backfill_migration_done'

export interface CatalystBackfillMigrationResult {
  ran: boolean
  reason?:
    | 'fresh-install'
    | 'already-migrated'
    | 'latched'
    | 'inconsistent-state'
    | 'backup-failed'
    | 'transaction-failed'
  report?: CatalystBackfillReport
}

export interface CatalystBackfillMigrationOptions {
  /** Invoked once, after guards pass and BEFORE the backfill. A throw aborts without writing
   *  (and without setting the latch) — the mistakes-backfill / F0 backup contract. */
  backup?: () => void
}

export function migrateCatalystBackfill(
  conn: Database.Database,
  priorVersion: number,
  opts: CatalystBackfillMigrationOptions = {},
): CatalystBackfillMigrationResult {
  // Guard 1 — version gate. Fresh installs have no trades, so no orphaned catalysts;
  // already-migrated DBs are done.
  if (priorVersion === 0) return { ran: false, reason: 'fresh-install' }
  if (priorVersion >= CATALYST_BACKFILL_TARGET_SCHEMA_VERSION) {
    return { ran: false, reason: 'already-migrated' }
  }

  // Guard 2 — settings latch.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(CATALYST_BACKFILL_MIGRATION_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') return { ran: false, reason: 'latched' }
  } catch {
    return { ran: false, reason: 'inconsistent-state' }
  }

  // Pre-migration backup. A throw aborts before writing (latch stays unset).
  try {
    opts.backup?.()
  } catch (e) {
    console.error(`[FE db] catalyst-backfill migration: backup failed, aborting: ${e}`)
    return { ran: false, reason: 'backup-failed' }
  }

  // Backfill + latch, atomically. A mid-run crash rolls back the new vocabulary rows AND the latch,
  // so the migration retries next launch (the backfill is idempotent, so a retry is safe).
  let report: CatalystBackfillReport | undefined
  const run = conn.transaction(() => {
    report = backfillOrphanCatalysts(conn)
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(CATALYST_BACKFILL_MIGRATION_LATCH_KEY)
  })

  try {
    run()
  } catch (e) {
    console.error(
      `[FE db] catalyst-backfill migration: transaction failed and rolled back, ` +
        `will retry next launch: ${e}`,
    )
    return { ran: false, reason: 'transaction-failed' }
  }

  if (report!.rowsCreated > 0) {
    console.info(
      `[FE db] catalyst-backfill migration: recovered ${report!.rowsCreated} catalyst(s) ` +
        `into the vocabulary: ${report!.recoveredNames.join(', ')}`,
    )
  }
  return { ran: true, report }
}
