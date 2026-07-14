// v0.2.3 (schema 24 → 25) — one-shot reset of trades.mae / trades.mfe.
//
// The excursion definition changed: computeMaeMfe now returns NULL for closed
// trades held shorter than the 1-minute bar resolution (α = 120s), because a
// sub-2-bar scalp produces an inflated/arbitrary MAE/MFE. The WRITE path (the
// intraday backfill) already honors the new α, but pre-existing trades.mae/mfe
// rows still hold values computed under the old, unfiltered rule. This
// migration wipes every stored value to NULL so the columns carry truth
// (a freshly-recomputed honest value, or NULL = "unknown"); the caller then
// schedules backfillAllMaeMfe in the background to repopulate from the cached
// intraday_bars — no new API calls.
//
// DESTRUCTION PROFILE: unlike the prior v0.2.x migrations (ADD COLUMN /
// derived-cache rebuilds), this nulls real computed values that can ONLY be
// regenerated if intraday_bars coverage still holds for the trade's
// (symbol, date). The pre-migration backup (caller's `backup` closure) is the
// only safety net if recovery from cached bars fails — so a backup failure
// MUST abort before the wipe.
//
// Idempotency / safety: two guards plus an ordered latch write.
//   1. Version gate — runs only on a DB that predates schema 25.
//   2. Settings latch — checked up front; WRITTEN ONLY AFTER the wipe returns
//      successfully. On a re-run the columns are already NULL, so even a
//      latch-bypassed re-execution is a harmless no-op.

import type Database from 'better-sqlite3'

// Schema version at/after which trades.mae/mfe already follow the α-filtered
// definition. The migration runs only on DBs that predate this.
const RESET_MAE_MFE_TARGET_SCHEMA_VERSION = 25

// Settings latch — set only after a successful wipe.
export const RESET_MAE_MFE_MIGRATION_LATCH_KEY = 'mae_mfe_reset_migration_done'

// Signal consumed once by runPendingMaeMfeBackfill() (electron/market/intraday)
// at ready-to-show, so the recompute runs off cached bars without blocking the
// UI. Set here as part of the migration; cleared only after a clean backfill.
export const MAE_MFE_BACKFILL_PENDING_KEY = 'mae_mfe_backfill_pending'

export interface ResetMaeMfeMigrationResult {
  /** True only when the migration actually ran the wipe. */
  ran: boolean
  reason?:
    | 'fresh-install'
    | 'already-migrated'
    | 'latched'
    | 'inconsistent-state'
    | 'backup-failed'
    | 'wipe-failed'
  /** Rows affected by the UPDATE (mae/mfe → NULL). */
  rowsReset: number
}

export interface ResetMaeMfeMigrationOptions {
  /** Invoked once, after guards pass and BEFORE the wipe. Throwing aborts the
   *  migration without wiping (and without setting the latch) — same contract
   *  as the other migrations' backup closures. Omitted by unit tests. */
  backup?: () => void
}

export function migrateResetMaeMfe(
  conn: Database.Database,
  priorVersion: number,
  opts: ResetMaeMfeMigrationOptions = {},
): ResetMaeMfeMigrationResult {
  // Guard 1 — version gate.
  if (priorVersion === 0) {
    return { ran: false, reason: 'fresh-install', rowsReset: 0 }
  }
  if (priorVersion >= RESET_MAE_MFE_TARGET_SCHEMA_VERSION) {
    return { ran: false, reason: 'already-migrated', rowsReset: 0 }
  }

  // Guard 2 — settings latch.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(RESET_MAE_MFE_MIGRATION_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') {
      return { ran: false, reason: 'latched', rowsReset: 0 }
    }
  } catch {
    return { ran: false, reason: 'inconsistent-state', rowsReset: 0 }
  }

  // Pre-migration backup. Throw = abort before the wipe (latch stays unset).
  try {
    opts.backup?.()
  } catch (e) {
    console.error(
      `[FE db] mae/mfe-reset migration: backup failed, aborting: ${e}`,
    )
    return { ran: false, reason: 'backup-failed', rowsReset: 0 }
  }

  const started = Date.now()

  // The wipe, the recompute-arming flag, and the latch — ALL THREE IN ONE TRANSACTION.
  //
  // The flag is not optional company for the wipe: it is what schedules the recompute that
  // puts the values BACK. Wipe-without-flag nulls every trade's excursion data and arms
  // nothing to rebuild it. It was previously a separate statement whose failure was logged
  // and swallowed, so a disk-full landed exactly that state. All three now stand or fall
  // together.
  //
  // ┌─ *** CROSS-FILE LANDMINE. READ THIS BEFORE MOVING THE RECOMPUTE. *** ────────────────┐
  // │                                                                                       │
  // │ Under the in-progress marker (src/core/db/migrationChain.ts), an interrupted boot     │
  // │ RE-RUNS this migration from the original priorVersion. That re-run is only harmless   │
  // │ because `UPDATE trades SET mae = NULL, mfe = NULL` is a no-op when the values are     │
  // │ ALREADY NULL — and they are still NULL, because runPendingMaeMfeBackfill (the thing   │
  // │ that recomputes them) is scheduled by the main process at READY-TO-SHOW, which a      │
  // │ boot that died inside migrateAfterSchema never reached.                               │
  // │                                                                                       │
  // │ MOVE THAT RECOMPUTE ANYWHERE BEFORE migrateAfterSchema AND THIS BECOMES A DATA WIPE:  │
  // │ the retry would null freshly-computed excursion values that no longer have a pending  │
  // │ flag behind them. The idempotency of this migration is NOT self-contained — it is     │
  // │ borrowed from an ordering invariant that lives in electron/main/index.ts.             │
  // └───────────────────────────────────────────────────────────────────────────────────────┘
  let rowsReset = 0
  try {
    const run = conn.transaction(() => {
      const info = conn.prepare('UPDATE trades SET mae = NULL, mfe = NULL').run()
      rowsReset = info.changes

      const setFlag = conn.prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      setFlag.run(MAE_MFE_BACKFILL_PENDING_KEY) // arm the recompute
      setFlag.run(RESET_MAE_MFE_MIGRATION_LATCH_KEY) // and record that we did all of this
    })
    run()
  } catch (e) {
    console.error(
      `[FE db] mae/mfe-reset migration: transaction failed and rolled back, ` +
        `mae/mfe UNCHANGED, will retry next launch: ${e}`,
    )
    return { ran: false, reason: 'wipe-failed', rowsReset: 0 }
  }

  console.info(
    `[FE db] mae/mfe-reset migration: completed, ${rowsReset} trade row(s) ` +
      `nulled, backfill armed, duration=${Date.now() - started}ms`,
  )

  return { ran: true, rowsReset }
}
