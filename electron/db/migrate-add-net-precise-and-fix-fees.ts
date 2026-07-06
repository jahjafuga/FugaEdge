// Beat F0 (merged F0+F1) — schema 42 -> 43. Two effects, in dependency order:
//
//   (1) ADD COLUMN net_pnl_precise (additive, ALWAYS — the B1 idiom). The full-
//       precision net companion to gross_pnl_precise / total_fees_precise, so a later
//       beat can SUM(net_pnl_precise) without round-then-sum drift. Migration-only
//       (NOT in SCHEMA_SQL's trades CREATE, NOT in the frozen rebuild list
//       migrate-trades-rebuild-dedup.ts:40-92) — mirrors B1, which registers AFTER
//       that rebuild so the ALTER lands on the final shape and survives. PRAGMA-gated,
//       so it runs on EVERY DB including fresh installs (which never see precise
//       columns in SCHEMA_SQL because there aren't any). This is why the ALTER sits
//       ABOVE the version gate: a fresh DB must still get the column.
//
//   (2) A one-shot corrective + backfill (the B2b idiom: version gate + latch +
//       injected backup + transaction). The fee allocator (apply-fees.ts) historically
//       wrote only the 2dp total_fees/net_pnl and LEFT total_fees_precise = 0 on
//       fees_reported = 0 (DAS/Webull) rows whose fees arrive via day_fees allocation
//       AFTER B2a — so SUM(total_fees_precise) undercounts and a net derived from it
//       overcounts. Step 2 corrects those rows; step 3 then derives net_pnl_precise
//       from the CORRECTED fee. Ordered fee-fix -> net inside ONE transaction: the net
//       backfill MUST see the corrected fee, or allocated rows get net = gross - 0.
//
// The corrective WHERE is cohort-agnostic and provably safe (F0 recon):
//   total_fees != 0        -> excludes genuine zero-fee rows (precise stays 0 = fee)
//   total_fees_precise = 0 -> excludes already-correct rows (Ocean One authoritative
//                             precise, or B2b's 2dp backfill of pre-B2a rows) — the
//                             clobber guard; and self-excludes on re-run (idempotent).
//
// Structure mirrors migrate-backfill-precise-columns.ts. The pre-migration backup
// closure is INJECTED by database.ts (throws to abort) so no node-only APIs here.

import type Database from 'better-sqlite3'

// Schema version at/after which the net-precise column + corrective backfill are
// already applied. The DATA migration (steps 2-3) runs only on DBs that predate this;
// the ALTER (step 1) is PRAGMA-gated and always runs.
export const NET_PRECISE_TARGET_SCHEMA_VERSION = 43

// Settings latch — redundant given the version gate + self-excluding WHERE, kept as a
// third layer because the prior data migrations all set one.
export const NET_PRECISE_MIGRATION_LATCH_KEY = 'net_precise_migration_done'

// Step 2 — correct the stale precise fee the allocator left at 0. The WHERE is the
// clobber guard: a row already carrying a nonzero precise fee is left exactly as-is,
// a genuine zero-fee row is excluded, and a re-run finds no rows.
const CORRECT_FEES_SQL = `
  UPDATE trades
     SET total_fees_precise = total_fees
   WHERE total_fees != 0 AND total_fees_precise = 0
`

// Step 3 — derive net_pnl_precise for EVERY row from the now-correct precise fee and
// the precise gross (set by B2a at insert / B2b for legacy rows). Legacy rows whose
// gross/fee precise ARE their 2dp values get their 2dp net; new rows get true
// precision — the documented honest ceiling. Runs after step 2 so allocated rows use
// the corrected fee; the column is uniformly 0 (just added) so no clobber guard needed.
const BACKFILL_NET_SQL = `
  UPDATE trades
     SET net_pnl_precise = gross_pnl_precise - total_fees_precise
`

export interface NetPreciseMigrationResult {
  ran: boolean
  reason?:
    | 'fresh-install'
    | 'already-migrated'
    | 'latched'
    | 'inconsistent-state'
    | 'backup-failed'
    | 'transaction-failed'
  /** Rows whose stale total_fees_precise was corrected from their 2dp fee. */
  feesCorrected: number
}

export interface NetPreciseMigrationOptions {
  /** Invoked once, after guards pass and BEFORE the UPDATEs. A throw aborts the data
   *  migration without writing — same contract as the B2b backfill backup. */
  backup?: () => void
}

export function migrateAddNetPreciseAndFixFees(
  conn: Database.Database,
  priorVersion: number,
  opts: NetPreciseMigrationOptions = {},
): NetPreciseMigrationResult {
  // Part 1 — additive ALTER, ALWAYS (B1 idiom). PRAGMA-gated so it is idempotent and
  // runs on every DB, fresh installs included — net_pnl_precise is migration-only.
  const cols = conn.prepare('PRAGMA table_info(trades)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'net_pnl_precise')) {
    conn.exec('ALTER TABLE trades ADD COLUMN net_pnl_precise REAL NOT NULL DEFAULT 0')
  }

  // Part 2 — corrective + backfill (B2b idiom). Version-gated BELOW the ALTER so a
  // fresh DB gets the column but skips the (no-op) data UPDATEs.
  // Guard 1 — version gate.
  if (priorVersion === 0) return { ran: false, reason: 'fresh-install', feesCorrected: 0 }
  if (priorVersion >= NET_PRECISE_TARGET_SCHEMA_VERSION) {
    return { ran: false, reason: 'already-migrated', feesCorrected: 0 }
  }

  // Guard 2 — settings latch.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(NET_PRECISE_MIGRATION_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') return { ran: false, reason: 'latched', feesCorrected: 0 }
  } catch {
    return { ran: false, reason: 'inconsistent-state', feesCorrected: 0 }
  }

  // Pre-migration backup. A throw aborts without mutating data.
  try {
    opts.backup?.()
  } catch (e) {
    console.error(
      `[FE db] net-precise migration: backup failed, aborting migration: ${e}`,
    )
    return { ran: false, reason: 'backup-failed', feesCorrected: 0 }
  }

  // Fee correction + net backfill + latch commit atomically. Order is load-bearing:
  // the net backfill (step 3) reads total_fees_precise AFTER the fee correction (step
  // 2), so allocated rows use the corrected fee rather than the stale 0.
  let feesCorrected = 0
  const run = conn.transaction(() => {
    const info = conn.prepare(CORRECT_FEES_SQL).run()
    feesCorrected = info.changes
    conn.prepare(BACKFILL_NET_SQL).run()
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(NET_PRECISE_MIGRATION_LATCH_KEY)
  })

  try {
    run()
  } catch (e) {
    console.error(
      `[FE db] net-precise migration: transaction failed and rolled back, ` +
        `data left untouched: ${e}`,
    )
    return { ran: false, reason: 'transaction-failed', feesCorrected: 0 }
  }

  console.info(
    `[FE db] net-precise migration: corrected ${feesCorrected} stale-fee row(s) ` +
      `and backfilled net_pnl_precise`,
  )
  return { ran: true, feesCorrected }
}
