// Rule-breaks recovery Beat 3a — schema 46 -> 47. The migration WRAPPER around the pure
// backfillRuleBreaks core: version gate + settings latch + a pre-migration backup CHECK +
// the work in one transaction (the latch lives INSIDE the txn, so a rollback un-sets it and
// the migration retries next launch).
//
// *** THE RETRY THIS PROMISES IS REAL -- BUT ONLY SINCE THE IN-PROGRESS MARKER. ***
// Until it shipped, this sentence was FALSE. db.exec(SCHEMA_SQL) (database.ts:185) DURABLY
// stamps _meta.schema_version BEFORE any migration in migrateAfterSchema runs, so the next boot
// read the NEW version and this migration's version gate returned 'already-migrated' -- BEFORE
// its latch, the one thing that knew it never ran, was ever consulted. A rolled-back migration
// was simply dead. The marker records the version the chain STARTED from and is cleared only on
// SUCCESS, so an unfinished run really is resumed. See src/core/db/migrationChain.ts.
//
// THE ONE DELIBERATE DIVERGENCE from migrate-mistakes-backfill / migrate-catalyst-backfill:
// this wrapper takes NO opts.backup closure. Theirs invoke the backup from inside
// migrateAfterSchema — that is, AFTER db.exec(SCHEMA_SQL) has re-stamped
// _meta.schema_version to the NEW version. Their .bak is therefore a ONE-WAY DOOR: restore
// it and the version gate reads the new stamp off the restored file, returns
// 'already-migrated', and the junction stays empty forever. Ours is taken by database.ts
// BEFORE SCHEMA_SQL (maybeBackupForRuleBreaksBackfill, openDatabase :168), so the .bak
// carries schema 46 and restores clean. All this wrapper does is VERIFY the copy landed, by
// reading a latch that only a successful copy sets. No backup, no migration.
//
// Type-only better-sqlite3 import — no node-only APIs here, so it stays unit-testable
// against a real in-memory engine (electron/ruleBreaks/__tests__/backfill.inmemory.ts).

import type Database from 'better-sqlite3'
import { backfillRuleBreaks, type RuleBreaksBackfillReport } from '../ruleBreaks/backfill'

/** Schema version at/after which the backfill is already applied. It runs only on DBs that
 *  predate it (priorVersion 1..46). */
export const RULE_BREAKS_BACKFILL_TARGET_SCHEMA_VERSION = 47

/** Written INSIDE the migration's transaction, so it doubles as the crash marker: a
 *  rolled-back backfill leaves it unset and the migration retries next launch. */
export const RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY = 'rule_breaks_backfill_migration_done'

/** Written by database.ts's maybeBackupForRuleBreaksBackfill, and ONLY once the file copy
 *  has actually succeeded. Reading it is how this pure module asks the one question it
 *  cannot answer itself: "is there a restorable .bak behind me?" Exported so database.ts
 *  writes the same key this module reads — one definition, not two that can drift. */
export const RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY = 'rule_breaks_backfill_backup_done'

export interface RuleBreaksBackfillMigrationResult {
  ran: boolean
  reason?:
    | 'fresh-install'
    | 'already-migrated'
    | 'latched'
    | 'inconsistent-state'
    | 'backup-failed'
    | 'transaction-failed'
  report?: RuleBreaksBackfillReport
}

export function migrateRuleBreaksBackfill(
  conn: Database.Database,
  priorVersion: number,
): RuleBreaksBackfillMigrationResult {
  // Guard 1 — version gate. Fresh installs have no day history, so nothing to link.
  //
  // The `>= TARGET` half is LOAD-BEARING and is NOT just a fast path in front of the latch.
  // journal.rule_breaks is frozen by the PRESERVE model: a day keeps the label it was tagged
  // with, forever, even after the user renames that rule in the vocabulary. So if this
  // migration ever runs a SECOND time against a DB where a def has since been renamed, the
  // core reads the old label out of the frozen column, does not find it in the vocabulary,
  // and faithfully resurrects it as a second def — leaving that day carrying the same
  // real-world rule TWICE under two names, and double-counted in the Analytics rollup. The
  // latch alone cannot defend that: a lost, corrupted or hand-edited latch is precisely the
  // scenario. The version gate is the backstop. Fixture [20] proves both halves — that the
  // wrapper refuses, and that the ungated core really does do the damage.
  if (priorVersion === 0) return { ran: false, reason: 'fresh-install' }
  if (priorVersion >= RULE_BREAKS_BACKFILL_TARGET_SCHEMA_VERSION) {
    return { ran: false, reason: 'already-migrated' }
  }

  // Guard 2 — settings latch.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') return { ran: false, reason: 'latched' }
  } catch {
    // settings unreadable on a versioned DB — wildly inconsistent, don't try to recover here.
    return { ran: false, reason: 'inconsistent-state' }
  }

  // Guard 3 — NEVER MIGRATE WITHOUT A BACKUP. database.ts took it before SCHEMA_SQL ran and
  // latches only on success, so an unset latch means no restorable .bak exists.
  //
  // THIS BRANCH IS UNREACHABLE FROM A REAL BOOT, AND IT IS KEPT ON PURPOSE. Every way
  // maybeBackupForRuleBreaksBackfill can return without setting the latch is already covered
  // by a gate above: priorVersion 0 and priorVersion >= 47 exit at guards 1-2, and BOTH of its
  // failure modes — the file copy and the latch write — now throw, which escapes openDatabase
  // before migrateAfterSchema is ever called. So in production this either passes or we never
  // arrive here at all.
  //
  // It stays because it is the INVARIANT, not the mechanism: "no backup, no migration." The
  // moment someone makes either of those failures non-fatal again — swallow the throw, log and
  // continue, wrap it "defensively" — this is the only thing standing between that change and a
  // silently un-backed-up migration. Deleting it would leave the invariant enforced by nothing
  // but a comment in another file. Fixture [13d] holds it live.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY) as { value: string } | undefined
    if (row?.value !== 'true') {
      console.error(
        '[FE db] rule-breaks-backfill migration: no pre-migration backup on record, aborting',
      )
      return { ran: false, reason: 'backup-failed' }
    }
  } catch {
    return { ran: false, reason: 'inconsistent-state' }
  }

  // Backfill + latch, atomically. A mid-run crash rolls back the resurrected defs, the
  // junction links AND the latch, so the migration retries next launch — and the core is
  // idempotent, so the retry is safe.
  let report: RuleBreaksBackfillReport | undefined
  const run = conn.transaction(() => {
    report = backfillRuleBreaks(conn)
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY)
  })

  try {
    run()
  } catch (e) {
    console.error(
      `[FE db] rule-breaks-backfill migration: transaction failed and rolled back, ` +
        `will retry next launch: ${e}`,
    )
    return { ran: false, reason: 'transaction-failed' }
  }

  console.info(
    `[FE db] rule-breaks-backfill migration: linked ${report!.linksCreated} day-rule pair(s)` +
      (report!.defsCreated > 0
        ? `; resurrected ${report!.defsCreated} archived label(s): ${report!.resurrectedNames.join(', ')}`
        : ''),
  )
  return { ran: true, report }
}
