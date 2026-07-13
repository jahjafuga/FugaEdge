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
import {
  migrateRuleBreaksBackfill,
  RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY,
  RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY,
} from '../../db/migrate-rule-breaks-backfill'
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

// ── THE GATED WRAPPER (Beat 3a-2) ───────────────────────────────────────────
//
// The wrapper adds four gates + one atomic transaction around the pure core above.
//
// It takes NO backup closure, which is the one real divergence from the mistakes/catalyst
// wrappers. Theirs invoke opts.backup() from inside migrateAfterSchema — i.e. AFTER
// db.exec(SCHEMA_SQL) has already re-stamped _meta.schema_version — so their .bak carries
// the NEW version and, on restore, the version gate refuses to re-run: a one-way door.
// Ours is taken by database.ts BEFORE SCHEMA_SQL, and the wrapper only VERIFIES it landed,
// by reading the backup latch. [19] is that difference, executable.

const migrationLatchSet = (db: Database.Database) =>
  (
    db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY) as { value: string } | undefined
  )?.value === 'true'

/** Everything database.ts's maybeBackupForRuleBreaksBackfill does TO THE DB — and it only
 *  gets here when the file copy actually succeeded (the copy's failure path returns without
 *  latching). "Latch set" therefore means "a restorable .bak exists on disk". */
const setBackupLatch = (db: Database.Database) =>
  db
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'",
    )
    .run(RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY)

const unsetMigrationLatch = (db: Database.Database) =>
  db.prepare('DELETE FROM settings WHERE key = ?').run(RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY)

it('[20] RENAME-RESURRECTION: the version gate is what stops a rename from being undone', () => {
  // The user's real vocabulary: the four shipped defaults plus one of their own, so
  // 'Overtrading' seeds as def id 5.
  const db = freshDb([...DEFAULT_RULE_BREAKS, 'Overtrading'])
  addDay(db, '2026-03-02', ['Overtrading'])

  // The real upgrade: schema 46 -> 47. Backup landed, gates pass, migration runs.
  setBackupLatch(db)
  const first = migrateRuleBreaksBackfill(db, 46)
  assert(first.ran === true, `the first run must migrate, got ${JSON.stringify(first)}`)
  const overtradingId = defByName(db, 'Overtrading')[0]?.id
  assert(overtradingId === 5, `'Overtrading' should be def 5, got ${overtradingId}`)
  eqJson(
    links(db),
    [{ date: '2026-03-02', name: 'Overtrading', is_archived: 0 }],
    'the day links to def 5',
  )

  // The source column is FROZEN. It still says "Overtrading" and always will — that is the
  // PRESERVE model, and it is also the loaded gun this fixture exists to keep unloaded.
  eqJson(
    db.prepare("SELECT rule_breaks FROM journal WHERE date = '2026-03-02'").get(),
    { rule_breaks: '["Overtrading"]' },
    'journal.rule_breaks keeps the OLD name after a rename — by design',
  )

  // The user renames the def. (3b does this through the repo; a plain UPDATE here.)
  db.prepare("UPDATE rule_break_def SET name = 'Over-trading' WHERE id = ?").run(overtradingId)

  // The latch is LOST — corruption, a hand-edited settings row, or the planned
  // restore-from-backup UI. The version gate is now the ONLY thing left standing.
  unsetMigrationLatch(db)
  assert(!migrationLatchSet(db), 'latch unset: the wrapper is down to its version gate alone')

  const second = migrateRuleBreaksBackfill(db, 47)
  assert(
    second.ran === false && second.reason === 'already-migrated',
    `the version gate must refuse, got ${JSON.stringify(second)}`,
  )
  assert(countDefs(db) === 5, `ZERO new defs: expected 5, got ${countDefs(db)}`)
  assert(countLinks(db) === 1, `ZERO new links: expected 1, got ${countLinks(db)}`)
  eqJson(
    links(db),
    [{ date: '2026-03-02', name: 'Over-trading', is_archived: 0 }],
    'the day still carries EXACTLY ONE def, and it is the renamed one',
  )
  assert(defByName(db, 'Overtrading').length === 0, "'Overtrading' must NOT be resurrected")

  // ── THE COUNTER-ASSERTION: this is WHY the gate exists ────────────────────
  // Same DB, same state the wrapper just refused. Call the CORE directly — no gates — and
  // watch the damage land. The frozen column still says "Overtrading"; that name is no
  // longer in the vocabulary; so the core faithfully does its job and resurrects it as a
  // SECOND def, then links it. The day now carries the same real-world rule TWICE, under
  // two names, and the Analytics rollup counts it twice. The gate is the only thing between
  // a user renaming a rule and their history quietly doubling.
  const damage = backfillRuleBreaks(db)
  assert(
    damage.defsCreated === 1,
    `the ungated core DOES resurrect the old name, got ${damage.defsCreated}`,
  )
  eqJson(damage.resurrectedNames, ['Overtrading'], 'and the name it brings back is the pre-rename one')
  assert(damage.linksCreated === 1, 'and it DOES add a second link to the same day')
  assert(countDefs(db) === 6, 'the ungated core leaves 6 defs where the wrapper left 5')
  eqJson(
    links(db),
    [
      { date: '2026-03-02', name: 'Over-trading', is_archived: 0 },
      { date: '2026-03-02', name: 'Overtrading', is_archived: 1 },
    ],
    'ONE day, ONE rule, TWO defs — the double-count the version gate prevents',
  )
  db.close()
})

it('[13a] wrapper gate: fresh install (priorVersion 0) is a no-op', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-03-02', ['Overtrading'])
  setBackupLatch(db)
  const r = migrateRuleBreaksBackfill(db, 0)
  assert(r.ran === false && r.reason === 'fresh-install', `expected fresh-install, got ${JSON.stringify(r)}`)
  assert(countLinks(db) === 0, 'no links created on a fresh-install no-op')
  db.close()
})

it('[13b] wrapper gate: priorVersion >= 47 is a no-op (already-migrated)', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-03-02', ['Overtrading'])
  setBackupLatch(db)
  const r = migrateRuleBreaksBackfill(db, 47)
  assert(r.ran === false && r.reason === 'already-migrated', `expected already-migrated, got ${JSON.stringify(r)}`)
  assert(countLinks(db) === 0, 'no links created on a gated no-op')
  db.close()
})

it('[13c] wrapper gate: the migration latch is a no-op (latched)', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-03-02', ['Overtrading'])
  setBackupLatch(db)
  db.prepare("INSERT INTO settings (key, value) VALUES (?, 'true')").run(
    RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY,
  )
  const r = migrateRuleBreaksBackfill(db, 46)
  assert(r.ran === false && r.reason === 'latched', `expected latched, got ${JSON.stringify(r)}`)
  assert(countLinks(db) === 0, 'no links created when latched')
  db.close()
})

it('[13d] wrapper gate: NO pre-migration backup -> ABORT (backup-failed)', () => {
  const db = freshDb(['Overtrading'])
  addDay(db, '2026-03-02', ['Overtrading'])
  // The backup latch is deliberately NOT set: database.ts's copy never landed.
  const r = migrateRuleBreaksBackfill(db, 46)
  assert(r.ran === false && r.reason === 'backup-failed', `expected backup-failed, got ${JSON.stringify(r)}`)
  assert(countLinks(db) === 0, 'the migration must not run without a restorable backup behind it')
  assert(!migrationLatchSet(db), 'and it must NOT latch, so a repaired launch still retries')
  db.close()
})

it('[13e] wrapper HAPPY PATH: gates pass -> runs, links, and latches', () => {
  const db = freshDb(['Ignored daily max loss'])
  addDay(db, '2026-03-02', ['Ignored daily max loss'])
  addDay(db, '2026-03-03', ['Ignored daily max loss', 'Deleted long ago'])
  setBackupLatch(db)
  const r = migrateRuleBreaksBackfill(db, 46)
  assert(r.ran === true, `expected ran:true, got ${JSON.stringify(r)}`)
  eqJson(r.report?.resurrectedNames, ['Deleted long ago'], 'the orphan is reported by name')
  assert(r.report?.defsCreated === 1 && r.report?.linksCreated === 3, `report: ${JSON.stringify(r.report)}`)
  assert(migrationLatchSet(db), 'a successful run sets the migration latch')
  db.close()
})

it('[13f] wrapper: the latch lives INSIDE the txn — a mid-run throw rolls BOTH back', () => {
  const db = freshDb(['Ignored daily max loss'])
  addDay(db, '2026-03-02', ['Overtrading']) // orphan: creates a def, then links it
  addDay(db, '2026-03-09', ['Late entry']) // orphan: creates a def, then EXPLODES
  setBackupLatch(db)
  // Blow up the SECOND day's link insert, after the first day has already written rows.
  db.exec(`
    CREATE TRIGGER boom BEFORE INSERT ON journal_rule_break
    WHEN NEW.date = '2026-03-09'
    BEGIN
      SELECT RAISE(ABORT, 'boom');
    END;
  `)
  const r = migrateRuleBreaksBackfill(db, 46)
  assert(
    r.ran === false && r.reason === 'transaction-failed',
    `expected transaction-failed, got ${JSON.stringify(r)}`,
  )
  assert(countLinks(db) === 0, "day 1's link must roll back along with day 2's failure")
  assert(countDefs(db) === 1, 'both resurrected defs roll back — only the seeded one survives')
  assert(!migrationLatchSet(db), 'the latch is INSIDE the txn: a rollback un-sets it, so it retries')

  // Repair and relaunch. The idempotent core makes the retry clean.
  db.exec('DROP TRIGGER boom')
  const retry = migrateRuleBreaksBackfill(db, 46)
  assert(retry.ran === true, `the retry must run, got ${JSON.stringify(retry)}`)
  assert(countLinks(db) === 2, 'the retry rebuilds both links')
  assert(countDefs(db) === 3, 'and both resurrected defs')
  assert(migrationLatchSet(db), 'and latches')
  db.close()
})

// ── [19] THE RESTORE WALK — the .bak-is-restorable proof ────────────────────
//
// This SIMULATES database.ts's boot sequence (openDatabase, :166-170) in memory. Its
// fidelity rests on three facts read out of that file, which an in-memory harness cannot
// observe for itself (there is no fs here):
//
//   1. maybeBackupForRuleBreaksBackfill runs BEFORE db.exec(SCHEMA_SQL) (:169) re-stamps
//      _meta.schema_version — so the .bak carries the OLD version, 46.
//   2. Its backup latch is written AFTER the copy (maybeBackupForV020's shape, :239-269:
//      the copy's catch RETURNS at :254 without latching) — so the .bak carries it UNSET.
//   3. The migration latch is written inside the migration's transaction, over in
//      migrateAfterSchema (:170) — so the .bak carries that unset too.
//
// Net: a restored .bak looks exactly like a schema-46 DB that never migrated. No def
// tables, no latches, journal.rule_breaks intact. A normal launch rebuilds all of it.

/** The state a restored .bak is actually in: pre-SCHEMA_SQL, pre-taxonomy, pre-backfill. */
function restoredBakDb(vocab: string[], days: [string, string[]][]): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`CREATE TABLE journal (date TEXT PRIMARY KEY, rule_breaks TEXT NOT NULL DEFAULT '[]')`)
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
  db.prepare("INSERT INTO settings (key, value) VALUES ('daily_rule_break_list', ?)").run(
    JSON.stringify(vocab),
  )
  for (const [date, breaks] of days) {
    db.prepare('INSERT INTO journal (date, rule_breaks) VALUES (?, ?)').run(date, JSON.stringify(breaks))
  }
  // migrateRuleBreaksTaxonomy is deliberately NOT called — the .bak predates it.
  return db
}

/** One launch of openDatabase() against a DB whose on-disk version is `priorVersion`. */
function boot(db: Database.Database, priorVersion: number) {
  setBackupLatch(db) // :167  maybeBackupForRuleBreaksBackfill — the copy landed
  //                    :169  db.exec(SCHEMA_SQL) — stamps 47; nothing to do in memory
  migrateRuleBreaksTaxonomy(db) // :170  migrateAfterSchema -> the table creator (unconditional)
  return migrateRuleBreaksBackfill(db, priorVersion) //   -> the gated backfill (registered LAST)
}

const RESTORE_VOCAB = ['Ignored daily max loss', 'Overtrading']
const RESTORE_DAYS: [string, string[]][] = [
  ['2026-03-02', ['Overtrading']],
  ['2026-03-03', ['Ignored daily max loss', 'Deleted long ago']], // carries an orphan
  ['2026-03-04', ['Overtrading', 'Ignored daily max loss']],
]

it('[19] RESTORE: the .bak carries NO def tables and NO latches — it predates all of them', () => {
  const bak = restoredBakDb(RESTORE_VOCAB, RESTORE_DAYS)
  const tables = (
    bak.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
      name: string
    }[]
  ).map((t) => t.name)
  eqJson(tables, ['journal', 'settings'], 'the .bak predates the taxonomy migration')
  assert(!migrationLatchSet(bak), 'the migration latch is written in the txn, long after the copy')
  const backupLatch = bak
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY)
  assert(backupLatch === undefined, 'the backup latch is written AFTER the copy (database.ts:257-269)')
  bak.close()
})

it('[19] RESTORE: schema 46 + no latches -> the migration RE-RUNS and rebuilds identically', () => {
  // Launch 1 — the real upgrade.
  const live = restoredBakDb(RESTORE_VOCAB, RESTORE_DAYS)
  const first = boot(live, 46)
  assert(first.ran === true, `launch 1 must migrate, got ${JSON.stringify(first)}`)
  const defsAfterFirst = defs(live)
  const linksAfterFirst = links(live)
  assert(migrationLatchSet(live), 'launch 1 latches')
  assert(linksAfterFirst.length === 5, `expected 5 links, got ${linksAfterFirst.length}`)
  live.close()

  // Launch 2 — the user restores the .bak and relaunches. The restored file IS the state
  // restoredBakDb() produces, because that is precisely what got copied.
  const restored = restoredBakDb(RESTORE_VOCAB, RESTORE_DAYS)
  const second = boot(restored, 46)
  assert(second.ran === true, `the restored .bak must migrate again, got ${JSON.stringify(second)}`)
  eqJson(defs(restored), defsAfterFirst, 'the rebuilt vocabulary is identical')
  eqJson(links(restored), linksAfterFirst, 'the rebuilt junction is identical')
  assert(migrationLatchSet(restored), 'and it latches again')
  restored.close()
})

it('[19] RESTORE: a NORMAL second launch still adds nothing — restore is not a re-entry hatch', () => {
  const db = restoredBakDb(RESTORE_VOCAB, RESTORE_DAYS)
  boot(db, 46)
  const n = countLinks(db)
  const d = countDefs(db)
  // Same file, relaunched: SCHEMA_SQL stamped 47 last time, so priorVersion is 47 now.
  const again = boot(db, 47)
  assert(
    again.ran === false && again.reason === 'already-migrated',
    `expected already-migrated, got ${JSON.stringify(again)}`,
  )
  assert(countLinks(db) === n && countDefs(db) === d, 'a normal second launch adds nothing')
  db.close()
})

// ── summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed / ${passed + failed} total`)
if (failed > 0) {
  console.log('\nFAILURES:')
  for (const f of failures) console.log('  FAIL  ' + f)
  process.exit(1)
}
process.exit(0)
