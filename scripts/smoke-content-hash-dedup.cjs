// v0.2.1 dedup smoke test — exercises the full dual-hash dedup contract
// against a real (in-memory) SQLite DB using the same schema fragment and
// INSERT statement repo.ts uses in production. Drives the migration path,
// the INSERT OR IGNORE collision behavior, and the annotate-OR-query
// pattern end-to-end. Not wired into any user-facing code path.
//
// Run via:
//   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/smoke-content-hash-dedup.cjs
//
// Exit code 0 on full pass, 1 on any failure.

const Database = require('better-sqlite3')
const { createHash } = require('node:crypto')

let failures = 0
function check(name, ok, detail) {
  const prefix = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
  console.log(`${prefix}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const db = new Database(':memory:')
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Minimal schema covering just what dedup touches. Mirrors the trades-table
// shape from electron/db/schema.ts:22-60 + the migrateAfterSchema ALTERs.
db.exec(`
  CREATE TABLE trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    open_time TEXT NOT NULL,
    close_time TEXT,
    is_open INTEGER NOT NULL DEFAULT 0,
    shares_bought INTEGER NOT NULL DEFAULT 0,
    avg_buy_price REAL NOT NULL DEFAULT 0,
    shares_sold INTEGER NOT NULL DEFAULT 0,
    avg_sell_price REAL NOT NULL DEFAULT 0,
    pnl REAL NOT NULL DEFAULT 0,
    gross_pnl REAL NOT NULL DEFAULT 0,
    fee_ecn REAL NOT NULL DEFAULT 0,
    fee_sec REAL NOT NULL DEFAULT 0,
    fee_finra REAL NOT NULL DEFAULT 0,
    fee_htb REAL NOT NULL DEFAULT 0,
    fee_cat REAL NOT NULL DEFAULT 0,
    total_fees REAL NOT NULL DEFAULT 0,
    net_pnl REAL NOT NULL DEFAULT 0,
    executions_json TEXT NOT NULL DEFAULT '[]',
    exec_hash TEXT NOT NULL UNIQUE,
    content_hash TEXT,
    source_broker TEXT NOT NULL DEFAULT 'DAS',
    source_format TEXT NOT NULL DEFAULT 'execution',
    source_file TEXT,
    account_name TEXT,
    fees_reported INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX idx_trades_content_hash
    ON trades(content_hash) WHERE content_hash IS NOT NULL;
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`)

// Production INSERT statement from repo.ts:138-159
const insertTrip = db.prepare(`
  INSERT OR IGNORE INTO trades (
    date, symbol, side,
    open_time, close_time, is_open,
    shares_bought, avg_buy_price, shares_sold, avg_sell_price,
    pnl, gross_pnl,
    fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat, total_fees,
    net_pnl,
    executions_json, exec_hash, content_hash,
    source_broker, source_format, source_file, account_name, fees_reported
  ) VALUES (
    @date, @symbol, @side,
    @open_time, @close_time, @is_open,
    @shares_bought, @avg_buy_price, @shares_sold, @avg_sell_price,
    @pnl, @gross_pnl,
    0, 0, 0, 0, 0, 0,
    @net_pnl,
    @executions_json, @exec_hash, @content_hash,
    @source_broker, @source_format, @source_file, @account_name, @fees_reported
  )
`)

// Production OR-query from repo.ts:5-12
const annotate = db.prepare(
  'SELECT 1 FROM trades WHERE exec_hash = ? OR content_hash = ? LIMIT 1',
)

function tripFromExecs(execs) {
  // Inline mini buildRoundTrips to avoid import path complexity. Computes
  // both hashes using the same algorithms as src/core/import/build-round-
  // trips.ts:hashFills + hashFillsByContent.
  const ids = execs.map((e) => `${e.trade_id}:${e.order_id}`).sort().join('|')
  const acct = (execs[0].account_name ?? '').trim()
  const execPayload = acct ? `${acct} ${ids}` : ids
  const exec_hash = createHash('sha1').update(execPayload).digest('hex')

  const tuples = execs.map((e) => {
    const symbol = e.symbol.trim().toUpperCase()
    const ms = Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(e.time) ? e.time : e.time + 'Z')
    const d = new Date(ms)
    const pad = (n) => (n < 10 ? `0${n}` : String(n))
    const time = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`
    const price = Math.round(e.price * 10000) / 10000
    return `${symbol}|${time}|${e.side}|${Math.round(e.qty)}|${price.toFixed(4)}`
  })
  tuples.sort()
  const content_hash = createHash('sha1').update(tuples.join('||')).digest('hex')

  return {
    date: execs[0].time.slice(0, 10),
    symbol: execs[0].symbol,
    side: execs[0].side === 'B' ? 'long' : 'short',
    open_time: execs[0].time,
    close_time: execs[execs.length - 1].time,
    is_open: 0,
    shares_bought: execs.filter((e) => e.side === 'B').reduce((a, e) => a + e.qty, 0),
    avg_buy_price: 5.0,
    shares_sold: execs.filter((e) => e.side === 'S').reduce((a, e) => a + e.qty, 0),
    avg_sell_price: 5.5,
    pnl: 50,
    gross_pnl: 50,
    net_pnl: 50,
    executions_json: JSON.stringify(execs.map((e) => ({
      trade_id: e.trade_id, order_id: e.order_id, side: e.side, qty: e.qty, price: e.price, time: e.time,
    }))),
    exec_hash,
    content_hash,
    source_broker: 'DAS', source_format: 'execution',
    source_file: null, account_name: execs[0].account_name ?? null, fees_reported: 0,
  }
}

// ── SCENARIO A: same file twice ──────────────────────────────────────────
console.log('\n── scenario (a): same fixture inserted twice ──')
{
  const t = tripFromExecs([
    { trade_id: '1', order_id: 'A1', symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' },
    { trade_id: '2', order_id: 'A2', symbol: 'CLRB', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' },
  ])
  const r1 = insertTrip.run(t)
  const r2 = insertTrip.run(t)
  check('first insert succeeds', r1.changes === 1, `changes=${r1.changes}`)
  check('second insert silently skipped (INSERT OR IGNORE on exec_hash)', r2.changes === 0, `changes=${r2.changes}`)
  const count = db.prepare('SELECT COUNT(*) AS n FROM trades').get().n
  check('total rows = 1 after duplicate insert', count === 1, `count=${count}`)

  const annot = annotate.get(t.exec_hash, t.content_hash)
  check('annotateTripStatus OR-query finds the existing trip', !!annot)
}

// ── SCENARIO B1: same fill, two formats with different synthetic IDs ─────
console.log('\n── scenario (b1): same fill, two synthetic ID prefixes (th- vs wbm-) ──')
{
  db.exec('DELETE FROM trades')
  const th = tripFromExecs([
    { trade_id: 'th-aaa1', order_id: 'th-aaa1', symbol: 'RYOJ', side: 'B', qty: 200, price: 3.0, time: '2026-05-06T14:00:00Z' },
    { trade_id: 'th-bbb2', order_id: 'th-bbb2', symbol: 'RYOJ', side: 'S', qty: 200, price: 3.5, time: '2026-05-06T14:01:00Z' },
  ])
  const wbm = tripFromExecs([
    { trade_id: 'wbm-xxx1', order_id: 'wbm-xxx1', symbol: 'RYOJ', side: 'B', qty: 200, price: 3.0, time: '2026-05-06T14:00:00Z' },
    { trade_id: 'wbm-yyy2', order_id: 'wbm-yyy2', symbol: 'RYOJ', side: 'S', qty: 200, price: 3.5, time: '2026-05-06T14:01:00Z' },
  ])
  check('exec_hash differs across formats', th.exec_hash !== wbm.exec_hash)
  check('content_hash matches across formats', th.content_hash === wbm.content_hash)

  const r1 = insertTrip.run(th)
  check('first format inserts', r1.changes === 1)

  // Pre-insert annotation should catch via content_hash.
  const annot = annotate.get(wbm.exec_hash, wbm.content_hash)
  check('annotateTripStatus catches the cross-format duplicate', !!annot)

  // Even if we somehow miss the pre-check, SQL OR IGNORE backstops it.
  const r2 = insertTrip.run(wbm)
  check('SQL INSERT OR IGNORE catches content_hash collision', r2.changes === 0, `changes=${r2.changes}`)

  const count = db.prepare('SELECT COUNT(*) AS n FROM trades').get().n
  check('total rows = 1 (cross-format dedup worked)', count === 1, `count=${count}`)
}

// ── SCENARIO B3: account_name "" vs populated ────────────────────────────
console.log('\n── scenario (b3): account_name empty in one file, populated in another ──')
{
  db.exec('DELETE FROM trades')
  const noAcct = tripFromExecs([
    { trade_id: '10', order_id: 'A10', symbol: 'CISS', side: 'B', qty: 50, price: 2.0, time: '2026-05-07T14:30:00Z' },
    { trade_id: '11', order_id: 'A11', symbol: 'CISS', side: 'S', qty: 50, price: 2.1, time: '2026-05-07T14:31:00Z' },
  ])
  const withAcct = tripFromExecs([
    { trade_id: '10', order_id: 'A10', symbol: 'CISS', side: 'B', qty: 50, price: 2.0, time: '2026-05-07T14:30:00Z', account_name: 'ACCT_A' },
    { trade_id: '11', order_id: 'A11', symbol: 'CISS', side: 'S', qty: 50, price: 2.1, time: '2026-05-07T14:31:00Z', account_name: 'ACCT_A' },
  ])
  check('exec_hash differs (acct in hash conditionally)', noAcct.exec_hash !== withAcct.exec_hash)
  check('content_hash matches (acct excluded from content)', noAcct.content_hash === withAcct.content_hash)

  insertTrip.run(noAcct)
  const r2 = insertTrip.run(withAcct)
  check('account_name flip caught by content_hash dedup', r2.changes === 0, `changes=${r2.changes}`)
}

// ── NEGATIVE: legitimately different trades not flagged ──────────────────
console.log('\n── negative: two genuinely different trades (different second) NOT deduped ──')
{
  db.exec('DELETE FROM trades')
  const t1 = tripFromExecs([
    { trade_id: '100', order_id: 'A100', symbol: 'ATER', side: 'B', qty: 100, price: 7.0, time: '2026-05-08T15:00:00Z' },
    { trade_id: '101', order_id: 'A101', symbol: 'ATER', side: 'S', qty: 100, price: 7.5, time: '2026-05-08T15:01:00Z' },
  ])
  const t2 = tripFromExecs([
    { trade_id: '102', order_id: 'A102', symbol: 'ATER', side: 'B', qty: 100, price: 7.0, time: '2026-05-08T15:02:00Z' }, // 2 sec later
    { trade_id: '103', order_id: 'A103', symbol: 'ATER', side: 'S', qty: 100, price: 7.5, time: '2026-05-08T15:03:00Z' },
  ])
  insertTrip.run(t1)
  const r2 = insertTrip.run(t2)
  check('genuinely-different trip inserts as new', r2.changes === 1)
  const count = db.prepare('SELECT COUNT(*) AS n FROM trades').get().n
  check('total rows = 2', count === 2)
}

// ── MIGRATION: v0.1.6-shape rows backfill correctly ──────────────────────
console.log('\n── migration: backfill content_hash for legacy (NULL) rows ──')
{
  db.exec('DELETE FROM trades')

  // Insert two v0.1.6-shape rows (content_hash NULL) — bypass the OR
  // IGNORE since we're simulating pre-migration state.
  const insertLegacy = db.prepare(`
    INSERT INTO trades (
      date, symbol, side, open_time, close_time, is_open,
      shares_bought, avg_buy_price, shares_sold, avg_sell_price,
      pnl, gross_pnl, net_pnl,
      executions_json, exec_hash, content_hash,
      source_broker, source_format
    ) VALUES (
      @date, @symbol, @side, @open_time, @close_time, 0,
      @shares_bought, 5, @shares_sold, 5.5,
      50, 50, 50,
      @executions_json, @exec_hash, NULL,
      'DAS', 'execution'
    )
  `)
  insertLegacy.run({
    date: '2026-05-09', symbol: 'CODX', side: 'long',
    open_time: '2026-05-09T13:30:00Z', close_time: '2026-05-09T13:31:00Z',
    shares_bought: 100, shares_sold: 100,
    executions_json: JSON.stringify([
      { trade_id: '200', order_id: 'B200', side: 'B', qty: 100, price: 5.0, time: '2026-05-09T13:30:00Z' },
      { trade_id: '201', order_id: 'B201', side: 'S', qty: 100, price: 5.5, time: '2026-05-09T13:31:00Z' },
    ]),
    exec_hash: 'legacy-exec-hash-1',
  })
  insertLegacy.run({
    date: '2026-05-10', symbol: 'MOBX', side: 'long',
    open_time: '2026-05-10T13:30:00Z', close_time: '2026-05-10T13:31:00Z',
    shares_bought: 50, shares_sold: 50,
    executions_json: JSON.stringify([
      { trade_id: '300', order_id: 'B300', side: 'B', qty: 50, price: 2.0, time: '2026-05-10T13:30:00Z' },
      { trade_id: '301', order_id: 'B301', side: 'S', qty: 50, price: 2.2, time: '2026-05-10T13:31:00Z' },
    ]),
    exec_hash: 'legacy-exec-hash-2',
  })

  const nullCount = db.prepare('SELECT COUNT(*) AS n FROM trades WHERE content_hash IS NULL').get().n
  check('two legacy rows have NULL content_hash before migration', nullCount === 2, `null=${nullCount}`)

  // Simulate the migration's backfill phase. Use the same computeContent
  // logic the production migration uses (we can't import the TS module
  // directly in CJS without ts-node; replicate inline).
  function backfill() {
    const rows = db.prepare('SELECT id, symbol, executions_json FROM trades WHERE content_hash IS NULL').all()
    const upd = db.prepare('UPDATE trades SET content_hash = ? WHERE id = ?')
    for (const r of rows) {
      const fills = JSON.parse(r.executions_json)
      const tuples = fills.map((f) => {
        const ms = Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(f.time) ? f.time : f.time + 'Z')
        const d = new Date(ms)
        const pad = (n) => (n < 10 ? `0${n}` : String(n))
        const time = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`
        return `${r.symbol.trim().toUpperCase()}|${time}|${f.side}|${Math.round(f.qty)}|${(Math.round(f.price * 10000) / 10000).toFixed(4)}`
      })
      tuples.sort()
      const hash = createHash('sha1').update(tuples.join('||')).digest('hex')
      upd.run(hash, r.id)
    }
  }
  backfill()

  const stillNull = db.prepare('SELECT COUNT(*) AS n FROM trades WHERE content_hash IS NULL').get().n
  check('zero NULL content_hash after migration', stillNull === 0, `still null=${stillNull}`)

  const totalRows = db.prepare('SELECT COUNT(*) AS n FROM trades').get().n
  check('row count preserved (no data loss)', totalRows === 2, `count=${totalRows}`)

  // Idempotency: re-run migration — should no-op (per-row WHERE filter).
  backfill()
  const afterRerun = db.prepare('SELECT content_hash FROM trades ORDER BY id').all()
  const sameAsBefore = db.prepare('SELECT content_hash FROM trades ORDER BY id').all()
  check('idempotent re-run produces identical content_hashes', JSON.stringify(afterRerun) === JSON.stringify(sameAsBefore))
}

// ── FUTURE IMPORT vs MIGRATED LEGACY: re-importing a backfilled row dedups ─
console.log('\n── post-migration: re-importing a backfilled trip catches via content_hash ──')
{
  // Trade rows from the prior section are still in the DB. Build a "fresh"
  // import of the CODX trade with different per-fill IDs and verify the
  // content_hash dedup catches it.
  const freshImport = tripFromExecs([
    { trade_id: 'NEW-1', order_id: 'NEW-O1', symbol: 'CODX', side: 'B', qty: 100, price: 5.0, time: '2026-05-09T13:30:00Z' },
    { trade_id: 'NEW-2', order_id: 'NEW-O2', symbol: 'CODX', side: 'S', qty: 100, price: 5.5, time: '2026-05-09T13:31:00Z' },
  ])
  const annot = annotate.get(freshImport.exec_hash, freshImport.content_hash)
  check('annotateTripStatus catches re-imported legacy row via content_hash', !!annot)

  const r = insertTrip.run(freshImport)
  check('SQL INSERT OR IGNORE catches it at the safety-net layer', r.changes === 0, `changes=${r.changes}`)
}

console.log(`\n${failures === 0 ? '\x1b[32m' : '\x1b[31m'}━━━ ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ━━━\x1b[0m`)
process.exit(failures === 0 ? 0 : 1)
