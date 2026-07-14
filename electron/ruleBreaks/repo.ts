// Rule-breaks junction repo — the SQL the 3b-1 read-swap runs. PURE in the migrate-*.ts sense:
// a type-only better-sqlite3 import, the connection passed in. That is what lets the JOIN be
// tested against a REAL in-memory engine (electron/ruleBreaks/__tests__/repo.inmemory.ts) — a
// capturing shim can assert SQL text, but it cannot prove that lower(name) actually merges
// "Overtrading" and "overtrading" into one bucket, which is the whole claim of this beat.
//
// THE JUNCTION IS NOW AUTHORITATIVE. Analytics and the day view read journal_rule_break JOINed
// to rule_break_def, so they see the CURRENT name of each rule. journal.rule_breaks is still
// written (day/ruleBreaks.ts dual-writes it) but nothing READS it any more.
//
// NO is_archived FILTER ANYWHERE. A day that broke a since-archived rule still broke it, and
// dropping it would silently rewrite history. This is the mistakes precedent, verbatim
// (analytics/get.ts:914-915 JOINs mistake_def with no archived filter).

import type Database from 'better-sqlite3'

/** Find a def by CASE-INSENSITIVE name, or mint one.
 *
 *  A minted def is is_custom = 1 and **is_archived = 0 — ACTIVE**. That diverges from the 3a
 *  backfill, which resurrects orphans ARCHIVED, and the divergence is deliberate: the backfill
 *  recovers a label the user had already REMOVED from their vocabulary (re-adding it to their
 *  picker would override that choice), whereas this path fires because the user is tagging the
 *  label RIGHT NOW. It belongs in their picker.
 *
 *  The lookup is case-insensitive because ux_rule_break_def_name is UNIQUE(lower(name)) and
 *  NON-partial: there can be at most one row per lower(name), archived or not. A case-insensitive
 *  find is therefore not a heuristic — it is the only lookup the index permits. */
export function findOrCreateRuleBreakDefId(db: Database.Database, name: string): number {
  const found = db
    .prepare('SELECT id FROM rule_break_def WHERE lower(name) = lower(?) LIMIT 1')
    .get(name) as { id: number } | undefined
  if (found) return found.id

  const { n } = db
    .prepare('SELECT COALESCE(MAX(sort_position), -1) + 1 AS n FROM rule_break_def')
    .get() as { n: number }
  const info = db
    .prepare(
      'INSERT INTO rule_break_def (name, sort_position, is_custom, is_archived) VALUES (?, ?, 1, 0)',
    )
    .run(name, n)
  return Number(info.lastInsertRowid)
}

/** The day view's read: the CURRENT names of the rules broken on `date`, in vocabulary order. */
export function readRuleBreakNamesForDate(db: Database.Database, date: string): string[] {
  const rows = db
    .prepare(`
      SELECT d.name AS name
      FROM journal_rule_break j
      JOIN rule_break_def d ON d.id = j.rule_break_def_id
      WHERE j.date = ?
      ORDER BY d.sort_position, d.id
    `)
    .all(date) as { name: string }[]
  return rows.map((r) => r.name)
}

/** THE ANALYTICS ROLLUP — replaces the journal.rule_breaks scan at analytics/get.ts:963-968.
 *
 *  Emits exactly what computeRuleBreaks already takes (date -> label[]), so the pure aggregator
 *  is untouched. The one BEHAVIOUR change is the merge it inherits from the junction: a day whose
 *  column held ["Overtrading","overtrading"] was TWO buckets (computeRuleBreaks groups by the raw
 *  string, and cleanRuleBreaks dedups case-SENSITIVELY) and is now ONE. They are the same rule, so
 *  the merge is a correction — but it is a visible change in the numbers, and it is asserted
 *  explicitly in the harness rather than left for a user to discover. */
export function readRuleBreaksByDate(db: Database.Database): Map<string, string[]> {
  const rows = db
    .prepare(`
      SELECT j.date AS date, d.name AS name
      FROM journal_rule_break j
      JOIN rule_break_def d ON d.id = j.rule_break_def_id
      ORDER BY j.date, d.sort_position, d.id
    `)
    .all() as { date: string; name: string }[]

  const out = new Map<string, string[]>()
  for (const r of rows) {
    let arr = out.get(r.date)
    if (!arr) {
      arr = []
      out.set(r.date, arr)
    }
    arr.push(r.name)
  }
  return out
}

/** Replace a day's links with exactly `names` (find-or-creating any def it does not know).
 *
 *  REPLACE-ALL, not diff: the picker always sends the day's whole set, so "what the user wants"
 *  IS the argument. created_at is not read anywhere, so re-stamping it on a re-toggle costs
 *  nothing and the delete-then-insert keeps the code honest about its own semantics.
 *
 *  Ids are deduped AFTER resolution, so two case-variants of one rule collapse to a single link
 *  rather than colliding on the composite PK.
 *
 *  The caller must ensure the journal row exists: journal_rule_break.date REFERENCES journal(date),
 *  and SQLite does NOT apply INSERT OR IGNORE to foreign-key violations — a missing row throws,
 *  loudly, which is what we want. saveRuleBreaks upserts the column first for exactly this reason. */
export function writeRuleBreakLinksForDate(
  db: Database.Database,
  date: string,
  names: string[],
): void {
  const ids: number[] = []
  const seen = new Set<number>()
  for (const raw of names) {
    const name = String(raw).trim()
    if (!name) continue
    const id = findOrCreateRuleBreakDefId(db, name)
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  db.prepare('DELETE FROM journal_rule_break WHERE date = ?').run(date)
  const insert = db.prepare(
    'INSERT INTO journal_rule_break (date, rule_break_def_id) VALUES (?, ?)',
  )
  for (const id of ids) insert.run(date, id)
}
