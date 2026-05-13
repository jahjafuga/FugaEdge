// Same bench as bench-db.mjs, expressed as CommonJS so it runs under
// `ELECTRON_RUN_AS_NODE=1 electron` (which is the only Node-compatible ABI
// where the project's prebuilt better-sqlite3 binary loads on this machine).

const Database = require('better-sqlite3')
const { performance } = require('node:perf_hooks')

const PAD2 = (n) => (n < 10 ? `0${n}` : String(n))

function pickArgs() {
  const fromArgs = process.argv.slice(2).map(Number).filter(Number.isFinite)
  return fromArgs.length > 0 ? fromArgs : [100, 500, 5000]
}

function applySchema(db) {
  db.pragma('journal_mode = MEMORY')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -32000')
  db.pragma('mmap_size = 268435456')
  db.pragma('temp_store = MEMORY')
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
      total_fees REAL NOT NULL DEFAULT 0,
      net_pnl REAL NOT NULL DEFAULT 0,
      executions_json TEXT NOT NULL DEFAULT '[]',
      exec_hash TEXT NOT NULL UNIQUE,
      entry_timeframe TEXT,
      entry_ema9_distance_pct REAL,
      playbook_id INTEGER,
      confidence INTEGER,
      mistakes_json TEXT NOT NULL DEFAULT '[]',
      planned_risk REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_trades_date ON trades(date);
    CREATE INDEX idx_trades_symbol ON trades(symbol);
    CREATE INDEX idx_trades_date_symbol ON trades(date, symbol);
    CREATE INDEX idx_trades_open_time ON trades(open_time);
    CREATE INDEX idx_trades_net_pnl ON trades(net_pnl);
    CREATE INDEX idx_trades_playbook_id ON trades(playbook_id);

    CREATE TABLE trade_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER NOT NULL,
      note_text TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_trade_notes_trade ON trade_notes(trade_id);

    CREATE TABLE trade_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER NOT NULL,
      filename TEXT NOT NULL UNIQUE
    );
    CREATE INDEX idx_trade_attachments_trade ON trade_attachments(trade_id);

    CREATE TABLE playbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      archived INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO playbooks (name) VALUES
      ('1-min Pullback'), ('5-min Pullback'), ('Bull Flag'),
      ('Micro Pullback'), ('VWAP Reclaim'), ('ABCD'),
      ('Halt Resume'), ('Parabolic Short');
  `)
}

function seed(db, n) {
  const symbols = ['NVDA','TSLA','AAPL','META','AMD','SOFI','PLTR','MSFT','GOOG','RIVN','GME','AMC','BBAI','SOUN','MARA','MSTR']
  const sides = ['long','short']
  const tradeInsert = db.prepare(`
    INSERT INTO trades (
      date, symbol, side, open_time, close_time, shares_bought, avg_buy_price,
      shares_sold, avg_sell_price, gross_pnl, total_fees, net_pnl,
      executions_json, exec_hash, playbook_id, confidence, planned_risk
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const noteInsert = db.prepare('INSERT INTO trade_notes (trade_id, note_text) VALUES (?, ?)')
  const attInsert = db.prepare('INSERT INTO trade_attachments (trade_id, filename) VALUES (?, ?)')

  const tx = db.transaction((count) => {
    const start = Date.now() - count * 60_000
    for (let i = 0; i < count; i++) {
      const t0 = new Date(start + i * 60_000)
      const date = `${t0.getFullYear()}-${PAD2(t0.getMonth()+1)}-${PAD2(t0.getDate())}`
      const openIso = t0.toISOString().slice(0,19)
      const closeIso = new Date(t0.getTime() + 5*60*1000).toISOString().slice(0,19)
      const sym = symbols[i % symbols.length]
      const side = sides[i % 2]
      const shares = 200 + (i % 7) * 50
      const buy = 10 + ((i*13) % 200) / 7
      const sell = buy + (((i*7) % 20) - 10) / 10
      const gross = (sell - buy) * shares
      const fees = 0.5 + shares * 0.001
      const net = gross - fees
      const execJson = JSON.stringify([
        { trade_id: `${i}A`, order_id: `${i}A1`, time: openIso, side: 'B', qty: shares, price: buy },
        { trade_id: `${i}B`, order_id: `${i}B1`, time: closeIso, side: 'S', qty: shares, price: sell },
      ])
      tradeInsert.run(
        date, sym, side, openIso, closeIso, shares, buy, shares, sell,
        gross, fees, net, execJson, `hash-${i}`,
        (i % 8) + 1, ((i * 3) % 5) + 1, 50 + (i % 5) * 25,
      )
      if (i % 10 < 3) noteInsert.run(i + 1, `Note text for trade ${i}.`)
      if (i % 100 < 15) {
        attInsert.run(i + 1, `${i}-a.png`)
        if (i % 100 < 8) attInsert.run(i + 1, `${i}-b.png`)
      }
    }
  })
  const t0 = performance.now()
  tx(n)
  return performance.now() - t0
}

function time(fn, runs) {
  for (let i = 0; i < 3; i++) fn()
  const samples = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    fn()
    samples.push(performance.now() - t0)
  }
  samples.sort((a, b) => a - b)
  return {
    min: samples[0],
    p50: samples[Math.floor(samples.length / 2)],
    p95: samples[Math.floor(samples.length * 0.95)],
    max: samples[samples.length - 1],
  }
}

function bench(rowCount) {
  const db = new Database(':memory:')
  applySchema(db)
  const seedMs = seed(db, rowCount)

  const qDashboardOverview = db.prepare(`
    SELECT
      COALESCE(SUM(net_pnl), 0) AS net_pnl,
      COALESCE(SUM(gross_pnl), 0) AS gross_pnl,
      COALESCE(SUM(total_fees), 0) AS total_fees,
      COUNT(*) AS trade_count
    FROM trades WHERE date >= ?
  `)
  const qDashboardDaily = db.prepare(`
    SELECT date, COALESCE(SUM(net_pnl),0) AS net_pnl, COUNT(*) AS trade_count
    FROM trades WHERE date >= ? GROUP BY date ORDER BY date
  `)
  const qTradesList = db.prepare(`
    SELECT t.id, t.date, t.symbol, t.side, t.open_time, t.close_time, t.is_open,
           t.shares_bought, t.avg_buy_price, t.shares_sold, t.avg_sell_price,
           t.gross_pnl, t.total_fees, t.net_pnl, t.executions_json,
           t.entry_timeframe, t.entry_ema9_distance_pct,
           t.playbook_id, p.name AS playbook_name,
           t.confidence, t.mistakes_json, t.planned_risk,
           n.note_text,
           COALESCE(att.n, 0) AS attachment_count
    FROM trades t
    LEFT JOIN trade_notes n ON n.trade_id = t.id
    LEFT JOIN playbooks p ON p.id = t.playbook_id
    LEFT JOIN (
      SELECT trade_id, COUNT(*) AS n FROM trade_attachments GROUP BY trade_id
    ) att ON att.trade_id = t.id
    ORDER BY t.open_time DESC
  `)
  const qAnalytics = db.prepare(`
    SELECT id, date, symbol, side, open_time, shares_bought, shares_sold,
           gross_pnl, total_fees, net_pnl, executions_json,
           entry_timeframe, entry_ema9_distance_pct,
           confidence, mistakes_json, planned_risk
    FROM trades
  `)
  const qReportsBySymbol = db.prepare(`
    SELECT symbol, COUNT(*) AS trade_count, COALESCE(SUM(net_pnl), 0) AS net_pnl,
           AVG(net_pnl) AS avg_pnl,
           SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) AS winners
    FROM trades GROUP BY symbol ORDER BY net_pnl DESC
  `)
  const qCalendarMonth = db.prepare(`
    SELECT date, COALESCE(SUM(net_pnl), 0) AS net_pnl,
           COALESCE(SUM(gross_pnl), 0) AS gross_pnl,
           COALESCE(SUM(total_fees), 0) AS total_fees,
           COUNT(*) AS trade_count,
           SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) AS winners,
           SUM(CASE WHEN net_pnl < 0 THEN 1 ELSE 0 END) AS losers
    FROM trades WHERE date LIKE ? GROUP BY date
  `)

  const cutoff = (() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return `${d.getFullYear()}-${PAD2(d.getMonth()+1)}-${PAD2(d.getDate())}`
  })()
  const monthLike = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${PAD2(d.getMonth()+1)}-%`
  })()

  // Run counts scale inversely with row count so the suite finishes promptly
  // on big sizes while still giving us a tight p50 on small ones.
  const runs = (q) => (q === 'analytics' || q === 'list') && rowCount >= 5000 ? 20 : 50

  const results = {
    rows: rowCount,
    seedMs: seedMs.toFixed(1),
    dashboard_overview: time(() => qDashboardOverview.get(cutoff), 50),
    dashboard_daily:    time(() => qDashboardDaily.all(cutoff), 50),
    trades_list:        time(() => qTradesList.all(), runs('list')),
    analytics_scan:     time(() => qAnalytics.all(), runs('analytics')),
    reports_by_symbol:  time(() => qReportsBySymbol.all(), 50),
    calendar_month:     time(() => qCalendarMonth.all(monthLike), 50),
  }

  db.close()
  return results
}

function fmt(t) {
  return `${t.p50.toFixed(2)} ms (min ${t.min.toFixed(2)} · p95 ${t.p95.toFixed(2)})`
}

function writeln(s) {
  process.stdout.write(s + '\n')
}

const counts = pickArgs()
writeln('FugaEdge DB benchmark — Electron Node ABI, in-memory SQLite')
writeln('PRAGMAs match electron/db/database.ts: synchronous=NORMAL, cache_size=-32000 (32MB), mmap_size=256MB, temp_store=MEMORY')
writeln('')

for (const c of counts) {
  writeln(`Running ${c.toLocaleString()} trades…`)
  const r = bench(c)
  writeln(`────────── ${r.rows.toLocaleString()} trades (seed ${r.seedMs} ms) ──────────`)
  writeln(`  dashboard.overview  : ${fmt(r.dashboard_overview)}`)
  writeln(`  dashboard.daily     : ${fmt(r.dashboard_daily)}`)
  writeln(`  tradesList (JOINs)  : ${fmt(r.trades_list)}`)
  writeln(`  analytics.scan      : ${fmt(r.analytics_scan)}`)
  writeln(`  reports.by_symbol   : ${fmt(r.reports_by_symbol)}`)
  writeln(`  calendar.month      : ${fmt(r.calendar_month)}`)
  writeln('')
}
