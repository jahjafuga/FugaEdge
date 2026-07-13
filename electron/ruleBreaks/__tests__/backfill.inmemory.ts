// In-memory better-sqlite3 harness for the rule-breaks taxonomy + backfill (Beat 3a-1).
//
// WHY NOT vitest: better-sqlite3 is built for Electron's ABI (rebuild:sqlite), so it
// throws ERR_DLOPEN_FAILED under vitest's node. This harness runs under Electron's own
// node (ELECTRON_RUN_AS_NODE=1 electron <bundled cjs>) — a REAL engine, purely in-memory
// (`:memory:`, no files). Mirrors electron/mistakes/__tests__/backfill.inmemory.ts.
//
// Bundle + run (see package.json "test:rule-breaks-backfill").
//
// EVERY FIXTURE IS MANUFACTURED. No database on this machine has rule-break history worth
// migrating — the dev DB has one seeded row, Dave's backup predates the column, and the
// real journal has no journal rows at all. The transform is therefore proven HERE, and the
// real-DB lanes (3a-3) are smoke tests, not correctness tests.

import Database from 'better-sqlite3'
import {
  migrateRuleBreaksTaxonomy,
  DEFAULT_RULE_BREAKS,
} from '../../db/migrate-rule-breaks-taxonomy'
import { backfillRuleBreaks } from '../backfill'

// ── tiny test runner (the mistakes-harness convention) ──────────────────────
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

// ── fixtures ────────────────────────────────────────────────────────────────

/** A DB with just enough of the real schema: journal(date PK, rule_breaks) + settings.
 *  The taxonomy migration supplies the REAL rule_break_def + journal_rule_break DDL.
 *  (The mistakes harness uses the same minimal-table trick.) */
function freshDb(vocab?: string[] | null, rawVocab?: string): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE journal (
      date        TEXT PRIMARY KEY,
      rule_breaks TEXT NOT NULL DEFAULT '[]'
    )
  `)
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
  // vocab === null / undefined -> the settings key is ABSENT (post-retirement fresh install)
  if (rawVocab !== undefined) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('daily_rule_break_list', ?)").run(rawVocab)
  } else if (vocab != null) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('daily_rule_break_list', ?)").run(
      JSON.stringify(vocab),
    )
  }
  migrateRuleBreaksTaxonomy(db) // real DDL + seed-if-empty
  return db
}

/** Tag a day. `breaks` as a string[] is JSON-encoded; as a string it is stored RAW
 *  (so a malformed / legacy cell can be manufactured). */
function addDay(db: Database.Database, date: string, breaks: string[] | string): void {
  const value = typeof breaks === 'string' ? breaks : JSON.stringify(breaks)
  db.prepare('INSERT INTO journal (date, rule_breaks) VALUES (?, ?)').run(date, value)
}

const defs = (db: Database.Database) =>
  db
    .prepare('SELECT id, name, sort_position, is_custom, is_archived FROM rule_break_def ORDER BY sort_position, id')
    .all() as { id: number; name: string; sort_position: number; is_custom: number; is_archived: number }[]
const defNames = (db: Database.Database) => defs(db).map((d) => d.name)
const countDefs = (db: Database.Database) =>
  (db.prepare('SELECT COUNT(*) AS n FROM rule_break_def').get() as { n: number }).n
const countLinks = (db: Database.Database) =>
  (db.prepare('SELECT COUNT(*) AS n FROM journal_rule_break').get() as { n: number }).n
const links = (db: Database.Database) =>
  db
    .prepare(`
      SELECT j.date AS date, d.name AS name, d.is_archived AS is_archived
      FROM journal_rule_break j JOIN rule_break_def d ON d.id = j.rule_break_def_id
      ORDER BY j.date, d.name
    `)
    .all() as { date: string; name: string; is_archived: number }[]
const defByName = (db: Database.Database, name: string) =>
  db.prepare('SELECT id, is_custom, is_archived FROM rule_break_def WHERE lower(name) = lower(?)').all(name) as {
    id: number
    is_custom: number
    is_archived: number
  }[]

console.log('rule-breaks taxonomy + backfill — in-memory harness\n')

// ── SEED (the taxonomy migration) ───────────────────────────────────────────

it('[21] FRESH INSTALL: settings key ABSENT -> seeds the 4 DEFAULT_RULE_BREAKS', () => {
  const db = freshDb(null)
  eqJson(defNames(db), DEFAULT_RULE_BREAKS, 'must seed exactly the four shipped defaults')
  assert(defs(db).every((d) => d.is_custom === 0), 'the four defaults are is_custom = 0')
  assert(defs(db).every((d) => d.is_archived === 0), 'the four defaults are active')
  db.close()
})

it('[17] is_custom: the 4 defaults -> 0; anything else -> 1', () => {
  const db = freshDb(['Ignored daily max loss', 'Traded through news'])
  assert(defByName(db, 'Ignored daily max loss')[0].is_custom === 0, 'a shipped default is is_custom = 0')
  assert(defByName(db, 'Traded through news')[0].is_custom === 1, 'a user-added label is is_custom = 1')
  db.close()
})

it('[23] SEED ORDER: sort_position preserves the daily_rule_break_list order', () => {
  const db = freshDb(['Zebra rule', 'Ignored daily max loss', 'Alpha rule'])
  eqJson(defNames(db), ['Zebra rule', 'Ignored daily max loss', 'Alpha rule'], 'the user arranged this list; do not reshuffle it')
  eqJson(defs(db).map((d) => d.sort_position), [0, 1, 2], 'sort_position is 0..n in list order')
  db.close()
})

it('[15] SEED CASE-DUP: ["Overtrading","overtrading"] -> ONE def (first-seen wins)', () => {
  const db = freshDb(['Overtrading', 'overtrading'])
  assert(countDefs(db) === 1, `expected 1 def, got ${countDefs(db)}`)
  eqJson(defNames(db), ['Overtrading'], 'the FIRST spelling wins')
  db.close()
})

it('[16] SEED EXACT-DUP: ["Overtrading","Overtrading"] -> ONE def (repo.ts dedups NOTHING)', () => {
  const db = freshDb(['Overtrading', 'Overtrading'])
  assert(countDefs(db) === 1, `expected 1 def, got ${countDefs(db)}`)
  db.close()
})

it('[22] LEGACY CSV settings value shatters IDENTICALLY to getSettings (consistency lock)', () => {
  // parseStringArray (settings/repo.ts:67-80) falls back to split(',') on a non-JSON value.
  // The migration must inherit that behaviour EXACTLY, or the def table and the app's view
  // of the vocabulary diverge. This is a consistency lock, NOT comma protection.
  const db = freshDb(undefined, 'Alpha,Beta,Gamma')
  eqJson(defNames(db), ['Alpha', 'Beta', 'Gamma'], 'a legacy CSV value splits, same as getSettings')
  db.close()
})

it('[6a] EMPTY vocabulary ("[]") seeds NOTHING (deleting everything is a real user state)', () => {
  const db = freshDb([])
  assert(countDefs(db) === 0, `expected 0 defs, got ${countDefs(db)}`)
  db.close()
})

it('SEED-IF-EMPTY: a second taxonomy run does NOT re-seed or duplicate', () => {
  const db = freshDb(['Ignored daily max loss'])
  const before = countDefs(db)
  migrateRuleBreaksTaxonomy(db)
  migrateRuleBreaksTaxonomy(db)
  assert(countDefs(db) === before, 'the table is seeded once, never again')
  db.close()
})

// ── BACKFILL (the pure core) ────────────────────────────────────────────────

it('[1] ORPHAN: a journal label absent from the vocabulary is RESURRECTED', () => {
  const db = freshDb(['Ignored daily max loss'])
  addDay(db, '2026-07-01', ['Ignored daily max loss', 'Deleted long ago'])
  const r = backfillRuleBreaks(db)
  assert(r.defsCreated === 1, `defsCreated expected 1, got ${r.defsCreated}`)
  eqJson(r.resurrectedNames, ['Deleted long ago'], 'the orphan is reported verbatim')
  assert(defByName(db, 'Deleted long ago').length === 1, 'the orphan now has a def')
  db.close()
})

it('[18] the resurrected orphan is ARCHIVED (is_custom=1, is_archived=1)', () => {
  const db = freshDb(['Ignored daily max loss'])
  addDay(db, '2026-07-01', ['Deleted long ago'])
  backfillRuleBreaks(db)
  const d = defByName(db, 'Deleted long ago')[0]
  assert(d.is_custom === 1, 'a resurrected orphan is is_custom = 1')
  assert(d.is_archived === 1, 'a resurrected orphan is ARCHIVED — the user removed it; do not re-add it to the picker')
  db.close()
})

it('[2] THE TRAP: a vocabulary label NEVER tagged is KEPT (the mistakes template drops it)', () => {
  const db = freshDb(['Ignored daily max loss', 'Traded through news'])
  addDay(db, '2026-07-01', ['Ignored daily max loss']) // "Traded through news" is never tagged
  backfillRuleBreaks(db)
  assert(
    defByName(db, 'Traded through news').length === 1,
    'a configured-but-never-broken rule MUST survive — this is the data loss the mistakes template ships',
  )
  assert(defByName(db, 'Traded through news')[0].is_archived === 0, 'and it stays ACTIVE in the picker')
  db.close()
})

it('[3] two labels on one day -> two junction rows', () => {
  const db = freshDb(['Ignored daily max loss', 'Overtrading'])
  addDay(db, '2026-07-01', ['Ignored daily max loss', 'Overtrading'])
  const r = backfillRuleBreaks(db)
  assert(r.linksCreated === 2, `linksCreated expected 2, got ${r.linksCreated}`)
  eqJson(links(db), [
    { date: '2026-07-01', name: 'Ignored daily max loss', is_archived: 0 },
    { date: '2026-07-01', name: 'Overtrading', is_archived: 0 },
  ], 'both labels link to the same day')
  db.close()
})

it('[4] the same label across many days -> one def, one link per day', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-07-01', ['Overtrading'])
  addDay(db, '2026-07-02', ['Overtrading'])
  addDay(db, '2026-07-03', ['Overtrading'])
  const r = backfillRuleBreaks(db)
  assert(r.linksCreated === 3, `linksCreated expected 3, got ${r.linksCreated}`)
  assert(countDefs(db) === 1, 'still exactly one def')
  db.close()
})

it('[5] MALFORMED cells parse to [] and never throw', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-07-01', 'not json')
  addDay(db, '2026-07-02', 'null')
  addDay(db, '2026-07-03', '{"a":1}')
  addDay(db, '2026-07-04', '["Overtrading"]') // the one good row
  const r = backfillRuleBreaks(db)
  assert(r.linksCreated === 1, `only the well-formed row links; got ${r.linksCreated}`)
  assert(r.defsCreated === 0, 'garbage must never mint vocabulary')
  db.close()
})

it('[6b] EMPTY vocabulary + history -> every label resurrected (archived)', () => {
  const db = freshDb([])
  addDay(db, '2026-07-01', ['Alpha', 'Beta'])
  const r = backfillRuleBreaks(db)
  assert(r.defsCreated === 2, `defsCreated expected 2, got ${r.defsCreated}`)
  assert(countLinks(db) === 2, 'both link')
  assert(defs(db).every((d) => d.is_archived === 1), 'all resurrected orphans are archived')
  db.close()
})

it('[7] CASE DRIFT: day "overtrading" vs vocabulary "Overtrading" -> ONE def, no orphan', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-07-01', ['overtrading'])
  const r = backfillRuleBreaks(db)
  assert(r.defsCreated === 0, `case drift must NOT mint a twin; defsCreated=${r.defsCreated}`)
  assert(countDefs(db) === 1, 'still one def')
  assert(countLinks(db) === 1, 'and it links')
  db.close()
})

it('[8] WHITESPACE DRIFT: day " Overtrading " links to the vocabulary def', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-07-01', [' Overtrading '])
  const r = backfillRuleBreaks(db)
  assert(r.defsCreated === 0, `whitespace drift must NOT mint a twin; defsCreated=${r.defsCreated}`)
  assert(countLinks(db) === 1, 'it links to the trimmed match')
  db.close()
})

it('[9] a label containing a COMMA does NOT shatter (JSON path, no CSV fallback)', () => {
  const db = freshDb(['Gave back 30%, then revenge traded'])
  addDay(db, '2026-07-01', ['Gave back 30%, then revenge traded'])
  const r = backfillRuleBreaks(db)
  assert(r.defsCreated === 0, 'the label is already in the vocabulary')
  assert(countLinks(db) === 1, 'one link, not two')
  eqJson(links(db).map((l) => l.name), ['Gave back 30%, then revenge traded'], 'the comma survives intact')
  db.close()
})

it('[11] ["A","A"] within one day -> ONE junction row (the composite PK)', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-07-01', ['Overtrading', 'Overtrading', 'overtrading'])
  const r = backfillRuleBreaks(db)
  assert(r.linksCreated === 1, `expected 1 link, got ${r.linksCreated}`)
  assert(countLinks(db) === 1, 'the day cannot break the same rule twice')
  db.close()
})

it('[12] IDEMPOTENCY: a second run creates 0 defs / 0 links and leaves totals unchanged', () => {
  const db = freshDb(['Ignored daily max loss'])
  addDay(db, '2026-07-01', ['Ignored daily max loss', 'Deleted long ago'])
  backfillRuleBreaks(db)
  const d1 = countDefs(db)
  const l1 = countLinks(db)
  const r2 = backfillRuleBreaks(db)
  assert(r2.defsCreated === 0, `2nd run defsCreated expected 0, got ${r2.defsCreated}`)
  assert(r2.linksCreated === 0, `2nd run linksCreated expected 0, got ${r2.linksCreated}`)
  assert(countDefs(db) === d1 && countLinks(db) === l1, 'totals stable across runs')
  db.close()
})

it('[19] RESTORE PATH (core half): junction wiped, defs kept -> a re-run REBUILDS every link', () => {
  // The frozen journal.rule_breaks column is a COMPLETE recovery source. This is what makes
  // the pre-SCHEMA_SQL .bak a real rollback. (The latch-manipulation half is 3a-2.)
  const db = freshDb(['Ignored daily max loss'])
  addDay(db, '2026-07-01', ['Ignored daily max loss', 'Deleted long ago'])
  backfillRuleBreaks(db)
  const before = links(db)
  db.exec('DELETE FROM journal_rule_break')
  assert(countLinks(db) === 0, 'setup: junction wiped')
  const r = backfillRuleBreaks(db)
  assert(r.linksCreated === 2, `rebuild expected 2 links, got ${r.linksCreated}`)
  assert(r.defsCreated === 0, 'the defs survived, so none are re-created')
  eqJson(links(db), before, 'the rebuilt junction is identical to the original')
  db.close()
})

it('[10] FK: the junction rejects a date with no journal row', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-07-01', ['Overtrading'])
  backfillRuleBreaks(db)
  const id = defByName(db, 'Overtrading')[0].id
  let threw = false
  try {
    db.prepare('INSERT INTO journal_rule_break (date, rule_break_def_id) VALUES (?, ?)').run('1999-01-01', id)
  } catch {
    threw = true
  }
  assert(threw, 'FOREIGN KEY (date) REFERENCES journal(date) must reject an unknown date')
  db.close()
})

it('[14] ON DELETE CASCADE: deleting a journal row takes its junction rows with it', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-07-01', ['Overtrading'])
  addDay(db, '2026-07-02', ['Overtrading'])
  backfillRuleBreaks(db)
  assert(countLinks(db) === 2, 'setup: two links')
  db.prepare('DELETE FROM journal WHERE date = ?').run('2026-07-01')
  assert(countLinks(db) === 1, 'the deleted day’s junction row cascaded away')
  assert(countDefs(db) === 1, 'but the vocabulary def is untouched (RESTRICT is on the def side)')
  db.close()
})

it('RESTRICT: a def with links cannot be hard-deleted (the DB refuses)', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-07-01', ['Overtrading'])
  backfillRuleBreaks(db)
  const id = defByName(db, 'Overtrading')[0].id
  let threw = false
  try {
    db.prepare('DELETE FROM rule_break_def WHERE id = ?').run(id)
  } catch {
    threw = true
  }
  assert(threw, 'ON DELETE RESTRICT must refuse to delete a referenced def')
  db.close()
})

it('NON-PARTIAL UNIQUE: an ARCHIVED def still reserves its name (the collision fix)', () => {
  const db = freshDb(['Overtrading'])
  db.prepare('UPDATE rule_break_def SET is_archived = 1').run()
  let threw = false
  try {
    db.prepare("INSERT INTO rule_break_def (name, sort_position) VALUES ('overtrading', 9)").run()
  } catch {
    threw = true
  }
  assert(threw, 'ux_rule_break_def_name is NON-PARTIAL: archiving does NOT free the name')
  db.close()
})

it('PRESERVE: journal.rule_breaks is byte-identical before and after the backfill', () => {
  const db = freshDb(['Ignored daily max loss'])
  addDay(db, '2026-07-01', ['Ignored daily max loss', 'Deleted long ago'])
  addDay(db, '2026-07-02', 'not json')
  addDay(db, '2026-07-03', ['  Padded  '])
  const before = db.prepare('SELECT date, rule_breaks FROM journal ORDER BY date').all()
  backfillRuleBreaks(db)
  const after = db.prepare('SELECT date, rule_breaks FROM journal ORDER BY date').all()
  eqJson(after, before, 'the source column is the permanent fallback — it must NEVER be modified')
  db.close()
})

// ── summary ─────────────────────────────────────────────────────────────────
console.log('\nDEFERRED to 3a-2 (they exercise the GATED WRAPPER, which this beat does not build):')
console.log('  [13] wrapper gates: fresh-install / already-migrated / latched / backup-failed')
console.log('  [20] rename-resurrection: rename a def, unset the latch, re-run')
console.log('  [19] latch-manipulation half (its CORE half — rebuild from the frozen column — runs above)')

console.log(`\n${passed} passed / ${passed + failed} total`)
if (failed > 0) {
  console.log('\nFAILURES:')
  for (const f of failures) console.log('  FAIL  ' + f)
  process.exit(1)
}
process.exit(0)
