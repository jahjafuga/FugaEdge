import { openDatabase } from '../db/database'
import type { DaySummaryFeeRow, RoundTrip } from '@shared/import-types'
import { recomputeFeesForDateSymbol } from './apply-fees'

export function annotateTripStatus(trips: RoundTrip[]): RoundTrip[] {
  const db = openDatabase()
  const stmt = db.prepare('SELECT 1 FROM trades WHERE exec_hash = ? LIMIT 1')
  return trips.map((t) => {
    const hit = stmt.get(t.exec_hash)
    return { ...t, status: hit ? ('duplicate' as const) : ('new' as const) }
  })
}

export function annotateFeeStatus(fees: DaySummaryFeeRow[]): DaySummaryFeeRow[] {
  const db = openDatabase()
  const existsStmt = db.prepare(
    'SELECT 1 FROM day_fees WHERE date = ? AND symbol = ? LIMIT 1',
  )
  const tripCountStmt = db.prepare(
    'SELECT COUNT(*) AS n FROM trades WHERE date = ? AND symbol = ?',
  )
  return fees.map((f) => {
    const exists = existsStmt.get(f.date, f.symbol)
    const tripCount = (tripCountStmt.get(f.date, f.symbol) as { n: number }).n
    return {
      ...f,
      status: exists ? ('replace' as const) : ('new' as const),
      matchedTrips: tripCount,
    }
  })
}

const upsertSummary = `
  INSERT INTO daily_summary
    (date, total_pnl, total_fees, trade_count, winners, losers, gross_pnl, largest_win, largest_loss)
  SELECT
    date,
    COALESCE(SUM(net_pnl), 0),
    COALESCE(SUM(total_fees), 0),
    COUNT(*),
    SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END),
    SUM(CASE WHEN net_pnl < 0 THEN 1 ELSE 0 END),
    COALESCE(SUM(gross_pnl), 0),
    COALESCE(MAX(net_pnl), 0),
    COALESCE(MIN(net_pnl), 0)
  FROM trades WHERE date = ? GROUP BY date
  ON CONFLICT(date) DO UPDATE SET
    total_pnl    = excluded.total_pnl,
    total_fees   = excluded.total_fees,
    trade_count  = excluded.trade_count,
    winners      = excluded.winners,
    losers       = excluded.losers,
    gross_pnl    = excluded.gross_pnl,
    largest_win  = excluded.largest_win,
    largest_loss = excluded.largest_loss
`

export interface CommitOutcome {
  insertedTrips: number
  skippedTrips: number
  insertedFees: number
  replacedFees: number
  affectedDates: string[]
  affectedPairs: number
}

// Populate trades.float_shares from market_data.float wherever the trade
// row's float_shares is NULL and market_data has a value for the symbol.
// Optional `symbols` filter narrows the scope to a recently-imported set;
// omit to backfill across the whole table.
//
// Idempotent and non-destructive — user-edited float values (where the
// column is already set) are never overwritten. Run this after any change
// to market_data (e.g. a successful refreshMarketData()).
export function backfillFloatShares(symbols?: string[]): number {
  const db = openDatabase()
  if (symbols && symbols.length === 0) return 0
  const where = symbols
    ? `WHERE t.float_shares IS NULL AND t.symbol IN (${symbols.map(() => '?').join(',')})`
    : 'WHERE t.float_shares IS NULL'
  const sql = `
    UPDATE trades
    SET float_shares = (
      SELECT CAST(m.float AS INTEGER) FROM market_data m
      WHERE m.symbol = trades.symbol AND m.float IS NOT NULL
      LIMIT 1
    )
    WHERE id IN (
      SELECT t.id FROM trades t
      JOIN market_data m ON m.symbol = t.symbol
      ${where} AND m.float IS NOT NULL
    )
  `
  const info = symbols ? db.prepare(sql).run(...symbols) : db.prepare(sql).run()
  return info.changes
}

// Populate trades.country/_name/region from market_data.* wherever the
// trade row's country_source is NULL (so manual overrides and previously-
// resolved Polygon hits both stay put). Idempotent.
export function backfillTradeCountriesFromMarket(symbols?: string[]): number {
  const db = openDatabase()
  if (symbols && symbols.length === 0) return 0
  const where = symbols
    ? `WHERE t.country_source IS NULL AND t.symbol IN (${symbols.map(() => '?').join(',')})`
    : 'WHERE t.country_source IS NULL'
  const sql = `
    UPDATE trades
    SET
      country        = (SELECT m.country        FROM market_data m WHERE m.symbol = trades.symbol),
      country_name   = (SELECT m.country_name   FROM market_data m WHERE m.symbol = trades.symbol),
      region         = (SELECT m.region         FROM market_data m WHERE m.symbol = trades.symbol),
      country_source = (
        SELECT CASE WHEN m.country IS NOT NULL THEN 'polygon' ELSE 'unknown' END
        FROM market_data m WHERE m.symbol = trades.symbol
      )
    WHERE id IN (
      SELECT t.id FROM trades t
      JOIN market_data m ON m.symbol = t.symbol
      ${where}
    )
  `
  const info = symbols ? db.prepare(sql).run(...symbols) : db.prepare(sql).run()
  return info.changes
}

export function commit(
  trips: RoundTrip[],
  fees: DaySummaryFeeRow[],
  source: string,
): CommitOutcome {
  const db = openDatabase()

  const purgeOpen = db.prepare(
    'DELETE FROM trades WHERE symbol = ? AND date = ? AND is_open = 1',
  )

  const insertTrip = db.prepare(`
    INSERT INTO trades (
      date, symbol, side,
      open_time, close_time, is_open,
      shares_bought, avg_buy_price, shares_sold, avg_sell_price,
      pnl, gross_pnl,
      fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat, total_fees,
      net_pnl,
      executions_json, exec_hash
    ) VALUES (
      @date, @symbol, @side,
      @open_time, @close_time, @is_open,
      @shares_bought, @avg_buy_price, @shares_sold, @avg_sell_price,
      @pnl, @gross_pnl,
      0, 0, 0, 0, 0, 0,
      @net_pnl,
      @executions_json, @exec_hash
    )
    ON CONFLICT(exec_hash) DO NOTHING
  `)

  const upsertFees = db.prepare(`
    INSERT INTO day_fees (date, symbol, fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat, total_fees, source)
    VALUES (@date, @symbol, @fee_ecn, @fee_sec, @fee_finra, @fee_htb, @fee_cat, @total_fees, @source)
    ON CONFLICT(date, symbol) DO UPDATE SET
      fee_ecn    = excluded.fee_ecn,
      fee_sec    = excluded.fee_sec,
      fee_finra  = excluded.fee_finra,
      fee_htb    = excluded.fee_htb,
      fee_cat    = excluded.fee_cat,
      total_fees = excluded.total_fees,
      source     = excluded.source
  `)

  const summaryStmt = db.prepare(upsertSummary)

  let insertedTrips = 0
  let skippedTrips = 0
  let insertedFees = 0
  let replacedFees = 0
  const dates = new Set<string>()
  const pairs = new Set<string>()

  const tx = db.transaction(() => {
    // Wipe stale open trips for affected (symbol, date) before inserting.
    const purgeKeys = new Set<string>()
    for (const t of trips) purgeKeys.add(`${t.symbol}|${t.date}`)
    for (const key of purgeKeys) {
      const [symbol, date] = key.split('|')
      purgeOpen.run(symbol, date)
    }

    for (const t of trips) {
      if (t.status === 'duplicate') {
        skippedTrips++
        continue
      }
      const info = insertTrip.run({
        date: t.date,
        symbol: t.symbol,
        side: t.side,
        open_time: t.open_time,
        close_time: t.close_time,
        is_open: t.is_open ? 1 : 0,
        shares_bought: t.shares_bought,
        avg_buy_price: t.avg_buy_price,
        shares_sold: t.shares_sold,
        avg_sell_price: t.avg_sell_price,
        pnl: t.net_pnl,
        gross_pnl: t.gross_pnl,
        net_pnl: t.net_pnl,
        executions_json: JSON.stringify(t.executions),
        exec_hash: t.exec_hash,
      })
      if (info.changes > 0) {
        insertedTrips++
        dates.add(t.date)
        pairs.add(`${t.date}|${t.symbol}`)
      } else {
        skippedTrips++
      }
    }

    for (const f of fees) {
      const wasReplace = f.status === 'replace'
      upsertFees.run({
        date: f.date,
        symbol: f.symbol,
        fee_ecn: f.fee_ecn,
        fee_sec: f.fee_sec,
        fee_finra: f.fee_finra,
        fee_htb: f.fee_htb,
        fee_cat: f.fee_cat,
        total_fees: f.total_fees,
        source,
      })
      if (wasReplace) replacedFees++
      else insertedFees++
      dates.add(f.date)
      pairs.add(`${f.date}|${f.symbol}`)
    }

    // Recompute fee allocation across every affected (date, symbol).
    // Also covers trades that had fees applied previously but now have a new
    // round trip joining the pool — pro-rata gets redistributed.
    for (const p of pairs) {
      const [date, symbol] = p.split('|')
      recomputeFeesForDateSymbol(date, symbol)
    }

    for (const d of dates) summaryStmt.run(d)

    // Auto-enrich newly-inserted trades' float_shares from cached
    // market_data. For symbols not yet in market_data, the second pass runs
    // after refreshMarketData() completes (see import/ipc.ts).
    const symbolsInserted = new Set<string>()
    for (const p of pairs) symbolsInserted.add(p.split('|')[1])
    if (symbolsInserted.size > 0) {
      backfillFloatShares(Array.from(symbolsInserted))
      backfillTradeCountriesFromMarket(Array.from(symbolsInserted))
    }
  })

  tx()

  return {
    insertedTrips,
    skippedTrips,
    insertedFees,
    replacedFees,
    affectedDates: Array.from(dates).sort(),
    affectedPairs: pairs.size,
  }
}
