// Dave #9 (schema 48) — seed the point-in-time goal-history tables.
//
// Registered UNCONDITIONALLY in migrateAfterSchema (runs every launch), like
// migrateRuleBreaksTaxonomy: a version gate would silently skip fresh installs
// (priorVersion 0). Self-guards via COUNT(*) seed-if-empty per table, so it is
// idempotent and never touches a history the save hook has grown. The tables
// themselves are created by CREATE TABLE IF NOT EXISTS in SCHEMA_SQL (the
// cash_events v39 precedent) — this step only writes the epoch rows.
//
// SEED RULES (founder-locked):
//   profit_target_history — seeds UNCONDITIONALLY: the epoch row carries the
//     CURRENT stored daily_profit_target, parsed exactly the way the old
//     analytics read did (absent / non-finite / negative ⇒ 0 = no goal). With
//     the epoch row in place, every day resolves and the pre-history past
//     computes IDENTICALLY to the old current-value behavior.
//   max_loss_history — seeds ONLY when the settings row genuinely EXISTS (the
//     stored_keys row-existence rule, settings/repo.ts:151-158). getSettings
//     default-fills 500 for a missing row; seeding that fill would fabricate a
//     limit the user never set. An unparseable stored value is equally unset.
//     REALITY NOTE: SCHEMA_SQL seeds the max_daily_loss row ('500') on every
//     DB via INSERT OR IGNORE and runs before this step, so in practice the
//     row always exists and the epoch row carries the stored value (500 until
//     the user changes it — the same value the dashboard already shows). The
//     absent branch is defensive, pinned by the harness fixture [A1b].
//
// Type-only better-sqlite3 import so the module stays harness-testable
// (the migrate-*.ts convention).

import type Database from 'better-sqlite3'
import { EPOCH_EFFECTIVE_FROM } from '@/core/analytics/giveback'

export function migrateHistorySeeds(db: Database.Database): void {
  const count = (table: string): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  const readSetting = db.prepare('SELECT value FROM settings WHERE key = ?')

  if (count('profit_target_history') === 0) {
    const row = readSetting.get('daily_profit_target') as { value: string } | undefined
    const parsed = row ? Number.parseFloat(row.value) : 0
    const value = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    db.prepare('INSERT INTO profit_target_history (effective_from, value) VALUES (?, ?)').run(
      EPOCH_EFFECTIVE_FROM,
      value,
    )
  }

  if (count('max_loss_history') === 0) {
    const row = readSetting.get('max_daily_loss') as { value: string } | undefined
    if (row) {
      const parsed = Number.parseFloat(row.value)
      if (Number.isFinite(parsed) && parsed >= 0) {
        db.prepare('INSERT INTO max_loss_history (effective_from, value) VALUES (?, ?)').run(
          EPOCH_EFFECTIVE_FROM,
          parsed,
        )
      }
    }
  }
}
