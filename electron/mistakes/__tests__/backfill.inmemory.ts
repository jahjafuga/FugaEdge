// In-memory better-sqlite3 harness for the orphan-mistakes backfill (Beat 1).
//
// WHY NOT vitest: better-sqlite3 is built for Electron's ABI (rebuild:sqlite), so it
// throws ERR_DLOPEN_FAILED under vitest's node. This harness runs under Electron's own
// node (ELECTRON_RUN_AS_NODE=1 electron <bundled cjs>), the same way scripts/*.cjs and the
// DB-measurement scripts run — a REAL engine, purely in-memory (`:memory:`, no files).
//
// Bundle + run (see package.json "test:mistakes-backfill"):
//   esbuild electron/mistakes/__tests__/backfill.inmemory.ts --bundle --platform=node \
//     --format=cjs --external:better-sqlite3 --alias:@shared=./shared --outfile=<repo>/node_modules/.cache/...cjs
//   cross-env ELECTRON_RUN_AS_NODE=1 electron <that cjs>

import Database from 'better-sqlite3'
import { migrateMistakesTaxonomy } from '../../db/migrate-mistakes-taxonomy'
import { backfillOrphanMistakes } from '../backfill'
import {
  migrateMistakesBackfill,
  MISTAKES_BACKFILL_MIGRATION_LATCH_KEY,
} from '../../db/migrate-mistakes-backfill'

// ── tiny test runner ────────────────────────────────────────────────────────
let passed = 0
let failed = 0
const failures: string[] = []
function it(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log('  ✓ ' + name)
  } catch (e) {
    failed++
    const msg = e instanceof Error ? e.message : String(e)
    failures.push(name + '\n      -> ' + msg)
    console.log('  ✗ ' + name + '\n      -> ' + msg)
  }
}
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}
function eqJson(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${msg}\n         expected: ${b}\n         actual:   ${a}`)
}

// ── the EXPECTED axis mapping (the spec's dictionary, encoded independently of
//    the implementation so the test asserts the contract, not the code) ───────
const EXPECTED_AXIS: Record<string, 'technical' | 'psychological'> = {
  // psychological
  'Chased extended entry': 'psychological',
  'FOMO entry': 'psychological',
  'Revenge trade': 'psychological',
  'Sized too big': 'psychological',
  'Took profit too early': 'psychological',
  'Cut winner too early': 'psychological',
  'Held loser too long': 'psychological',
  'Ignored stop loss': 'psychological',
  'Extended entry / chasing / FOMO': 'psychological',
  'Stop not held': 'psychological',
  'Profit not taken': 'psychological',
  'Cut winner': 'psychological',
  'Added high': 'psychological',
  'Averaged down': 'psychological',
  // technical
  'Traded outside playbook': 'technical',
  'Forced trade on choppy day': 'technical',
  "MACD X'd / backside": 'technical',
  'No pattern / traded outside playbook': 'technical',
  'Poor stock selection / not obvious': 'technical',
  'Low volume': 'technical',
  'Bought after high vol red candle': 'technical',
  'Stop too tight': 'technical',
  Timing: 'technical',
  'Thick Level 2': 'technical',
  'Technical (e.g. hotkey error)': 'technical',
  'Early Entry': 'technical',
}

// Dave's actual 16 distinct strings (all dictionary-mapped).
const DAVE_16 = [
  'No pattern / traded outside playbook', "MACD X'd / backside",
  'Extended entry / chasing / FOMO', 'Stop not held', 'Poor stock selection / not obvious',
  'Revenge trade', 'Profit not taken', 'Cut winner', 'Thick Level 2', 'Added high',
  'Timing', 'Averaged down', 'Stop too tight', 'Bought after high vol red candle',
  'Low volume', 'Technical (e.g. hotkey error)',
]

// ── fixtures ────────────────────────────────────────────────────────────────
function freshDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec('CREATE TABLE trades (id INTEGER PRIMARY KEY, mistakes_json TEXT, deleted_at TEXT)')
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
  migrateMistakesTaxonomy(db) // real DDL: mistake_def (+21 seeds) + trade_mistake + indexes
  return db
}
function addTrade(db: Database.Database, id: number, mistakes: string[] | null, deleted = false): void {
  db.prepare('INSERT INTO trades (id, mistakes_json, deleted_at) VALUES (?, ?, ?)').run(
    id,
    mistakes === null ? null : JSON.stringify(mistakes),
    deleted ? '2026-01-01T00:00:00Z' : null,
  )
}
const customDefs = (db: Database.Database) =>
  db.prepare('SELECT axis, name FROM mistake_def WHERE is_custom = 1').all() as { axis: string; name: string }[]
const countDefs = (db: Database.Database) =>
  (db.prepare('SELECT COUNT(*) AS n FROM mistake_def').get() as { n: number }).n
const countLinks = (db: Database.Database) =>
  (db.prepare('SELECT COUNT(*) AS n FROM trade_mistake').get() as { n: number }).n
const defIdByName = (db: Database.Database, name: string) =>
  (db.prepare('SELECT id, axis, is_custom FROM mistake_def WHERE name = ?').all(name)) as {
    id: number; axis: string; is_custom: number
  }[]

// ── tests ───────────────────────────────────────────────────────────────────
console.log('mistakes backfill — in-memory harness\n')

it('axis correctness: Dave’s 16 strings become defs with exactly the mapped axes', () => {
  const db = freshDb()
  addTrade(db, 1, DAVE_16.slice(0, 8))
  addTrade(db, 2, DAVE_16.slice(8))
  const report = backfillOrphanMistakes(db)
  assert(report.defsCreated === 16, `defsCreated expected 16, got ${report.defsCreated}`)
  const got: Record<string, string> = {}
  for (const d of customDefs(db)) got[d.name] = d.axis
  const want: Record<string, string> = {}
  for (const s of DAVE_16) want[s] = EXPECTED_AXIS[s]
  eqJson(got, want, 'created custom def axes must equal the dictionary mapping')
  db.close()
})

it('link correctness: total links == distinct (trade,string) pairs, each to the right def', () => {
  const db = freshDb()
  addTrade(db, 1, ['FOMO entry', "MACD X'd / backside", 'FOMO entry']) // dup within row
  addTrade(db, 2, ['FOMO entry', 'Unknown X']) // cross-trade repeat + one unknown
  const report = backfillOrphanMistakes(db)
  // distinct dict pairs: (1,FOMO entry),(1,MACD X'd / backside),(2,FOMO entry) = 3
  assert(report.linksCreated === 3, `linksCreated expected 3, got ${report.linksCreated}`)
  assert(countLinks(db) === 3, `trade_mistake rows expected 3, got ${countLinks(db)}`)
  const rows = db
    .prepare(
      `SELECT tm.trade_id AS t, md.name AS name, md.axis AS axis
       FROM trade_mistake tm JOIN mistake_def md ON md.id = tm.mistake_def_id
       ORDER BY tm.trade_id, md.name`,
    )
    .all() as { t: number; name: string; axis: string }[]
  eqJson(rows, [
    // ordered by (trade_id, md.name): 'FOMO entry' (F) sorts before "MACD X'd / backside" (M)
    { t: 1, name: 'FOMO entry', axis: 'psychological' },
    { t: 1, name: "MACD X'd / backside", axis: 'technical' },
    { t: 2, name: 'FOMO entry', axis: 'psychological' },
  ], 'each (trade,string) pair must link to the axis-correct def')
  db.close()
})

it('preserve: mistakes_json is byte-identical before and after the backfill', () => {
  const db = freshDb()
  addTrade(db, 1, ['FOMO entry', 'FOMO entry', "MACD X'd / backside"])
  addTrade(db, 2, ['Unknown X', 'Revenge trade'])
  addTrade(db, 3, null)
  const before = db.prepare('SELECT id, mistakes_json FROM trades ORDER BY id').all()
  backfillOrphanMistakes(db)
  const after = db.prepare('SELECT id, mistakes_json FROM trades ORDER BY id').all()
  eqJson(after, before, 'mistakes_json must never be modified')
  db.close()
})

it('unused strings: a picklist-only string never tagged on a trade produces NO def', () => {
  const db = freshDb()
  db.prepare("INSERT INTO settings (key, value) VALUES ('mistake_list', ?)").run(
    JSON.stringify(['Revenge trade', 'Never Tagged Label']),
  )
  addTrade(db, 1, ['Revenge trade']) // only this is tagged
  backfillOrphanMistakes(db)
  assert(defIdByName(db, 'Never Tagged Label').length === 0, 'unused picklist entry must not create a def')
  assert(defIdByName(db, 'Revenge trade').length === 1, 'the tagged string must create exactly one def')
  db.close()
})

it('no-guess fallback: an unknown string produces no def/link and lands in uncategorizedStrings', () => {
  const db = freshDb()
  addTrade(db, 1, ['Totally Novel Reason', 'Totally Novel Reason']) // 2 occurrences, 1 trade
  addTrade(db, 2, ['Totally Novel Reason', 'FOMO entry']) // +1 occurrence, +1 trade
  const report = backfillOrphanMistakes(db)
  assert(defIdByName(db, 'Totally Novel Reason').length === 0, 'unknown string must not create a def')
  const linkedNames = (db.prepare('SELECT md.name FROM trade_mistake tm JOIN mistake_def md ON md.id = tm.mistake_def_id').all() as { name: string }[]).map((r) => r.name)
  assert(!linkedNames.includes('Totally Novel Reason'), 'unknown string must not be linked')
  eqJson(report.uncategorizedStrings, [
    { string: 'Totally Novel Reason', count: 3, tradeCount: 2 },
  ], 'the unknown string must be reported with count(occurrences) + tradeCount(distinct trades)')
  db.close()
})

it('idempotency: a second run creates 0 defs / 0 links and leaves totals unchanged', () => {
  const db = freshDb()
  addTrade(db, 1, ['FOMO entry', "MACD X'd / backside"])
  addTrade(db, 2, ['Revenge trade', 'FOMO entry'])
  backfillOrphanMistakes(db)
  const defs1 = countDefs(db)
  const links1 = countLinks(db)
  const report2 = backfillOrphanMistakes(db)
  assert(report2.defsCreated === 0, `second run defsCreated expected 0, got ${report2.defsCreated}`)
  assert(report2.linksCreated === 0, `second run linksCreated expected 0, got ${report2.linksCreated}`)
  assert(countDefs(db) === defs1, 'def count must be stable across runs')
  assert(countLinks(db) === links1, 'link count must be stable across runs')
  db.close()
})

it('existing-def reuse: a string matching an existing def name (dictionary axis) links, no duplicate', () => {
  const db = freshDb()
  // Pre-insert a NON-custom def named exactly a dictionary string (simulating a seed match).
  db.prepare(
    "INSERT INTO mistake_def (axis, name, sort_position, is_custom, is_archived) VALUES ('psychological', 'Revenge trade', 50, 0, 0)",
  ).run()
  const existing = defIdByName(db, 'Revenge trade')
  assert(existing.length === 1, 'setup: exactly one pre-existing def')
  const existingId = existing[0].id
  addTrade(db, 1, ['Revenge trade'])
  const report = backfillOrphanMistakes(db)
  assert(defIdByName(db, 'Revenge trade').length === 1, 'must NOT create a duplicate def')
  assert(report.defsCreated === 0, `defsCreated expected 0 (reuse), got ${report.defsCreated}`)
  const link = db.prepare('SELECT mistake_def_id AS id FROM trade_mistake WHERE trade_id = 1').get() as { id: number }
  assert(link.id === existingId, `link must point at the existing def ${existingId}, got ${link.id}`)
  assert(defIdByName(db, 'Revenge trade')[0].is_custom === 0, 'the reused def keeps its is_custom flag')
  db.close()
})

// ── wrapper (migration 44 -> 45) ────────────────────────────────────────────
const latchSet = (db: Database.Database) =>
  (db.prepare('SELECT value FROM settings WHERE key = ?').get(MISTAKES_BACKFILL_MIGRATION_LATCH_KEY) as { value: string } | undefined)?.value === 'true'

it('wrapper gate: priorVersion >= 45 is a no-op (already-migrated)', () => {
  const db = freshDb()
  addTrade(db, 1, ['FOMO entry'])
  const r = migrateMistakesBackfill(db, 45)
  assert(r.ran === false && r.reason === 'already-migrated', `expected already-migrated, got ${JSON.stringify(r)}`)
  assert(countLinks(db) === 0, 'no links on a gated no-op')
  db.close()
})

it('wrapper gate: fresh install (priorVersion 0) is a no-op', () => {
  const db = freshDb()
  addTrade(db, 1, ['FOMO entry'])
  const r = migrateMistakesBackfill(db, 0)
  assert(r.ran === false && r.reason === 'fresh-install', `expected fresh-install, got ${JSON.stringify(r)}`)
  assert(countLinks(db) === 0, 'no links on a fresh-install no-op')
  db.close()
})

it('wrapper latch: a set latch skips the backfill', () => {
  const db = freshDb()
  addTrade(db, 1, ['FOMO entry'])
  db.prepare("INSERT INTO settings (key, value) VALUES (?, 'true')").run(MISTAKES_BACKFILL_MIGRATION_LATCH_KEY)
  const r = migrateMistakesBackfill(db, 44)
  assert(r.ran === false && r.reason === 'latched', `expected latched, got ${JSON.stringify(r)}`)
  assert(countLinks(db) === 0, 'no links when latched')
  db.close()
})

it('wrapper backup-abort: a throwing backup aborts — no defs, no links, latch unset', () => {
  const db = freshDb()
  addTrade(db, 1, ['FOMO entry'])
  const before = countDefs(db)
  const r = migrateMistakesBackfill(db, 44, { backup: () => { throw new Error('disk full') } })
  assert(r.ran === false && r.reason === 'backup-failed', `expected backup-failed, got ${JSON.stringify(r)}`)
  assert(countLinks(db) === 0, 'no links after a backup abort')
  assert(countDefs(db) === before, 'no defs after a backup abort')
  assert(!latchSet(db), 'latch must NOT be set after a backup abort')
  db.close()
})

it('wrapper happy path: runs the backfill in a txn, latches, returns the report', () => {
  const db = freshDb()
  addTrade(db, 1, ['FOMO entry', "MACD X'd / backside"])
  addTrade(db, 2, ['Revenge trade'])
  let backupCalls = 0
  const r = migrateMistakesBackfill(db, 44, { backup: () => { backupCalls++ } })
  assert(r.ran === true, `expected ran:true, got ${JSON.stringify(r)}`)
  assert(backupCalls === 1, 'backup runs exactly once')
  assert(!!r.report && r.report.defsCreated === 3, `report.defsCreated expected 3, got ${r.report?.defsCreated}`)
  assert(countLinks(db) === 3, `links expected 3, got ${countLinks(db)}`)
  assert(latchSet(db), 'latch must be set after success')
  db.close()
})

it('wrapper idempotency: a second run is a latched no-op', () => {
  const db = freshDb()
  addTrade(db, 1, ['FOMO entry'])
  migrateMistakesBackfill(db, 44)
  const links1 = countLinks(db)
  const r2 = migrateMistakesBackfill(db, 44)
  assert(r2.ran === false && r2.reason === 'latched', `second run expected latched, got ${JSON.stringify(r2)}`)
  assert(countLinks(db) === links1, 'links stable on the second wrapper run')
  db.close()
})

// ── summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed / ${passed + failed} total`)
if (failed > 0) {
  console.log('\nFAILURES:')
  for (const f of failures) console.log('  ✗ ' + f)
  process.exit(1)
}
process.exit(0)
