// In-memory better-sqlite3 harness for the catalyst-KIND migration (schema 48 -> 49).
//
// WHY NOT vitest: better-sqlite3 is built for Electron's ABI (rebuild:sqlite), so it throws
// ERR_DLOPEN_FAILED under vitest's node. This harness runs under Electron's own node
// (ELECTRON_RUN_AS_NODE=1 electron <bundled cjs>) — a REAL engine, purely in-memory (`:memory:`,
// no files, never a real .db). Mirrors electron/catalyst/__tests__/backfill.inmemory.ts.
//
// Bundle + run (see package.json "test:catalyst-kind").

import Database from 'better-sqlite3'
import { migrateCatalystVocabulary } from '../migrate-catalyst-vocabulary'
import { migrateCatalystKind, NO_CATALYST_SEED_NAME } from '../migrate-catalyst-kind'

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

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE trades (id INTEGER PRIMARY KEY, catalyst_type TEXT, deleted_at TEXT)')
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
  migrateCatalystVocabulary(db) // real DDL + the 15 seeds
  return db
}
const kindOf = (db: Database.Database, name: string): string | null => {
  const r = db.prepare('SELECT kind FROM catalyst_def WHERE name = ?').get(name) as
    | { kind: string }
    | undefined
  return r ? r.kind : null
}
const allRows = (db: Database.Database) =>
  db.prepare('SELECT name, kind, is_archived FROM catalyst_def').all() as {
    name: string
    kind: string | null
    is_archived: number
  }[]

// ── T1 ──────────────────────────────────────────────────────────────────────
it('T1 adds `kind` and every existing row is non-null after the migration', () => {
  const db = freshDb()
  migrateCatalystKind(db)
  const rows = allRows(db)
  assert(rows.length === 15, `expected the 15 seeds, got ${rows.length}`)
  const nulls = rows.filter((r) => r.kind == null)
  assert(nulls.length === 0, `every row must carry a kind; ${nulls.length} were null`)
  db.close()
})

// ── T2 ──────────────────────────────────────────────────────────────────────
it("T2 the seeded no-catalyst row lands as 'none'; all other seeds 'news'", () => {
  const db = freshDb()
  migrateCatalystKind(db)
  assert(
    kindOf(db, NO_CATALYST_SEED_NAME) === 'none',
    `${NO_CATALYST_SEED_NAME} expected 'none', got ${kindOf(db, NO_CATALYST_SEED_NAME)}`,
  )
  const others = allRows(db).filter((r) => r.name !== NO_CATALYST_SEED_NAME)
  const wrong = others.filter((r) => r.kind !== 'news')
  assert(wrong.length === 0, `all other seeds expected 'news'; wrong: ${JSON.stringify(wrong)}`)
  db.close()
})

// ── T3 ──────────────────────────────────────────────────────────────────────
it('T3 a rename does NOT change kind (the rename-safety property)', () => {
  const db = freshDb()
  migrateCatalystKind(db)
  db.prepare('UPDATE catalyst_def SET name = ? WHERE name = ?').run(
    'My Own Wording',
    NO_CATALYST_SEED_NAME,
  )
  assert(
    kindOf(db, 'My Own Wording') === 'none',
    `renamed row must keep kind 'none', got ${kindOf(db, 'My Own Wording')}`,
  )
  db.close()
})

// ── T4 ──────────────────────────────────────────────────────────────────────
it('T4 an archived row still exposes its kind', () => {
  const db = freshDb()
  migrateCatalystKind(db)
  db.prepare('UPDATE catalyst_def SET is_archived = 1 WHERE name = ?').run(NO_CATALYST_SEED_NAME)
  const r = db
    .prepare('SELECT kind, is_archived FROM catalyst_def WHERE name = ?')
    .get(NO_CATALYST_SEED_NAME) as { kind: string; is_archived: number }
  assert(r.is_archived === 1, 'row should be archived for this test')
  assert(r.kind === 'none', `archived row must still expose kind 'none', got ${r.kind}`)
  db.close()
})

// ── T5 ──────────────────────────────────────────────────────────────────────
it('T5 STAND-DOWN: running the migration twice changes nothing (idempotent)', () => {
  const db = freshDb()
  migrateCatalystKind(db)
  const before = JSON.stringify(allRows(db))
  migrateCatalystKind(db)
  const after = JSON.stringify(allRows(db))
  assert(before === after, `second run mutated the table\n  before: ${before}\n  after:  ${after}`)
  db.close()
})

// ── the derive-from-data law ────────────────────────────────────────────────
it('T5b the no-catalyst row is derived FROM THE DATA: already renamed -> all rows stay news', () => {
  const db = freshDb()
  db.prepare('UPDATE catalyst_def SET name = ? WHERE name = ?').run(
    'Just A Setup',
    NO_CATALYST_SEED_NAME,
  )
  migrateCatalystKind(db)
  const wrong = allRows(db).filter((r) => r.kind !== 'news')
  assert(
    wrong.length === 0,
    `with the seed name absent NOTHING may be guessed as none; got ${JSON.stringify(wrong)}`,
  )
  db.close()
})

console.log(`\n${passed} passed / ${passed + failed} total`)
if (failed > 0) {
  console.log('\nFAILURES:')
  for (const f of failures) console.log('  ✗ ' + f)
  process.exit(1)
}
process.exit(0)
