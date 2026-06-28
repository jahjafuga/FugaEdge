// Journal-rules data-model migration (schema 36 -> 37) — journal rules go from a bare
// string[] to JournalRule[] ({id, name, archived}). This beat registers the
// migration + bumps the version but converts NO DATA: the body is a logged
// no-op behind a shape-detection guard. Beat 2 fills in the actual conversion
// (settings.journal_rules string NAMES -> {id,name,archived} objects; remap
// journal.rules_followed/rule_violations from NAMES to IDS; resurrect orphaned
// names as archived rules) behind this SAME guard.
//
// Registered UNCONDITIONALLY in migrateAfterSchema (runs every launch), like the
// catalyst/mistakes migrations; the schema-37 bump is for release-tracking, not
// a gate. Type-only better-sqlite3 import so the guard is unit-testable under
// vitest (importing the native binary there fails — the migrate-*.ts convention).
import type Database from 'better-sqlite3'
import { convertLegacyJournalRules } from '@/core/journal/rules'

/** The shape settings.journal_rules is currently stored in. */
export type JournalRulesShape =
  | 'absent' // no settings row
  | 'unparseable' // not JSON, not an array, or a mixed/partial array
  | 'empty' // []
  | 'legacy-strings' // string[] (the OLD model — Beat 2 converts THIS)
  | 'objects' // JournalRule[] (already migrated — idempotent skip)

/**
 * Detect — WITHOUT mutating — whether settings.journal_rules is still the OLD
 * string[] shape or the NEW JournalRule[] shape. The safety primitive Beat 2's
 * conversion gates on: convert only 'legacy-strings', skip 'objects' (so re-runs
 * are idempotent), and refuse to touch 'unparseable' (mixed/corrupt). Pure
 * string -> enum; exported for Beat 2 and its tests.
 */
export function detectJournalRulesShape(value: string | undefined): JournalRulesShape {
  if (value == null) return 'absent'
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return 'unparseable'
  }
  if (!Array.isArray(parsed)) return 'unparseable'
  if (parsed.length === 0) return 'empty'
  if (parsed.every((r) => typeof r === 'string')) return 'legacy-strings'
  if (
    parsed.every(
      (r) =>
        r != null &&
        typeof r === 'object' &&
        'id' in (r as object) &&
        'name' in (r as object),
    )
  ) {
    return 'objects'
  }
  return 'unparseable' // mixed / partial — Beat 2 decides; Beat 1 never touches it
}

/**
 * Beat 2: convert the legacy string[] model to JournalRule[] + remap every
 * journal row's NAME refs to rule IDS, resurrecting orphaned names as ARCHIVED
 * rules — all in ONE transaction (all-or-nothing). Gated on shape: converts only
 * 'legacy-strings'; 'objects' is an idempotent skip; 'absent'/'empty' have
 * nothing to convert; 'unparseable' (mixed/corrupt) is logged and left untouched.
 */
export function migrateJournalRulesToObjects(conn: Database.Database): void {
  const row = conn
    .prepare("SELECT value FROM settings WHERE key = 'journal_rules'")
    .get() as { value: string } | undefined
  const shape = detectJournalRulesShape(row?.value)

  if (shape !== 'legacy-strings') {
    if (shape === 'unparseable') {
      console.warn(
        '[FE migrate] journal-rules: settings.journal_rules is unparseable/mixed; skipping conversion (left untouched)',
      )
    }
    return // objects (already migrated) / absent / empty / unparseable -> no-op
  }

  // shape === 'legacy-strings' guarantees row is non-null.
  const journalRows = conn
    .prepare('SELECT date, rules_followed, rule_violations FROM journal')
    .all() as { date: string; rules_followed: string; rule_violations: string }[]

  const { newRulesList, rowUpdates } = convertLegacyJournalRules(row!.value, journalRows)

  const updateRow = conn.prepare(
    'UPDATE journal SET rules_followed = ?, rule_violations = ? WHERE date = ?',
  )
  const updateSettings = conn.prepare(
    "UPDATE settings SET value = ? WHERE key = 'journal_rules'",
  )

  // ATOMIC: every row remap + the settings rewrite in ONE transaction. A throw
  // rolls the whole thing back, leaving the original string data intact — a
  // half-migration (settings converted but rows still names, or vice versa) is
  // impossible.
  const tx = conn.transaction(() => {
    for (const u of rowUpdates) {
      updateRow.run(
        JSON.stringify(u.rules_followed),
        JSON.stringify(u.rule_violations),
        u.date,
      )
    }
    updateSettings.run(JSON.stringify(newRulesList))
  })
  tx()

  const archived = newRulesList.filter((r) => r.archived).length
  const refs = rowUpdates.reduce(
    (s, u) => s + u.rules_followed.length + u.rule_violations.length,
    0,
  )
  console.info(
    `[FE migrate] journal-rules converted: ${newRulesList.length - archived} active + ${archived} resurrected archived orphan(s); ${rowUpdates.length} journal rows remapped; ${refs} refs preserved`,
  )
}
