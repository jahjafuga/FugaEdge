// One-shot probe for multi-target ON CONFLICT support in the bundled
// SQLite. Verifies that an INSERT can declare TWO ON CONFLICT clauses
// against distinct unique constraints, and that each catches independently.
//
// Run via the project's electron-as-node binary (better-sqlite3 native is
// built for Electron's ABI):
//   npm run inspect:schema  is the template — but for a one-off we can use
//   electron directly:  electron --eval "...".  For a self-contained
//   probe, use a plain node binary IF the system node ABI matches; in this
//   workspace we use:  ELECTRON_RUN_AS_NODE=1 electron scripts\verify-multi-conflict.cjs

const Database = require('better-sqlite3')

const db = new Database(':memory:')
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exec_hash TEXT NOT NULL UNIQUE,
    content_hash TEXT
  );
  CREATE UNIQUE INDEX idx_trades_content_hash
    ON trades(content_hash) WHERE content_hash IS NOT NULL;
`)

console.log('SQLite version:', db.prepare('SELECT sqlite_version() AS v').get().v)

// Probe 1: multi-target ON CONFLICT — both clauses targeting distinct unique constraints
let multiTargetWorks = false
try {
  const stmt = db.prepare(`
    INSERT INTO trades (exec_hash, content_hash) VALUES (@e, @c)
    ON CONFLICT(exec_hash) DO NOTHING
    ON CONFLICT(content_hash) DO NOTHING
  `)
  // Seed
  stmt.run({ e: 'E1', c: 'C1' })
  // exec_hash collision
  const r2 = stmt.run({ e: 'E1', c: 'C2' })
  // content_hash collision
  const r3 = stmt.run({ e: 'E2', c: 'C1' })
  // both fresh
  const r4 = stmt.run({ e: 'E3', c: 'C3' })

  const rows = db.prepare('SELECT exec_hash, content_hash FROM trades ORDER BY id').all()
  console.log('Multi-target ON CONFLICT result:')
  console.log('  inserted rows:', rows)
  console.log('  exec collision changes:', r2.changes, '(expect 0)')
  console.log('  content collision changes:', r3.changes, '(expect 0)')
  console.log('  both-fresh changes:', r4.changes, '(expect 1)')
  if (rows.length === 2 && r2.changes === 0 && r3.changes === 0 && r4.changes === 1) {
    multiTargetWorks = true
    console.log('  -> MULTI-TARGET ON CONFLICT WORKS')
  } else {
    console.log('  -> multi-target syntax accepted but behaviour wrong')
  }
} catch (e) {
  console.log('Multi-target ON CONFLICT THREW:', e.message)
}

// Probe 2: INSERT OR IGNORE fallback (should always work)
db.exec('DELETE FROM trades')
try {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO trades (exec_hash, content_hash) VALUES (@e, @c)'
  )
  stmt.run({ e: 'F1', c: 'D1' })
  const r2 = stmt.run({ e: 'F1', c: 'D2' })   // exec collision
  const r3 = stmt.run({ e: 'F2', c: 'D1' })   // content collision
  const r4 = stmt.run({ e: 'F3', c: 'D3' })   // both fresh
  const rows = db.prepare('SELECT exec_hash, content_hash FROM trades ORDER BY id').all()
  console.log('\nINSERT OR IGNORE fallback:')
  console.log('  inserted rows:', rows)
  console.log('  exec collision changes:', r2.changes)
  console.log('  content collision changes:', r3.changes)
  console.log('  both-fresh changes:', r4.changes)
} catch (e) {
  console.log('INSERT OR IGNORE THREW:', e.message)
}

console.log('\nFINAL: multi-target supported =', multiTargetWorks)
process.exit(multiTargetWorks ? 0 : 1)
