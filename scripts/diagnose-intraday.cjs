// One-shot diagnostic. Reads the live DB and prints:
//  - schema version
//  - intraday_bars row count + per-symbol breakdown
//  - any cached error for ODYS 2026-05-11
//  - the two ODYS trades for 2026-05-11 (entry price, open_time, ema9 distance)
//
// Run: node scripts\diagnose-intraday.cjs

const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const Database = require('better-sqlite3')

const candidates = [
  path.join(process.env.APPDATA || '', 'fugaedge', 'fugaedge.db'),
  path.join(process.env.APPDATA || '', 'FugaEdge', 'fugaedge.db'),
  path.join(process.env.APPDATA || '', 'fugajournal', 'fugajournal.db'),
]
const dbPath = candidates.find((p) => fs.existsSync(p))
if (!dbPath) {
  console.error('No DB found at any expected path')
  process.exit(1)
}
console.log(`Using DB: ${dbPath}`)

const db = new Database(dbPath, { readonly: true })

const meta = db.prepare("SELECT value FROM _meta WHERE key='schema_version'").get()
console.log(`schema_version: ${meta ? meta.value : '(none)'}`)

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
).all()
console.log(`tables: ${tables.map((t) => t.name).join(', ')}`)

if (!tables.find((t) => t.name === 'intraday_bars')) {
  console.error('intraday_bars table is MISSING')
  process.exit(2)
}

const intradayCount = db.prepare('SELECT COUNT(*) AS n FROM intraday_bars').get()
console.log(`intraday_bars total rows: ${intradayCount.n}`)

const bySymbol = db
  .prepare(`
    SELECT symbol, date, length(bars) AS bytes,
      CASE WHEN error IS NULL THEN '' ELSE 'ERR: ' || substr(error, 1, 120) END AS err
    FROM intraday_bars
    ORDER BY date DESC, symbol ASC
    LIMIT 30
  `)
  .all()
console.log('intraday_bars sample (latest 30):')
for (const r of bySymbol) {
  console.log(`  ${r.symbol} ${r.date} bytes=${r.bytes} ${r.err}`)
}

const odys = db
  .prepare(
    "SELECT symbol, date, length(bars) AS bytes, error FROM intraday_bars WHERE symbol='ODYS' AND date='2026-05-11'",
  )
  .get()
if (odys) {
  console.log(`\nODYS 2026-05-11: bytes=${odys.bytes} error=${odys.error || '(none)'}`)
  // Count bar entries by parsing the json
  const row = db
    .prepare("SELECT bars FROM intraday_bars WHERE symbol='ODYS' AND date='2026-05-11'")
    .get()
  try {
    const arr = JSON.parse(row.bars)
    console.log(`ODYS bar count: ${arr.length}`)
    if (arr.length > 0) {
      console.log(`  first: ${JSON.stringify(arr[0])}`)
      console.log(`  last : ${JSON.stringify(arr[arr.length - 1])}`)
    }
  } catch (e) {
    console.log(`  parse error: ${e.message}`)
  }
} else {
  console.log(`\nODYS 2026-05-11: NOT CACHED`)
}

console.log('\nODYS trades on 2026-05-11:')
const trades = db
  .prepare(
    `SELECT id, symbol, side, open_time, close_time,
            avg_buy_price, avg_sell_price, entry_ema9_distance_pct
     FROM trades
     WHERE symbol='ODYS' AND date='2026-05-11'
     ORDER BY open_time ASC`,
  )
  .all()
if (trades.length === 0) {
  console.log('  (no ODYS trades on this date)')
} else {
  for (const t of trades) {
    console.log(
      `  #${t.id} ${t.side} open_time=${t.open_time} buy=$${t.avg_buy_price} sell=$${t.avg_sell_price} ema9_distance_pct=${t.entry_ema9_distance_pct}`,
    )
  }
}

const settings = db
  .prepare("SELECT value FROM settings WHERE key='polygon_api_key'")
  .get()
const keyMasked = settings && settings.value
  ? `${settings.value.slice(0, 4)}…${settings.value.slice(-4)} (len=${settings.value.length})`
  : '(empty)'
console.log(`\nAPI key in DB: ${keyMasked}`)

db.close()
