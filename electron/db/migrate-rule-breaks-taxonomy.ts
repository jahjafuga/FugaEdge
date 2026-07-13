// Rule-breaks taxonomy — the foundation of the id-stable rule-break model.
//
// Creates the vocabulary table (rule_break_def) + the day junction
// (journal_rule_break) and seeds the vocabulary ONCE, from the user's OWN
// settings.daily_rule_break_list. Moves no day data — the backfill
// (electron/ruleBreaks/backfill.ts) links the junction in a later, gated step.
//
// Registered UNCONDITIONALLY (no version gate), like migrateMistakesTaxonomy: a
// version gate would silently skip fresh installs (priorVersion 0), leaving a new
// user with no vocabulary and no junction. Self-guards via CREATE ... IF NOT EXISTS
// and a COUNT(*) seed-if-empty check. Type-only better-sqlite3 import so it stays
// unit-testable (the migrate-*.ts convention).
//
// THE SEED SOURCE IS THE USER'S OWN LIST, NOT A HARDCODED ONE. Seeding from a fixed
// list is exactly the defect that orphaned the catalyst vocabulary (2f792ce), and the
// mistakes backfill's "a picklist-only string produces no def" behaviour would silently
// drop a rule the user configured but has not yet broken. So:
//   settings key PRESENT -> seed from it verbatim (even when it is [] — deleting every
//                           rule is a real user state and must not be overridden)
//   settings key ABSENT  -> seed DEFAULT_RULE_BREAKS (a fresh install, after the key's
//                           SCHEMA_SQL seed is retired)
//
// UNIQUENESS IS NON-PARTIAL — UNIQUE(lower(name)) over ALL rows, not just active ones.
// catalyst/mistakes use a partial index (WHERE is_archived = 0), which lets an archived
// row coexist with a live re-creation of the same name; under a junction that produces two
// defs sharing a name, which silently merges them in the Analytics rollup. Reserving the
// name even while archived forces UNARCHIVE instead of duplicate-create, which is the
// correct behaviour for a vocabulary whose whole purpose is preserving history.

import type Database from 'better-sqlite3'

/** The four shipped defaults — the SAME strings SCHEMA_SQL seeds into
 *  settings.daily_rule_break_list (schema.ts:716-719), verbatim. A name matching one of
 *  these seeds with is_custom = 0, which makes it PERMANENT: the delete guard only ever
 *  hard-deletes an is_custom = 1 row with zero usages, so a default can be archived but
 *  never removed. */
export const DEFAULT_RULE_BREAKS: string[] = [
  'Gave back >30% after daily goal',
  'Ignored daily max loss',
  'Low accuracy (<50% on 5+ trades)',
  '3 consecutive outsized losses (>4%)',
]

// VERBATIM copy of electron/settings/repo.ts:67-80. COPIED, not imported: that module
// value-imports openDatabase (the native binary), which a migrate-*.ts may not touch.
//
// The trailing split(',') is a LEGACY CSV fallback, and it is a hazard, not a protection —
// it would shatter a comma-bearing label. It is reproduced anyway, exactly, because the
// migration MUST see the vocabulary the way getSettings sees it. If a legacy value would
// split in the app, it must split identically here, or the def table and the app's view of
// the vocabulary diverge. (In practice the app always writes JSON.stringify, so a stored
// comma-label starts with '[' and takes the JSON path, where the comma is safe.)
function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed)
      if (Array.isArray(arr)) return arr.map((s) => String(s)).filter(Boolean)
    } catch {
      // fall through
    }
  }
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
}

export function migrateRuleBreaksTaxonomy(conn: Database.Database): void {
  // 1. Vocabulary table. Flat list — no axis (the catalyst_def shape; mistakes' axis is
  //    the only structural difference between the two vocabularies).
  conn.exec(`
    CREATE TABLE IF NOT EXISTS rule_break_def (
      id            INTEGER PRIMARY KEY,
      name          TEXT NOT NULL,
      sort_position INTEGER NOT NULL DEFAULT 0,
      is_custom     INTEGER NOT NULL DEFAULT 0,
      is_archived   INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  // NON-PARTIAL, case-insensitive uniqueness — see the header. An archived row KEEPS its
  // name reserved, so a name can never be held by two defs at once.
  conn.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_rule_break_def_name
      ON rule_break_def (lower(name))
  `)
  conn.exec(`
    CREATE INDEX IF NOT EXISTS ix_rule_break_def_sort
      ON rule_break_def (sort_position)
  `)

  // 2. Junction — many-to-many journal days / rule_break_def. Composite PK (date,
  //    rule_break_def_id) makes each (day, rule) pair unique, so a day can never break the
  //    same rule twice. date CASCADEs on journal-row delete; rule_break_def_id is RESTRICT
  //    so a referenced vocabulary row cannot be hard-deleted (archive instead). The
  //    trade_mistake shape, exactly.
  conn.exec(`
    CREATE TABLE IF NOT EXISTS journal_rule_break (
      date              TEXT    NOT NULL REFERENCES journal(date)      ON DELETE CASCADE,
      rule_break_def_id INTEGER NOT NULL REFERENCES rule_break_def(id) ON DELETE RESTRICT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (date, rule_break_def_id)
    )
  `)
  // Reverse lookup: "which days carry rule_break_def X" — the delete guard's usage count.
  conn.exec(
    'CREATE INDEX IF NOT EXISTS ix_journal_rule_break_def ON journal_rule_break (rule_break_def_id, date)',
  )

  // 3. Seed the vocabulary — ONLY when rule_break_def is empty (seed-if-empty, the
  //    catalyst/mistakes convention). A user who later renames/archives/adds is never
  //    re-seeded.
  const { n } = conn
    .prepare('SELECT COUNT(*) AS n FROM rule_break_def')
    .get() as { n: number }
  if (n !== 0) return

  const row = conn
    .prepare("SELECT value FROM settings WHERE key = 'daily_rule_break_list'")
    .get() as { value: string } | undefined
  // Key ABSENT (fresh install) -> the shipped defaults. Key PRESENT -> the user's list,
  // verbatim, INCLUDING an empty one.
  const source = row === undefined ? DEFAULT_RULE_BREAKS : parseStringArray(row.value)

  const isDefault = new Set(DEFAULT_RULE_BREAKS.map((s) => s.toLowerCase()))
  const insert = conn.prepare(
    'INSERT INTO rule_break_def (name, sort_position, is_custom, is_archived) VALUES (?, ?, ?, 0)',
  )

  // LOAD-BEARING dedup (the catalyst backfill's `seen` guard, catalyst/backfill.ts:77-86).
  // settings/repo.ts's write branch dedups NOTHING — not case-variants, not even exact
  // duplicates — so the stored list can legitimately hold ["Overtrading","overtrading"] or
  // ["Overtrading","Overtrading"]. Both collide under ux_rule_break_def_name and would
  // throw, taking the boot down. First-seen wins; sort_position preserves the user's order.
  const seen = new Set<string>()
  let sort = 0
  for (const raw of source) {
    const name = String(raw).trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    insert.run(name, sort++, isDefault.has(key) ? 0 : 1)
  }
}
