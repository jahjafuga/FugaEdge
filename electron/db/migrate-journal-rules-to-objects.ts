// v0.2.6 Beat 1 SCAFFOLD (schema 36 -> 37) — journal rules go from a bare
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
 * Beat 1: detect + log ONLY. Reads the settings row to classify the shape, but
 * writes/deletes NOTHING (settings or journal). Beat 2 replaces the body below
 * with the real conversion, still gated on shape === 'legacy-strings'.
 */
export function migrateJournalRulesToObjects(conn: Database.Database): void {
  const row = conn
    .prepare("SELECT value FROM settings WHERE key = 'journal_rules'")
    .get() as { value: string } | undefined
  const shape = detectJournalRulesShape(row?.value)

  if (shape === 'legacy-strings') {
    console.info(
      '[FE migrate] journal-rules scaffold: legacy string[] detected; data conversion lands in Beat 2 (no-op this beat)',
    )
  }
  // 'objects' = already migrated (idempotent skip); 'absent' / 'empty' /
  // 'unparseable' = nothing to convert. Every branch is a no-op in Beat 1.
}
