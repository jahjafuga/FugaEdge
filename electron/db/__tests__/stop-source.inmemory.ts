// In-memory better-sqlite3 harness for the stop-SOURCE migration (schema 50 -> 51).
//
// WHY NOT vitest: better-sqlite3 is built for Electron's ABI (rebuild:sqlite), so it throws
// ERR_DLOPEN_FAILED under vitest's node. This harness runs under Electron's own node
// (ELECTRON_RUN_AS_NODE=1 electron <bundled cjs>) — a REAL engine, purely in-memory (`:memory:`,
// no files, never a real .db). Mirrors electron/db/__tests__/catalyst-kind.inmemory.ts.
//
// The CHECK constraint (T5) can only be proven by an engine that enforces it, which is the
// whole reason this file exists rather than a vitest spec with a fake connection.
//
// Bundle + run (see package.json "test:stop-source").

import Database from 'better-sqlite3'
import { migrateStopSource } from '../migrate-stop-source'

// -- tiny test runner --------------------------------------------------------
let passed = 0
let failed = 0
const failures: string[] = []
function it(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log('  OK  ' + name)
  } catch (e) {
    failed++
    const msg = e instanceof Error ? e.message : String(e)
    failures.push(name + '\n      -> ' + msg)
    console.log('  X   ' + name + '\n      -> ' + msg)
  }
}
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

/** A trades table carrying only what this migration reads and writes. */
function freshDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE trades (id INTEGER PRIMARY KEY, symbol TEXT, planned_stop_loss_price REAL)',
  )
  return db
}

/** Seed a book that mixes typed stops with untouched ones — the live shape. */
function seedMixed(db: Database.Database): void {
  const ins = db.prepare('INSERT INTO trades (id, symbol, planned_stop_loss_price) VALUES (?,?,?)')
  ins.run(1, 'AAPL', 7.24)
  ins.run(2, 'TSLA', 180.5)
  ins.run(3, 'NVDA', null)
  ins.run(4, 'AMD', 0.0125)
  ins.run(5, 'SOFI', null)
  ins.run(6, 'GME', 21)
}
const rows = (db: Database.Database) =>
  db
    .prepare('SELECT id, planned_stop_loss_price AS stop, stop_source FROM trades ORDER BY id')
    .all() as { id: number; stop: number | null; stop_source: string | null }[]

const tableSql = (db: Database.Database): string =>
  (
    db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='trades'").get() as {
      sql: string
    }
  ).sql

// -- T1 ----------------------------------------------------------------------
it('T1 adds stop_source, and the closed value set is pinned at the storage layer', () => {
  const db = freshDb()
  migrateStopSource(db)
  const cols = db.prepare('PRAGMA table_info(trades)').all() as { name: string; type: string }[]
  const col = cols.find((c) => c.name === 'stop_source')
  assert(col != null, 'trades.stop_source was not added')
  assert(col!.type === 'TEXT', `stop_source should be TEXT, got ${col!.type}`)
  const sql = tableSql(db)
  assert(/CHECK/i.test(sql), `no CHECK constraint on the trades table:\n${sql}`)
  assert(
    sql.includes("'manual'") && sql.includes("'auto'"),
    `the CHECK must name manual and auto:\n${sql}`,
  )
  db.close()
})

// -- T2 -- THE DATA-SAFETY TEST ----------------------------------------------
it("T2 EVERY pre-existing non-null stop is stamped 'manual' — a human typed those", () => {
  const db = freshDb()
  seedMixed(db)
  migrateStopSource(db)
  const withStops = rows(db).filter((r) => r.stop != null)
  assert(withStops.length === 4, `fixture should carry 4 typed stops, got ${withStops.length}`)
  const unstamped = withStops.filter((r) => r.stop_source !== 'manual')
  assert(
    unstamped.length === 0,
    `every typed stop must be stamped manual; unstamped: ${JSON.stringify(unstamped)}`,
  )
  db.close()
})

// -- T3 ----------------------------------------------------------------------
it("T3 a NULL stop keeps a NULL source — absent is not 'auto'", () => {
  const db = freshDb()
  seedMixed(db)
  migrateStopSource(db)
  const withoutStops = rows(db).filter((r) => r.stop == null)
  assert(withoutStops.length === 2, `fixture should carry 2 empty stops, got ${withoutStops.length}`)
  const wrong = withoutStops.filter((r) => r.stop_source !== null)
  assert(
    wrong.length === 0,
    `a row with no stop must carry no source; got ${JSON.stringify(wrong)}`,
  )
  db.close()
})

// -- T4 ----------------------------------------------------------------------
it('T4 running the migration twice changes nothing (idempotent, and never re-stamps)', () => {
  const db = freshDb()
  seedMixed(db)
  migrateStopSource(db)
  // A later auto-fill lands: the second run must NOT drag it back to manual.
  db.prepare("UPDATE trades SET planned_stop_loss_price = 4.5, stop_source = 'auto' WHERE id = 3").run()
  const before = JSON.stringify(rows(db))
  migrateStopSource(db)
  const after = JSON.stringify(rows(db))
  assert(before === after, `second run mutated the table\n  before: ${before}\n  after:  ${after}`)
  db.close()
})

// -- T5 ----------------------------------------------------------------------
it('T5 the CHECK rejects a value outside the set', () => {
  const db = freshDb()
  seedMixed(db)
  migrateStopSource(db)
  let threw = false
  try {
    db.prepare("UPDATE trades SET stop_source = 'polygon' WHERE id = 1").run()
  } catch {
    threw = true
  }
  assert(threw, "the engine accepted stop_source = 'polygon'; the CHECK is not enforcing the set")
  // ...and the legal values still go in.
  db.prepare("UPDATE trades SET stop_source = 'auto' WHERE id = 1").run()
  db.prepare('UPDATE trades SET stop_source = NULL WHERE id = 1').run()
  db.close()
})

console.log(`\n${passed} passed / ${passed + failed} total`)
if (failed > 0) {
  console.log('\nFAILURES:')
  for (const f of failures) console.log('  X ' + f)
  process.exit(1)
}
process.exit(0)
