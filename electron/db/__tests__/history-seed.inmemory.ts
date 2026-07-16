// Dave #9 (schema 48) — goal-history seed + append-on-change hook, against a
// REAL in-memory better-sqlite3. A capturing shim can assert SQL text; it
// cannot prove seed-if-empty idempotence, row-existence honesty (no fabricated
// 500), or that the save hook appends EXACTLY on value change. Those are the
// beat, so they run here.
//
// Run:  npm run test:history-seed

import Database from 'better-sqlite3'
import { SCHEMA_SQL } from '../schema'
import { migrateHistorySeeds } from '../migrate-history-seeds'
import { migrateRuleBreaksTaxonomy } from '../migrate-rule-breaks-taxonomy'
import { saveSettingsOn } from '../../settings/save'
import { readRuleBreakNamesForDate } from '../../ruleBreaks/repo'
import { EPOCH_EFFECTIVE_FROM } from '@/core/analytics/giveback'

let failures = 0
const line = (s = '') => console.log(s)
const hr = () => line('-'.repeat(78))
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) line(`  PASS  ${name}`)
  else {
    failures++
    line(`  FAIL  ${name}${detail ? `\n          -> ${detail}` : ''}`)
  }
}

type Conn = Database.Database

function freshDb(): Conn {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  return db
}

const setSetting = (db: Conn, k: string, v: string) =>
  db
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(k, v)
const rows = (db: Conn, table: string) =>
  db
    .prepare(`SELECT effective_from, value FROM ${table} ORDER BY effective_from, id`)
    .all() as { effective_from: string; value: number }[]

line()
line('history-seed (Dave #9, schema 48) — in-memory harness')
hr()

// ═══ (5) SEED HONESTY ═══════════════════════════════════════════════════
line('[A] seed honesty')
{
  // A1 — fresh SCHEMA_SQL DB. daily_profit_target has NO schema seed → the
  // epoch row is {epoch, 0} (no goal). max_daily_loss DOES have a schema seed
  // (schema.ts INSERT OR IGNORE ... ('max_daily_loss', '500')) — the row
  // exists on every real DB, so the history seeds the STORED 500. That is the
  // stored value the dashboard already operates on, not the read-default fill.
  const db = freshDb()
  migrateHistorySeeds(db)
  const pt = rows(db, 'profit_target_history')
  check('[A1] profit target seeds unconditionally (1 row)', pt.length === 1, `got ${pt.length}`)
  check(
    '[A1] the seed row is {epoch, 0} on an unset target',
    pt.length === 1 && pt[0].effective_from === EPOCH_EFFECTIVE_FROM && pt[0].value === 0,
    JSON.stringify(pt),
  )
  const ml = rows(db, 'max_loss_history')
  check(
    '[A1] max loss seeds the SCHEMA_SQL-stored 500 (the row exists on every real DB)',
    ml.length === 1 && ml[0].effective_from === EPOCH_EFFECTIVE_FROM && ml[0].value === 500,
    JSON.stringify(ml),
  )
  db.close()
}
{
  // A1b — the honest-absence branch (defensive: unreachable after SCHEMA_SQL,
  // pinned anyway): with the row genuinely absent, max loss seeds NOTHING —
  // never the getSettings 500 read-default.
  const db = freshDb()
  db.prepare(`DELETE FROM settings WHERE key = 'max_daily_loss'`).run()
  migrateHistorySeeds(db)
  check(
    '[A1b] max loss does NOT seed when the settings row is absent — no fabricated 500',
    rows(db, 'max_loss_history').length === 0,
  )
  db.close()
}
{
  // A2 — both rows stored: each seeds its STORED value at the epoch.
  const db = freshDb()
  setSetting(db, 'daily_profit_target', '200')
  setSetting(db, 'max_daily_loss', '300')
  migrateHistorySeeds(db)
  const pt = rows(db, 'profit_target_history')
  const ml = rows(db, 'max_loss_history')
  check(
    '[A2] profit target seeds the stored value at the epoch',
    pt.length === 1 && pt[0].effective_from === EPOCH_EFFECTIVE_FROM && pt[0].value === 200,
    JSON.stringify(pt),
  )
  check(
    '[A2] max loss seeds the stored value when the row exists',
    ml.length === 1 && ml[0].effective_from === EPOCH_EFFECTIVE_FROM && ml[0].value === 300,
    JSON.stringify(ml),
  )
  db.close()
}
{
  // A3 — a garbage stored max loss is effectively unset: seed nothing rather
  // than fall back to the 500 read-default (fabrication).
  const db = freshDb()
  setSetting(db, 'max_daily_loss', 'not-a-number')
  migrateHistorySeeds(db)
  check(
    '[A3] unparseable max_daily_loss seeds nothing (never the 500 default)',
    rows(db, 'max_loss_history').length === 0,
  )
  db.close()
}

// ═══ (6) SEED IDEMPOTENCE ═══════════════════════════════════════════════
line()
line('[B] seed idempotence')
{
  const db = freshDb()
  setSetting(db, 'daily_profit_target', '200')
  setSetting(db, 'max_daily_loss', '300')
  migrateHistorySeeds(db)
  migrateHistorySeeds(db)
  check('[B1] re-running the seed appends nothing (profit target stays 1)', rows(db, 'profit_target_history').length === 1)
  check('[B1] re-running the seed appends nothing (max loss stays 1)', rows(db, 'max_loss_history').length === 1)

  // B2 — the seed never overwrites a history the hook has grown.
  saveSettingsOn(db, { daily_profit_target: 500 }, '2026-07-10T15:00:00.000Z')
  migrateHistorySeeds(db)
  const pt = rows(db, 'profit_target_history')
  check('[B2] a grown history passes through the seed untouched (2 rows)', pt.length === 2, JSON.stringify(pt))
  db.close()
}

// ═══ (1) APPEND-ON-CHANGE ═══════════════════════════════════════════════
line()
line('[C] the write hook — append ONLY on actual value change')
{
  const db = freshDb()
  setSetting(db, 'daily_profit_target', '200')
  // Model the (defensive) never-stored max loss so C4 can pin "first-ever set
  // appends" — on a real DB the SCHEMA_SQL row exists and the epoch seed
  // covers it (fixture [A1]).
  db.prepare(`DELETE FROM settings WHERE key = 'max_daily_loss'`).run()
  migrateHistorySeeds(db) // epoch:200
  saveSettingsOn(db, { daily_profit_target: 500 }, '2026-07-10T15:00:00.000Z')

  const pt = rows(db, 'profit_target_history')
  check('[C1] 200 -> 500 appends exactly one row', pt.length === 2, JSON.stringify(pt))
  check(
    '[C1] the OLD row is preserved (epoch:200) and the new row carries the save stamp',
    pt.length === 2 &&
      pt[0].effective_from === EPOCH_EFFECTIVE_FROM &&
      pt[0].value === 200 &&
      pt[1].effective_from === '2026-07-10T15:00:00.000Z' &&
      pt[1].value === 500,
    JSON.stringify(pt),
  )
  check(
    '[C1] the settings KV row also updated (the hook rides the same tx)',
    (db.prepare(`SELECT value FROM settings WHERE key = 'daily_profit_target'`).get() as { value: string }).value === '500',
  )

  saveSettingsOn(db, { daily_profit_target: 500 }, '2026-07-11T15:00:00.000Z')
  check('[C2] saving the SAME value appends nothing', rows(db, 'profit_target_history').length === 2)

  saveSettingsOn(db, { account_size: 30000 }, '2026-07-12T15:00:00.000Z')
  check('[C3] saving an unrelated key appends nothing', rows(db, 'profit_target_history').length === 2)

  // C4 — max loss: first-ever set (row absent, honestly-unset) IS a change.
  check('[C4-pre] max loss history starts empty (row was never stored)', rows(db, 'max_loss_history').length === 0)
  saveSettingsOn(db, { max_daily_loss: 300 }, '2026-07-13T15:00:00.000Z')
  const ml = rows(db, 'max_loss_history')
  check(
    '[C4] first-ever max loss set appends (unset -> 300)',
    ml.length === 1 && ml[0].effective_from === '2026-07-13T15:00:00.000Z' && ml[0].value === 300,
    JSON.stringify(ml),
  )
  saveSettingsOn(db, { max_daily_loss: 300 }, '2026-07-14T15:00:00.000Z')
  check('[C5] same max loss again appends nothing', rows(db, 'max_loss_history').length === 1)
  saveSettingsOn(db, { max_daily_loss: 250 }, '2026-07-15T15:00:00.000Z')
  check('[C6] a real max loss change appends', rows(db, 'max_loss_history').length === 2)

  // C7 — the savebar's blind bulk overwrite: a full patch that repeats current
  // values appends nothing; only the genuinely-changed key appends.
  saveSettingsOn(
    db,
    { daily_profit_target: 500, max_daily_loss: 250, account_size: 30000 },
    '2026-07-16T15:00:00.000Z',
  )
  check('[C7] bulk save with unchanged values appends nothing (profit)', rows(db, 'profit_target_history').length === 2)
  check('[C7] bulk save with unchanged values appends nothing (max loss)', rows(db, 'max_loss_history').length === 2)
  saveSettingsOn(
    db,
    { daily_profit_target: 750, max_daily_loss: 250 },
    '2026-07-17T15:00:00.000Z',
  )
  check('[C8] bulk save appends ONLY the changed key', rows(db, 'profit_target_history').length === 3 && rows(db, 'max_loss_history').length === 2)

  // C9 — invalid input neither upserts nor appends (the existing guard).
  saveSettingsOn(db, { daily_profit_target: -5 }, '2026-07-18T15:00:00.000Z')
  check('[C9] invalid (negative) input appends nothing', rows(db, 'profit_target_history').length === 3)
  db.close()
}

// ═══ (Dave #12) THE SORT-POSITION SYNC ════════════════════════════════════
// save.ts's daily_rule_break_list branch also rewrites rule_break_def
// .sort_position to the list's order (case-fold matched; unmatched defs —
// tagged-then-removed labels — follow after in preserved relative order), in
// the SAME transaction as the settings write. Without it a Settings reorder
// widens the pre-existing list-vs-def drift into a same-modal inconsistency:
// options chips in the new order, the day's selected names (which read
// ORDER BY sort_position) in the old.
line()
line('[D] daily_rule_break_list save syncs rule_break_def.sort_position')

const defRows = (db: Conn) =>
  db
    .prepare('SELECT name, sort_position FROM rule_break_def ORDER BY sort_position, id')
    .all() as { name: string; sort_position: number }[]

function ruleBreakDb(labels: string[]): Conn {
  const db = freshDb()
  setSetting(db, 'daily_rule_break_list', JSON.stringify(labels))
  migrateRuleBreaksTaxonomy(db) // seeds rule_break_def in list order
  return db
}

{
  // D1 — reorder: sort_position follows the saved list's index order.
  const db = ruleBreakDb(['Alpha', 'Bravo', 'Charlie'])
  saveSettingsOn(db, { daily_rule_break_list: ['Charlie', 'Alpha', 'Bravo'] }, '2026-07-16T10:00:00.000Z')
  check(
    '[D1] matched defs take sort_position = list index',
    JSON.stringify(defRows(db)) ===
      JSON.stringify([
        { name: 'Charlie', sort_position: 0 },
        { name: 'Alpha', sort_position: 1 },
        { name: 'Bravo', sort_position: 2 },
      ]),
    JSON.stringify(defRows(db)),
  )
  check(
    '[D1] the settings row carries the same order (one save, both stores)',
    (db.prepare(`SELECT value FROM settings WHERE key = 'daily_rule_break_list'`).get() as { value: string })
      .value === JSON.stringify(['Charlie', 'Alpha', 'Bravo']),
  )
  db.close()
}
{
  // D2 — the match is case-fold, the repo's own convention (the unique index
  // is on lower(name), so a case-insensitive match is the only one possible).
  const db = ruleBreakDb(['Overtrading', 'Chased entry'])
  saveSettingsOn(db, { daily_rule_break_list: ['CHASED ENTRY', 'overtrading'] }, '2026-07-16T10:00:00.000Z')
  check(
    '[D2] case-fold matching syncs despite casing drift',
    JSON.stringify(defRows(db)) ===
      JSON.stringify([
        { name: 'Chased entry', sort_position: 0 },
        { name: 'Overtrading', sort_position: 1 },
      ]),
    JSON.stringify(defRows(db)),
  )
  db.close()
}
{
  // D3 — unmatched defs (tagged-then-removed labels) follow AFTER the listed
  // ones, relative order preserved.
  const db = ruleBreakDb(['Alpha', 'Bravo', 'Charlie', 'Xray', 'Yankee'])
  saveSettingsOn(db, { daily_rule_break_list: ['Bravo', 'Alpha'] }, '2026-07-16T10:00:00.000Z')
  check(
    '[D3] unmatched defs follow the listed ones, relative order preserved',
    JSON.stringify(defRows(db)) ===
      JSON.stringify([
        { name: 'Bravo', sort_position: 0 },
        { name: 'Alpha', sort_position: 1 },
        { name: 'Charlie', sort_position: 2 },
        { name: 'Xray', sort_position: 3 },
        { name: 'Yankee', sort_position: 4 },
      ]),
    JSON.stringify(defRows(db)),
  )
  db.close()
}
{
  // D4 — SAME TRANSACTION: a failing def update rolls the settings write back
  // too (the migration-chain trigger trick: a real SQLite failure mid-tx).
  const db = ruleBreakDb(['Alpha', 'Bravo'])
  db.exec(`CREATE TRIGGER boom BEFORE UPDATE ON rule_break_def
           BEGIN SELECT RAISE(ABORT, 'disk full'); END`)
  let threw = false
  try {
    saveSettingsOn(db, { daily_rule_break_list: ['Bravo', 'Alpha'] }, '2026-07-16T10:00:00.000Z')
  } catch {
    threw = true
  }
  check('[D4] the aborted sync throws out of the save', threw)
  check(
    '[D4] ...and the settings write ROLLED BACK with it (one transaction)',
    (db.prepare(`SELECT value FROM settings WHERE key = 'daily_rule_break_list'`).get() as { value: string })
      .value === JSON.stringify(['Alpha', 'Bravo']),
  )
  check(
    '[D4] def order untouched by the aborted save',
    JSON.stringify(defRows(db)) ===
      JSON.stringify([
        { name: 'Alpha', sort_position: 0 },
        { name: 'Bravo', sort_position: 1 },
      ]),
  )
  db.close()
}
{
  // D5 — THE SEAM NARROWS: the day's selected names (ORDER BY sort_position)
  // follow a Settings reorder instead of drifting from the options order.
  const db = ruleBreakDb(['Alpha', 'Bravo', 'Charlie'])
  db.prepare(`INSERT INTO journal (date, rule_breaks) VALUES ('2026-03-02', '["Alpha","Charlie"]')`).run()
  const idOf = (name: string) =>
    (db.prepare('SELECT id FROM rule_break_def WHERE name = ?').get(name) as { id: number }).id
  const link = db.prepare('INSERT INTO journal_rule_break (date, rule_break_def_id) VALUES (?, ?)')
  link.run('2026-03-02', idOf('Alpha'))
  link.run('2026-03-02', idOf('Charlie'))

  check(
    '[D5-pre] the day reads [Alpha, Charlie] under the seeded order',
    JSON.stringify(readRuleBreakNamesForDate(db, '2026-03-02')) === JSON.stringify(['Alpha', 'Charlie']),
  )
  const linksBefore = (db.prepare('SELECT COUNT(*) n FROM journal_rule_break').get() as { n: number }).n
  saveSettingsOn(db, { daily_rule_break_list: ['Charlie', 'Bravo', 'Alpha'] }, '2026-07-16T10:00:00.000Z')
  check(
    '[D5] after the reorder save, the day reads [Charlie, Alpha] — the NEW vocabulary order',
    JSON.stringify(readRuleBreakNamesForDate(db, '2026-03-02')) === JSON.stringify(['Charlie', 'Alpha']),
    JSON.stringify(readRuleBreakNamesForDate(db, '2026-03-02')),
  )
  check(
    '[D5] (7) usage links untouched by the reorder',
    (db.prepare('SELECT COUNT(*) n FROM journal_rule_break').get() as { n: number }).n === linksBefore,
  )
  db.close()
}

// ═══ verdict ══════════════════════════════════════════════════════════════
line()
hr()
if (failures > 0) {
  line(`RESULT: ${failures} FAILURE(S)`)
  process.exit(1)
} else {
  line('RESULT: ALL PASS')
}
