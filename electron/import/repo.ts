import { openDatabase } from '../db/database'
import type { DaySummaryFeeRow, RoundTrip } from '@shared/import-types'
import { recomputeFeesForDateSymbol } from './apply-fees'

export function annotateTripStatus(trips: RoundTrip[]): RoundTrip[] {
  const db = openDatabase()
  // v0.2.1 dual-hash dedup. A trip is duplicate if EITHER hash matches an
  // existing row. exec_hash catches identical-ID re-imports (v0.1.6 contract);
  // content_hash catches cross-format overlap where the same logical fill
  // carries different per-fill IDs (scenarios b1/b2/b3 from the 2026-05-26
  // dedup investigation). Both columns are indexed (UNIQUE on exec_hash,
  // partial UNIQUE on content_hash), so the OR clause is sargable on either.
  const stmt = db.prepare(
    'SELECT 1 FROM trades WHERE exec_hash = ? OR content_hash = ? LIMIT 1',
  )
  return trips.map((t) => {
    const hit = stmt.get(t.exec_hash, t.content_hash)
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

// v0.2.2 Commit A — mirror of backfillFloatShares, for the new
// trades.shares_outstanding column. Populates from
// market_data.shares_outstanding wherever the trade's shares_outstanding is
// NULL. Commit A only ships this primitive; the call site lands in Commit
// B alongside the FMP enrichment wrapper that writes both columns. Listed
// here now so the repo surface for Commit B is complete and reviewable in
// one place (mirrors how the country / float orchestrators were paired).
//
// Idempotent and non-destructive — user-edited shares_outstanding values
// are never overwritten. Run after any change to market_data.
export function backfillSharesOutstanding(symbols?: string[]): number {
  const db = openDatabase()
  if (symbols && symbols.length === 0) return 0
  const where = symbols
    ? `WHERE t.shares_outstanding IS NULL AND t.symbol IN (${symbols.map(() => '?').join(',')})`
    : 'WHERE t.shares_outstanding IS NULL'
  const sql = `
    UPDATE trades
    SET shares_outstanding = (
      SELECT CAST(m.shares_outstanding AS INTEGER) FROM market_data m
      WHERE m.symbol = trades.symbol AND m.shares_outstanding IS NOT NULL
      LIMIT 1
    )
    WHERE id IN (
      SELECT t.id FROM trades t
      JOIN market_data m ON m.symbol = t.symbol
      ${where} AND m.shares_outstanding IS NOT NULL
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
        -- market_data carries no source, so a cache-copied country is
        -- unverified (could be a US-from-listing guess) — label it 'inferred',
        -- not the confident 'polygon'. Honest + re-resolvable.
        SELECT CASE WHEN m.country IS NOT NULL THEN 'inferred' ELSE 'unknown' END
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

  // v0.2.1 uses INSERT OR IGNORE rather than multi-target ON CONFLICT — the
  // bundled SQLite (3.49.2 via better-sqlite3 11.10) rejects ON CONFLICT
  // when one of the targets is a partial unique index (see
  // scripts/verify-multi-conflict.cjs for the empirical probe + the exact
  // error: "2nd ON CONFLICT clause does not match any PRIMARY KEY or
  // UNIQUE constraint"). INSERT OR IGNORE is the documented fallback — it
  // catches conflicts on ANY uniqueness constraint without requiring a
  // named target, which is exactly what the dual-hash design needs.
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

  // Dual-write companion to trades.executions_json (decision G). For each
  // round trip that gets inserted, one row per constituent fill goes into
  // the executions table. Readers stay on the JSON column for v0.2.0 Day 1;
  // the table becomes load-bearing in a later v0.2.0 step.
  //
  // source_broker / source_format / source_file are taken from the round
  // trip (which buildRoundTrips populated from the first constituent
  // execution). Per-execution fee fields, liquidity_type, account_name,
  // and is_paper stay NULL on Day 1 — the narrow RoundTripExecution shape
  // doesn't carry them through. A later v0.2.0 day will widen the data
  // flow when Webull/IBKR parsers start surfacing those fields.
  const insertExecution = db.prepare(`
    INSERT INTO executions (
      round_trip_id, trade_id, order_id, symbol, side, quantity, price,
      timestamp_utc, source_broker, source_format, source_file
    ) VALUES (
      @round_trip_id, @trade_id, @order_id, @symbol, @side, @quantity, @price,
      @timestamp_utc, @source_broker, @source_format, @source_file
    )
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
      // Safe fallbacks so commit() stays compatible with any caller that
      // constructs RoundTrips outside the universal buildRoundTrips path
      // (e.g. test fixtures, future migration importers).
      const sourceBroker = t.source_broker ?? 'DAS'
      const sourceFormat = t.source_format ?? 'execution'
      const sourceFile = t.source_file ?? null
      const accountName = t.account_name ?? null

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
        content_hash: t.content_hash,
        source_broker: sourceBroker,
        source_format: sourceFormat,
        source_file: sourceFile,
        account_name: accountName,
        fees_reported: t.fees_reported ? 1 : 0,
      })
      if (info.changes > 0) {
        insertedTrips++
        const tripId = info.lastInsertRowid as number
        for (const fill of t.executions) {
          insertExecution.run({
            round_trip_id: tripId,
            trade_id: fill.trade_id,
            order_id: fill.order_id,
            symbol: t.symbol,
            side: fill.side,
            quantity: fill.qty,
            price: fill.price,
            timestamp_utc: fill.time,
            source_broker: sourceBroker,
            source_format: sourceFormat,
            source_file: sourceFile,
          })
        }
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
