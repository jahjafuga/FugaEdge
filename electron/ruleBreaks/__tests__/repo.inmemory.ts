// In-memory harness for the 3b-1 READ SWAP: the junction becomes authoritative.
//
// WHY NOT vitest: better-sqlite3 is built for Electron's ABI, so it throws under vitest's
// node. This runs under Electron's own node against a REAL engine, purely in-memory. The
// whole point of this beat is that a JOIN merges what a JSON column could not, so the SQL
// must actually execute — a capturing shim could not prove it.
//
// Bundle + run: npm run test:rule-breaks-repo

import Database from 'better-sqlite3'
import { migrateRuleBreaksTaxonomy } from '../../db/migrate-rule-breaks-taxonomy'
import {
  findOrCreateRuleBreakDefId,
  readRuleBreakNamesForDate,
  writeRuleBreakLinksForDate,
  readRuleBreaksByDate,
} from '../repo'
import { computeRuleBreaks } from '@/core/analytics/ruleBreaks'

// ── tiny runner (the backfill-harness convention) ───────────────────────────
let passed = 0
let failed = 0
const failures: string[] = []
function it(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log('  PASS  ' + name)
  } catch (e) {
    failed++
    const msg = e instanceof Error ? e.message : String(e)
    failures.push(name + '\n        -> ' + msg)
    console.log('  FAIL  ' + name + '\n        -> ' + msg)
  }
}
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}
function eqJson(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${msg}\n           expected: ${b}\n           actual:   ${a}`)
}

function freshDb(vocab: string[] = []): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`CREATE TABLE journal (date TEXT PRIMARY KEY, rule_breaks TEXT NOT NULL DEFAULT '[]')`)
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
  db.prepare("INSERT INTO settings (key, value) VALUES ('daily_rule_break_list', ?)").run(
    JSON.stringify(vocab),
  )
  migrateRuleBreaksTaxonomy(db)
  return db
}

/** Seed a day the way a PRE-swap DB looks: the column only, no junction rows. */
function seedColumnOnly(db: Database.Database, date: string, breaks: string[]): void {
  db.prepare('INSERT INTO journal (date, rule_breaks) VALUES (?, ?)').run(
    date,
    JSON.stringify(breaks),
  )
}

/** The OLD rollup, VERBATIM from analytics/get.ts:963-971 — kept here so parity is asserted
 *  against the real thing this beat replaces, not against a paraphrase of it. */
function columnRollup(db: Database.Database): Map<string, string[]> {
  const rows = db
    .prepare(`
      SELECT date, rule_breaks FROM journal
      WHERE rule_breaks IS NOT NULL AND rule_breaks != '' AND rule_breaks != '[]'
    `)
    .all() as { date: string; rule_breaks: string }[]
  const parse = (raw: string | null): string[] => {
    if (!raw) return []
    try {
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr.map((s) => String(s)).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return new Map(rows.map((r) => [r.date, parse(r.rule_breaks)]))
}

/** Link a day's column labels into the junction — what the 3a backfill did. */
function linkFromColumn(db: Database.Database, date: string): void {
  const raw = (db.prepare('SELECT rule_breaks FROM journal WHERE date = ?').get(date) as {
    rule_breaks: string
  }).rule_breaks
  const names = JSON.parse(raw) as string[]
  const seen = new Set<string>()
  for (const n of names) {
    const key = n.trim().toLowerCase()
    if (!key || seen.has(key)) continue // the backfill's CASE-INSENSITIVE dedup
    seen.add(key)
    const id = findOrCreateRuleBreakDefId(db, n.trim())
    db.prepare(
      'INSERT OR IGNORE INTO journal_rule_break (date, rule_break_def_id) VALUES (?, ?)',
    ).run(date, id)
  }
}

const links = (db: Database.Database) =>
  db
    .prepare(`
      SELECT j.date AS date, d.name AS name FROM journal_rule_break j
      JOIN rule_break_def d ON d.id = j.rule_break_def_id ORDER BY j.date, d.sort_position
    `)
    .all() as { date: string; name: string }[]
const column = (db: Database.Database, date: string) =>
  (db.prepare('SELECT rule_breaks FROM journal WHERE date = ?').get(date) as
    | { rule_breaks: string }
    | undefined)?.rule_breaks
const defs = (db: Database.Database) =>
  db
    .prepare('SELECT id, name, is_custom, is_archived FROM rule_break_def ORDER BY sort_position, id')
    .all() as { id: number; name: string; is_custom: number; is_archived: number }[]

console.log('rule-breaks READ SWAP (3b-1) — in-memory harness\n')

// ═══════════════ [A] THE CASE-DRIFT MERGE — a VISIBLE Analytics change ═══════════════

it('[A] CASE DRIFT: the COLUMN rollup sees TWO buckets (today\'s behaviour)', () => {
  const db = freshDb(['Overtrading'])
  seedColumnOnly(db, '2026-03-02', ['Overtrading', 'overtrading'])
  const byDate = columnRollup(db)
  eqJson(byDate.get('2026-03-02'), ['Overtrading', 'overtrading'], 'the column keeps both')
  const out = computeRuleBreaks(byDate, new Map([['2026-03-02', -100]]))
  assert(out.byRuleBreak.length === 2, `TODAY: two buckets, got ${out.byRuleBreak.length}`)
  db.close()
})

it('[A] CASE DRIFT: the JUNCTION rollup MERGES them into ONE bucket (the change)', () => {
  const db = freshDb(['Overtrading'])
  seedColumnOnly(db, '2026-03-02', ['Overtrading', 'overtrading'])
  linkFromColumn(db, '2026-03-02')
  const byDate = readRuleBreaksByDate(db)
  eqJson(byDate.get('2026-03-02'), ['Overtrading'], 'the junction carries ONE def')
  const out = computeRuleBreaks(byDate, new Map([['2026-03-02', -100]]))
  assert(out.byRuleBreak.length === 1, `AFTER: one bucket, got ${out.byRuleBreak.length}`)
  eqJson(
    out.byRuleBreak.map((b) => [b.label, b.day_count, b.net_pnl]),
    [['Overtrading', 1, -100]],
    'the merged bucket carries the day ONCE, with the full net',
  )
  db.close()
})

it('[A] the merge does NOT double-count the day (day_count stays 1, net is not summed twice)', () => {
  const db = freshDb(['Overtrading'])
  seedColumnOnly(db, '2026-03-02', ['Overtrading', 'overtrading'])
  linkFromColumn(db, '2026-03-02')
  const before = computeRuleBreaks(columnRollup(db), new Map([['2026-03-02', -100]]))
  const after = computeRuleBreaks(readRuleBreaksByDate(db), new Map([['2026-03-02', -100]]))
  // Both agree the DAY is flawed exactly once — only the per-label split changes.
  assert(before.days_with_any_break === 1 && after.days_with_any_break === 1, 'one flawed day either way')
  assert(before.flawed_day_net_pnl === after.flawed_day_net_pnl, 'the day-level net is unchanged')
  db.close()
})

// ═══════════════ [B] PARITY on every other shape ═══════════════

it('[B] PARITY: for non-drifted history, the junction rollup EQUALS the column rollup', () => {
  const db = freshDb(['Ignored daily max loss', 'Chased entry'])
  seedColumnOnly(db, '2026-07-01', ['Ignored daily max loss', 'Chased entry'])
  seedColumnOnly(db, '2026-07-02', ['Chased entry'])
  seedColumnOnly(db, '2026-07-03', ['Revenge traded']) // orphan -> resurrected def
  seedColumnOnly(db, '2026-07-13', ['Ignored daily max loss'])
  for (const d of ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-13']) linkFromColumn(db, d)

  const net = new Map([
    ['2026-07-01', -250],
    ['2026-07-02', 100],
    ['2026-07-03', -50],
    ['2026-07-13', 0],
    ['2026-07-20', 400], // a CLEAN day with trades and no breaks
  ])
  const before = computeRuleBreaks(columnRollup(db), net)
  const after = computeRuleBreaks(readRuleBreaksByDate(db), net)
  eqJson(after, before, 'the numbers a user sees must be IDENTICAL')
  db.close()
})

it('[B] PARITY: a day with NO breaks stays CLEAN under the junction rollup', () => {
  const db = freshDb(['Chased entry'])
  seedColumnOnly(db, '2026-07-01', ['Chased entry'])
  linkFromColumn(db, '2026-07-01')
  const net = new Map([['2026-07-01', -100], ['2026-07-02', 250]])
  const after = computeRuleBreaks(readRuleBreaksByDate(db), net)
  assert(after.clean_days === 1 && after.days_with_any_break === 1, `clean=${after.clean_days} flawed=${after.days_with_any_break}`)
  db.close()
})

it('[B] the rollup does NOT filter is_archived (the mistakes precedent, get.ts:914-915)', () => {
  const db = freshDb(['Chased entry'])
  seedColumnOnly(db, '2026-07-01', ['Chased entry'])
  linkFromColumn(db, '2026-07-01')
  db.prepare("UPDATE rule_break_def SET is_archived = 1 WHERE name = 'Chased entry'").run()
  const byDate = readRuleBreaksByDate(db)
  eqJson(byDate.get('2026-07-01'), ['Chased entry'], 'an ARCHIVED def still counts in Analytics')
  db.close()
})

// ═══════════════ [C] readRuleBreakNamesForDate ═══════════════

it('[C] readRuleBreakNamesForDate returns NAMES (string[]), unchanged shape', () => {
  const db = freshDb(['Ignored daily max loss', 'Chased entry'])
  seedColumnOnly(db, '2026-07-01', ['Chased entry', 'Ignored daily max loss'])
  linkFromColumn(db, '2026-07-01')
  const out = readRuleBreakNamesForDate(db, '2026-07-01')
  assert(Array.isArray(out) && out.every((s) => typeof s === 'string'), 'string[]')
  eqJson(out.slice().sort(), ['Chased entry', 'Ignored daily max loss'], 'both names come back')
  db.close()
})

it('[C] a day with no junction rows reads back as []', () => {
  const db = freshDb(['Chased entry'])
  eqJson(readRuleBreakNamesForDate(db, '2026-07-01'), [], 'no row -> []')
  db.close()
})

it('[C] readRuleBreakNamesForDate reflects the RENAMED def (the whole point of 3b-2)', () => {
  const db = freshDb(['Overtrading'])
  seedColumnOnly(db, '2026-07-01', ['Overtrading'])
  linkFromColumn(db, '2026-07-01')
  db.prepare("UPDATE rule_break_def SET name = 'Over-trading' WHERE name = 'Overtrading'").run()
  eqJson(readRuleBreakNamesForDate(db, '2026-07-01'), ['Over-trading'], 'the JOIN serves the CURRENT name')
  // ...and the frozen column still says the old one. That divergence is WHY the column
  // cannot survive rename, and it is what 3b-2 retires.
  eqJson(column(db, '2026-07-01'), '["Overtrading"]', 'the column is now stale — by design, until 3b-2')
  db.close()
})

// ═══════════════ [D][E][F] the junction WRITE half ═══════════════

it('[D] writeRuleBreakLinksForDate creates the junction rows', () => {
  const db = freshDb(['Ignored daily max loss', 'Chased entry'])
  seedColumnOnly(db, '2026-07-01', [])
  writeRuleBreakLinksForDate(db, '2026-07-01', ['Chased entry', 'Ignored daily max loss'])
  eqJson(
    links(db).map((l) => l.name).sort(),
    ['Chased entry', 'Ignored daily max loss'],
    'both linked',
  )
  db.close()
})

it('[E] find-or-create: an unknown name mints an ACTIVE custom def (is_custom=1, is_archived=0)', () => {
  const db = freshDb(['Chased entry'])
  seedColumnOnly(db, '2026-07-01', [])
  writeRuleBreakLinksForDate(db, '2026-07-01', ['Brand new rule'])
  const d = defs(db).find((x) => x.name === 'Brand new rule')
  assert(!!d, 'the def was created')
  assert(d!.is_custom === 1, `is_custom must be 1, got ${d!.is_custom}`)
  assert(d!.is_archived === 0, `is_archived must be 0 (ACTIVE — it is in their picker NOW), got ${d!.is_archived}`)
  db.close()
})

it('[E] find-or-create is CASE-INSENSITIVE — it never mints a twin', () => {
  const db = freshDb(['Overtrading'])
  seedColumnOnly(db, '2026-07-01', [])
  writeRuleBreakLinksForDate(db, '2026-07-01', ['overtrading'])
  assert(defs(db).length === 1, `expected 1 def, got ${defs(db).length}`)
  eqJson(links(db).map((l) => l.name), ['Overtrading'], 'linked to the EXISTING def')
  db.close()
})

it('[F] REMOVING a label deletes its junction row and leaves the others', () => {
  const db = freshDb(['Ignored daily max loss', 'Chased entry'])
  seedColumnOnly(db, '2026-07-01', [])
  writeRuleBreakLinksForDate(db, '2026-07-01', ['Chased entry', 'Ignored daily max loss'])
  writeRuleBreakLinksForDate(db, '2026-07-01', ['Chased entry']) // the user un-toggled one
  eqJson(links(db).map((l) => l.name), ['Chased entry'], 'only the surviving link remains')
  db.close()
})

it('[F] clearing ALL labels empties the junction for that day', () => {
  const db = freshDb(['Chased entry'])
  seedColumnOnly(db, '2026-07-01', [])
  writeRuleBreakLinksForDate(db, '2026-07-01', ['Chased entry'])
  writeRuleBreakLinksForDate(db, '2026-07-01', [])
  eqJson(links(db), [], 'no links left')
  db.close()
})

it('[F] a re-save with the SAME set is idempotent (no duplicate rows, no def churn)', () => {
  const db = freshDb(['Chased entry'])
  seedColumnOnly(db, '2026-07-01', [])
  writeRuleBreakLinksForDate(db, '2026-07-01', ['Chased entry'])
  const d1 = defs(db).length
  writeRuleBreakLinksForDate(db, '2026-07-01', ['Chased entry'])
  eqJson(links(db).map((l) => l.name), ['Chased entry'], 'still exactly one link')
  assert(defs(db).length === d1, 'no new defs minted on a re-save')
  db.close()
})

it('[F] writing links for a day with NO journal row is refused by the FK', () => {
  const db = freshDb(['Chased entry'])
  let threw = false
  try {
    writeRuleBreakLinksForDate(db, '2026-07-01', ['Chased entry'])
  } catch {
    threw = true
  }
  assert(threw, 'journal_rule_break.date REFERENCES journal(date) — the row must exist first')
  db.close()
})

console.log(`\n${passed} passed / ${passed + failed} total`)
if (failed > 0) {
  console.log('\nFAILURES:')
  for (const f of failures) console.log('  FAIL  ' + f)
  process.exit(1)
}
process.exit(0)
