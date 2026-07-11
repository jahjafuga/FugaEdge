// In-memory better-sqlite3 harness for the orphan-catalyst backfill (catalyst-recovery Beat 1).
//
// WHY NOT vitest: better-sqlite3 is built for Electron's ABI (rebuild:sqlite), so it throws
// ERR_DLOPEN_FAILED under vitest's node. This harness runs under Electron's own node
// (ELECTRON_RUN_AS_NODE=1 electron <bundled cjs>) — a REAL engine, purely in-memory (`:memory:`,
// no files, never a real .db). Mirrors electron/mistakes/__tests__/backfill.inmemory.ts.
//
// Bundle + run (see package.json "test:catalyst-backfill"):
//   esbuild electron/catalyst/__tests__/backfill.inmemory.ts --bundle --platform=node \
//     --format=cjs --external:better-sqlite3 --alias:@shared=./shared --outfile=<repo>/node_modules/.cache/...cjs
//   cross-env ELECTRON_RUN_AS_NODE=1 electron <that cjs>

import Database from 'better-sqlite3'
import { migrateCatalystVocabulary } from '../../db/migrate-catalyst-vocabulary'
import { backfillOrphanCatalysts } from '../backfill'
import {
  migrateCatalystBackfill,
  CATALYST_BACKFILL_MIGRATION_LATCH_KEY,
} from '../../db/migrate-catalyst-backfill'

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

// ── fixtures ────────────────────────────────────────────────────────────────
// A DB in the exact post-schema-35 state the bug lives in: catalyst_def exists and holds the
// 15 hardcoded seeds, and trades carry catalyst_type strings that the seed never covered.
function freshDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE trades (id INTEGER PRIMARY KEY, catalyst_type TEXT, deleted_at TEXT)')
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
  migrateCatalystVocabulary(db) // real DDL: catalyst_def + the partial-unique index + 15 seeds
  return db
}
function addTrade(
  db: Database.Database,
  id: number,
  catalystType: string | null,
  deleted = false,
): void {
  db.prepare('INSERT INTO trades (id, catalyst_type, deleted_at) VALUES (?, ?, ?)').run(
    id,
    catalystType,
    deleted ? '2026-01-01T00:00:00Z' : null,
  )
}
const defsNamed = (db: Database.Database, name: string) =>
  db
    .prepare('SELECT id, name, sort_position, is_custom, is_archived FROM catalyst_def WHERE name = ?')
    .all(name) as { id: number; name: string; sort_position: number; is_custom: number; is_archived: number }[]
const countDefs = (db: Database.Database) =>
  (db.prepare('SELECT COUNT(*) AS n FROM catalyst_def').get() as { n: number }).n

// ── core ────────────────────────────────────────────────────────────────────
console.log('catalyst backfill — in-memory harness\n')

it('RECOVERY (+ bug repro): orphaned trade catalysts get vocabulary rows; already-listed ones are not duplicated', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split')
  addTrade(db, 2, 'Reverse Split')
  addTrade(db, 3, 'Offering')   // seed has 'Offering / Dilution' — NOT equal
  addTrade(db, 4, 'Earnings')   // matches a seeded default
  addTrade(db, 5, 'News / PR')  // matches a seeded default

  // THE BUG, reproduced: schema-35 seeded a hardcoded list and backfilled nothing, so these two
  // sit on trades with no vocabulary row — visible in analytics, invisible in Settings.
  assert(countDefs(db) === 15, `setup: the schema-35 seed is 15 defaults, got ${countDefs(db)}`)
  assert(defsNamed(db, 'Reverse Split').length === 0, 'repro: "Reverse Split" must be orphaned BEFORE the backfill')
  assert(defsNamed(db, 'Offering').length === 0, 'repro: "Offering" must be orphaned BEFORE the backfill')

  const report = backfillOrphanCatalysts(db)

  assert(report.rowsCreated === 2, `rowsCreated expected 2, got ${report.rowsCreated}`)
  eqJson(report.recoveredNames, ['Offering', 'Reverse Split'], 'recoveredNames (enumerated ORDER BY name)')

  const rs = defsNamed(db, 'Reverse Split')
  assert(rs.length === 1, `exactly one "Reverse Split" row, got ${rs.length}`)
  assert(rs[0].is_archived === 0, 'recovered row must be ACTIVE (is_archived = 0)')
  assert(rs[0].is_custom === 1, 'recovered row must be is_custom = 1')

  const off = defsNamed(db, 'Offering')
  assert(off.length === 1, `exactly one "Offering" row, got ${off.length}`)
  assert(off[0].is_archived === 0 && off[0].is_custom === 1, '"Offering" recovered active + custom')

  assert(defsNamed(db, 'Earnings').length === 1, '"Earnings" already existed — must not be duplicated')
  assert(defsNamed(db, 'News / PR').length === 1, '"News / PR" already existed — must not be duplicated')
  assert(countDefs(db) === 17, `def count expected 15 + 2 = 17, got ${countDefs(db)}`)
  db.close()
})

it('DATA-DERIVED (not hardcoded): an arbitrary user-invented catalyst is recovered too', () => {
  const db = freshDb()
  addTrade(db, 1, 'Bitcoin Halving Pump') // in nobody's default list — only this user's data
  addTrade(db, 2, 'Short Squeeze')        // seeded
  const report = backfillOrphanCatalysts(db)
  assert(report.rowsCreated === 1, `rowsCreated expected 1, got ${report.rowsCreated}`)
  eqJson(
    report.recoveredNames,
    ['Bitcoin Halving Pump'],
    'the orphan must fall out of the DATA, not out of a hardcoded list (hardcoding is the bug being fixed)',
  )
  assert(defsNamed(db, 'Bitcoin Halving Pump').length === 1, 'a user-invented catalyst must get a row')
  db.close()
})

it('CASE-INSENSITIVE match: a trade tagged "earnings" when "Earnings" is seeded creates NO row', () => {
  const db = freshDb()
  addTrade(db, 1, 'earnings')
  const report = backfillOrphanCatalysts(db)
  assert(report.rowsCreated === 0, `rowsCreated expected 0, got ${report.rowsCreated}`)
  assert(countDefs(db) === 15, `def count must stay 15, got ${countDefs(db)}`)
  db.close()
})

it('CASE-COLLISION guard: two orphan strings differing only in case produce exactly ONE row', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split')
  addTrade(db, 2, 'reverse split')
  // Both miss the def check, but ux_catalyst_def_name_active is UNIQUE on lower(name) WHERE
  // is_archived = 0 — inserting both would throw and roll the whole migration back.
  const report = backfillOrphanCatalysts(db)
  assert(report.rowsCreated === 1, `rowsCreated expected 1, got ${report.rowsCreated}`)
  const rows = db
    .prepare("SELECT name FROM catalyst_def WHERE lower(name) = 'reverse split'")
    .all() as { name: string }[]
  assert(rows.length === 1, `exactly one row for that name, got ${rows.length}`)
  db.close()
})

it('TRIM + NULL/EMPTY: padded values recover trimmed; null / empty / whitespace-only are skipped', () => {
  const db = freshDb()
  addTrade(db, 1, '  Reverse Split  ')
  addTrade(db, 2, null)
  addTrade(db, 3, '')
  addTrade(db, 4, '   ')
  const report = backfillOrphanCatalysts(db)
  assert(report.rowsCreated === 1, `rowsCreated expected 1, got ${report.rowsCreated}`)
  eqJson(report.recoveredNames, ['Reverse Split'], 'the recovered name must be TRIMMED')
  assert(defsNamed(db, 'Reverse Split').length === 1, 'the trimmed-name row exists')
  assert(defsNamed(db, '  Reverse Split  ').length === 0, 'no padded-name row is minted')
  db.close()
})

it('ARCHIVED def is still a row: a deliberately archived catalyst is NOT resurrected as active', () => {
  const db = freshDb()
  db.prepare(
    "INSERT INTO catalyst_def (name, sort_position, is_custom, is_archived) VALUES ('Reverse Split', 99, 1, 1)",
  ).run()
  addTrade(db, 1, 'Reverse Split')
  const report = backfillOrphanCatalysts(db)
  assert(report.rowsCreated === 0, `rowsCreated expected 0 (a row exists, archived), got ${report.rowsCreated}`)
  const rows = defsNamed(db, 'Reverse Split')
  assert(rows.length === 1, `still exactly one row, got ${rows.length}`)
  assert(
    rows[0].is_archived === 1,
    'an archived catalyst stays archived — Settings already shows it under "Show archived" with Restore',
  )
  db.close()
})

it('DELETION-BLIND: a soft-deleted trade’s catalyst is still recovered (its history is restorable)', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split', true) // in Trash
  const report = backfillOrphanCatalysts(db)
  assert(report.rowsCreated === 1, `rowsCreated expected 1, got ${report.rowsCreated}`)
  db.close()
})

it('PRESERVE: trades.catalyst_type is byte-identical before and after', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split')
  addTrade(db, 2, '  Offering  ')
  addTrade(db, 3, 'Earnings')
  addTrade(db, 4, null)
  const before = db.prepare('SELECT id, catalyst_type FROM trades ORDER BY id').all()
  backfillOrphanCatalysts(db)
  const after = db.prepare('SELECT id, catalyst_type FROM trades ORDER BY id').all()
  eqJson(after, before, 'trades.catalyst_type must NEVER be modified — the backfill only ADDS vocabulary rows')
  db.close()
})

it('IDEMPOTENT: a second run creates 0 rows and leaves the vocabulary unchanged', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split')
  addTrade(db, 2, 'Offering')
  const r1 = backfillOrphanCatalysts(db)
  assert(r1.rowsCreated === 2, `first run expected 2, got ${r1.rowsCreated}`)
  const n1 = countDefs(db)
  const r2 = backfillOrphanCatalysts(db)
  assert(r2.rowsCreated === 0, `second run expected 0, got ${r2.rowsCreated}`)
  eqJson(r2.recoveredNames, [], 'the second run recovers nothing')
  assert(countDefs(db) === n1, 'def count stable across runs')
  db.close()
})

it('APPEND: recovered rows take sort_position after the existing max (seeded 15 -> max 14)', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split')
  addTrade(db, 2, 'Offering')
  backfillOrphanCatalysts(db)
  const rows = db
    .prepare('SELECT name, sort_position FROM catalyst_def WHERE is_custom = 1 ORDER BY sort_position')
    .all() as { name: string; sort_position: number }[]
  eqJson(
    rows,
    [
      { name: 'Offering', sort_position: 15 },
      { name: 'Reverse Split', sort_position: 16 },
    ],
    'recovered rows append contiguously after the seeded block',
  )
  db.close()
})

// ── wrapper (migration 45 -> 46) ────────────────────────────────────────────
const latchSet = (db: Database.Database) =>
  (
    db.prepare('SELECT value FROM settings WHERE key = ?').get(CATALYST_BACKFILL_MIGRATION_LATCH_KEY) as
      | { value: string }
      | undefined
  )?.value === 'true'

it('wrapper gate: priorVersion >= 46 is a no-op (already-migrated)', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split')
  const r = migrateCatalystBackfill(db, 46)
  assert(r.ran === false && r.reason === 'already-migrated', `expected already-migrated, got ${JSON.stringify(r)}`)
  assert(countDefs(db) === 15, 'no rows created on a gated no-op')
  db.close()
})

it('wrapper gate: fresh install (priorVersion 0) is a no-op', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split')
  const r = migrateCatalystBackfill(db, 0)
  assert(r.ran === false && r.reason === 'fresh-install', `expected fresh-install, got ${JSON.stringify(r)}`)
  assert(countDefs(db) === 15, 'no rows created on a fresh-install no-op')
  db.close()
})

it('wrapper latch: a set latch skips the backfill', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split')
  db.prepare("INSERT INTO settings (key, value) VALUES (?, 'true')").run(CATALYST_BACKFILL_MIGRATION_LATCH_KEY)
  const r = migrateCatalystBackfill(db, 45)
  assert(r.ran === false && r.reason === 'latched', `expected latched, got ${JSON.stringify(r)}`)
  assert(countDefs(db) === 15, 'no rows created when latched')
  db.close()
})

it('wrapper backup-abort: a throwing backup aborts — no rows, latch unset', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split')
  const r = migrateCatalystBackfill(db, 45, {
    backup: () => {
      throw new Error('disk full')
    },
  })
  assert(r.ran === false && r.reason === 'backup-failed', `expected backup-failed, got ${JSON.stringify(r)}`)
  assert(countDefs(db) === 15, 'no rows created after a backup abort')
  assert(!latchSet(db), 'latch must NOT be set after a backup abort')
  db.close()
})

it('wrapper happy path: runs the backfill in a txn, latches, returns the report', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split')
  addTrade(db, 2, 'Offering')
  addTrade(db, 3, 'Earnings')
  let backupCalls = 0
  const r = migrateCatalystBackfill(db, 45, {
    backup: () => {
      backupCalls++
    },
  })
  assert(r.ran === true, `expected ran:true, got ${JSON.stringify(r)}`)
  assert(backupCalls === 1, 'backup runs exactly once')
  assert(!!r.report && r.report.rowsCreated === 2, `report.rowsCreated expected 2, got ${r.report?.rowsCreated}`)
  eqJson(r.report?.recoveredNames, ['Offering', 'Reverse Split'], 'report carries the recovered names')
  assert(countDefs(db) === 17, `def count expected 17, got ${countDefs(db)}`)
  assert(latchSet(db), 'latch must be set after success')
  db.close()
})

it('wrapper idempotency: a second run is a latched no-op', () => {
  const db = freshDb()
  addTrade(db, 1, 'Reverse Split')
  migrateCatalystBackfill(db, 45)
  const n1 = countDefs(db)
  const r2 = migrateCatalystBackfill(db, 45)
  assert(r2.ran === false && r2.reason === 'latched', `second run expected latched, got ${JSON.stringify(r2)}`)
  assert(countDefs(db) === n1, 'def count stable on the second wrapper run')
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
