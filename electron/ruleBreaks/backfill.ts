// Rule-breaks backfill — PURE core.
//
// Links every day's rule-breaks into the journal_rule_break junction, resurrecting any
// label that exists in a day's history but not in the vocabulary. journal.rule_breaks is
// NEVER modified — it stays as the permanent fallback (the mistakes-backfill PRESERVE
// model), which is also what makes the pre-migration .bak a complete recovery source.
//
// SCOPE IS DATA-DERIVED, NEVER HARDCODED. A fixed list is the very defect this model
// repairs (2f792ce), so the labels come out of the data: whatever a given user actually
// tagged is what gets linked, on their machine.
//
// ORPHANS RESURRECT AS ARCHIVED (is_custom = 1, is_archived = 1), which diverges from the
// mistakes/catalyst backfills (they create ACTIVE rows) and follows the journal-rules
// migration instead. The reason: a rule-break label present in day history but absent from
// the vocabulary is one the user REMOVED or RENAMED. Re-adding it to their active picker
// overrides that choice. Archived preserves the history, keeps it counting in Analytics
// (the rollup JOIN does not filter is_archived — the mistakes precedent, mistakes/repo.ts:
// 62-63), and leaves Restore one click away. That is the "archived, not deleted" promise.
//
// Electron-free (type-only better-sqlite3 import) so it is unit-testable against a real
// in-memory engine and reusable by a future Postgres repo. The version gate / settings
// latch / pre-migration backup live in the wrapper, never here.

import type Database from 'better-sqlite3'

export interface RuleBreaksBackfillReport {
  /** Orphan labels minted as ARCHIVED, is_custom = 1 defs. */
  defsCreated: number
  /** Junction rows actually inserted (0 on a re-run — INSERT OR IGNORE). */
  linksCreated: number
  /** The verbatim orphan labels resurrected, in insertion order. */
  resurrectedNames: string[]
}

// VERBATIM copy of electron/analytics/get.ts:875-883. COPIED, not imported: that module is
// electron-side. JSON-or-[] with NO comma fallback — the CSV fallback belongs to the
// SETTINGS vocabulary parser and must never leak into how a DAY's array is read, or a
// malformed day cell would silently split into phantom labels.
function parseRuleBreaks(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map((s) => String(s)).filter(Boolean) : []
  } catch {
    return []
  }
}

export function backfillRuleBreaks(db: Database.Database): RuleBreaksBackfillReport {
  const report: RuleBreaksBackfillReport = {
    defsCreated: 0,
    linksCreated: 0,
    resurrectedNames: [],
  }

  // The WHERE clause — and therefore the ROW SET — is VERBATIM from the analytics rollup
  // (electron/analytics/get.ts:965-968), so the migration can never read a different set of
  // days than the rollup the user is looking at. That is the usage.ts law, and it is the
  // part that must not drift.
  //
  // ORDER BY date is a DELIBERATE ADDITION, not present in the rollup (which does not care
  // about row order). It makes orphan recovery deterministic: resurrected defs take their
  // sort_position in the order they are first encountered, so the same journal always
  // produces the same vocabulary ordering — on a re-run, on another machine, in a fixture.
  // If you diff the two SELECTs, this is the only difference, and it is on purpose.
  const rows = db
    .prepare(`
      SELECT date, rule_breaks FROM journal
      WHERE rule_breaks IS NOT NULL AND rule_breaks != '' AND rule_breaks != '[]'
      ORDER BY date
    `)
    .all() as { date: string; rule_breaks: string }[]

  if (rows.length === 0) return report

  // Case-insensitive, archived-inclusive lookup. There can be at most ONE row per
  // lower(name) (ux_rule_break_def_name is NON-partial), so this either finds the single
  // match — active OR archived — or there is none.
  const findStmt = db.prepare(
    'SELECT id FROM rule_break_def WHERE lower(name) = lower(?) LIMIT 1',
  )
  const maxSortStmt = db.prepare(
    'SELECT COALESCE(MAX(sort_position), -1) + 1 AS n FROM rule_break_def',
  )
  const insertDefStmt = db.prepare(
    'INSERT INTO rule_break_def (name, sort_position, is_custom, is_archived) VALUES (?, ?, 1, 1)',
  )
  const insertLinkStmt = db.prepare(
    'INSERT OR IGNORE INTO journal_rule_break (date, rule_break_def_id) VALUES (?, ?)',
  )

  const defCache = new Map<string, number>() // lower(name) -> def id
  const findOrCreateDef = (name: string): number => {
    const key = name.toLowerCase()
    const cached = defCache.get(key)
    if (cached !== undefined) return cached
    const existing = findStmt.get(name) as { id: number } | undefined
    let id: number
    if (existing) {
      id = existing.id
    } else {
      const { n } = maxSortStmt.get() as { n: number }
      const info = insertDefStmt.run(name, n)
      id = Number(info.lastInsertRowid)
      report.defsCreated++
      report.resurrectedNames.push(name)
    }
    defCache.set(key, id)
    return id
  }

  for (const row of rows) {
    // Dedup WITHIN the day on lower(trim()) — the composite PK forbids a duplicate pair
    // anyway, but doing it here keeps linksCreated honest (an INSERT OR IGNORE that hits
    // the PK reports 0 changes, so a raw ["A","A"] would otherwise look like a no-op run).
    const seenInRow = new Set<string>()
    for (const raw of parseRuleBreaks(row.rule_breaks)) {
      const name = String(raw).trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seenInRow.has(key)) continue
      seenInRow.add(key)
      const defId = findOrCreateDef(name)
      const info = insertLinkStmt.run(row.date, defId)
      report.linksCreated += info.changes // 0 when the link already existed (idempotent)
    }
  }

  return report
}
