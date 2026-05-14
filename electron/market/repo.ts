import { openDatabase } from '../db/database'

export interface MarketRow {
  symbol: string
  float: number | null
  market_cap: number | null
  sector: string | null
  avg_volume: number | null
  daily_volumes: Record<string, number>
  country: string | null
  country_name: string | null
  region: string | null
  fetched_at: string  // ISO from DB
  error: string | null
}

interface MarketRowDb {
  symbol: string
  float: number | null
  market_cap: number | null
  sector: string | null
  avg_volume: number | null
  daily_volumes: string
  country: string | null
  country_name: string | null
  region: string | null
  fetched_at: string
  error: string | null
}

function parseDailyVolumes(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, number> = {}
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
        if (typeof n === 'number' && Number.isFinite(n)) out[k] = n
      }
      return out
    }
  } catch {
    // fall through
  }
  return {}
}

function rowToMarket(r: MarketRowDb): MarketRow {
  return {
    symbol: r.symbol,
    float: r.float,
    market_cap: r.market_cap,
    sector: r.sector,
    avg_volume: r.avg_volume,
    daily_volumes: parseDailyVolumes(r.daily_volumes),
    country: r.country,
    country_name: r.country_name,
    region: r.region,
    fetched_at: r.fetched_at,
    error: r.error,
  }
}

export function getMarketRow(symbol: string): MarketRow | null {
  const db = openDatabase()
  const row = db
    .prepare(`
      SELECT symbol, float, market_cap, sector, avg_volume,
             daily_volumes, country, country_name, region,
             fetched_at, error
      FROM market_data WHERE symbol = ?
    `)
    .get(symbol) as MarketRowDb | undefined
  return row ? rowToMarket(row) : null
}

export function getAllMarketRows(): MarketRow[] {
  const db = openDatabase()
  const rows = db
    .prepare(`
      SELECT symbol, float, market_cap, sector, avg_volume,
             daily_volumes, country, country_name, region,
             fetched_at, error
      FROM market_data
    `)
    .all() as MarketRowDb[]
  return rows.map(rowToMarket)
}

export function upsertMarketRow(input: MarketRow): void {
  const db = openDatabase()
  db.prepare(`
    INSERT INTO market_data
      (symbol, float, market_cap, sector, avg_volume, daily_volumes,
       country, country_name, region, fetched_at, error)
    VALUES (@symbol, @float, @market_cap, @sector, @avg_volume, @daily_volumes,
            @country, @country_name, @region, @fetched_at, @error)
    ON CONFLICT(symbol) DO UPDATE SET
      float          = excluded.float,
      market_cap     = excluded.market_cap,
      sector         = excluded.sector,
      avg_volume     = excluded.avg_volume,
      daily_volumes  = excluded.daily_volumes,
      -- Country fields use COALESCE so an error-path upsert (where country
      -- is null) does not wipe a previously-resolved country. Other fields
      -- overwrite because nulls there just mean "API gave nothing new",
      -- not "keep the old value".
      country        = COALESCE(excluded.country, market_data.country),
      country_name   = COALESCE(excluded.country_name, market_data.country_name),
      region         = COALESCE(excluded.region, market_data.region),
      fetched_at     = excluded.fetched_at,
      error          = excluded.error
  `).run({
    symbol: input.symbol,
    float: input.float,
    market_cap: input.market_cap,
    sector: input.sector,
    avg_volume: input.avg_volume,
    daily_volumes: JSON.stringify(input.daily_volumes ?? {}),
    country: input.country,
    country_name: input.country_name,
    region: input.region,
    fetched_at: input.fetched_at,
    error: input.error,
  })
}

// Symbols that need fetching, optionally bypassing the cache.
export function symbolsNeedingFetch(staleAfterMs: number, force: boolean): string[] {
  const db = openDatabase()
  const distinct = db
    .prepare('SELECT DISTINCT symbol FROM trades ORDER BY symbol ASC')
    .all() as { symbol: string }[]

  if (force) return distinct.map((r) => r.symbol)

  const known = new Map<string, MarketRow>()
  for (const r of getAllMarketRows()) known.set(r.symbol, r)

  const now = Date.now()
  const out: string[] = []
  for (const { symbol } of distinct) {
    const row = known.get(symbol)
    if (!row) {
      out.push(symbol)
      continue
    }
    const fetched = Date.parse(row.fetched_at)
    if (Number.isFinite(fetched) && now - fetched < staleAfterMs && !row.error) {
      continue // fresh and OK
    }
    out.push(symbol)
  }
  return out
}

// ── Intraday 1-minute bars ────────────────────────────────────────────────

import type { IntradayBar } from './massive'

export interface IntradayRow {
  symbol: string
  date: string
  bars: IntradayBar[]
  fetched_at: string
  error: string | null
}

interface IntradayDbRow {
  symbol: string
  date: string
  bars: string
  fetched_at: string
  error: string | null
}

function parseBars(raw: string | null | undefined): IntradayBar[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      return arr.filter(
        (b: unknown): b is IntradayBar =>
          !!b &&
          typeof b === 'object' &&
          typeof (b as { t?: unknown }).t === 'number' &&
          typeof (b as { c?: unknown }).c === 'number',
      )
    }
  } catch {
    // ignore
  }
  return []
}

export function getIntradayRow(symbol: string, date: string): IntradayRow | null {
  const db = openDatabase()
  const row = db
    .prepare('SELECT symbol, date, bars, fetched_at, error FROM intraday_bars WHERE symbol = ? AND date = ?')
    .get(symbol, date) as IntradayDbRow | undefined
  if (!row) return null
  return {
    symbol: row.symbol,
    date: row.date,
    bars: parseBars(row.bars),
    fetched_at: row.fetched_at,
    error: row.error,
  }
}

export function upsertIntradayRow(input: IntradayRow): void {
  const db = openDatabase()
  db.prepare(`
    INSERT INTO intraday_bars (symbol, date, bars, fetched_at, error)
    VALUES (@symbol, @date, @bars, @fetched_at, @error)
    ON CONFLICT(symbol, date) DO UPDATE SET
      bars       = excluded.bars,
      fetched_at = excluded.fetched_at,
      error      = excluded.error
  `).run({
    symbol: input.symbol,
    date: input.date,
    bars: JSON.stringify(input.bars ?? []),
    fetched_at: input.fetched_at,
    error: input.error,
  })
}

export function tradeSymbolDatePairs(): { symbol: string; date: string }[] {
  const db = openDatabase()
  return db
    .prepare('SELECT DISTINCT symbol, date FROM trades ORDER BY date ASC, symbol ASC')
    .all() as { symbol: string; date: string }[]
}

// (symbol, date) pairs missing intraday data — or previously errored.
// `force` bypasses the cache entirely.
export function intradayPairsNeedingFetch(force: boolean): { symbol: string; date: string }[] {
  const db = openDatabase()
  const all = tradeSymbolDatePairs()
  if (force) return all

  const existing = db
    .prepare('SELECT symbol, date, error FROM intraday_bars')
    .all() as { symbol: string; date: string; error: string | null }[]
  const cached = new Map<string, string | null>()
  for (const r of existing) cached.set(`${r.symbol}|${r.date}`, r.error)

  return all.filter((p) => {
    const err = cached.get(`${p.symbol}|${p.date}`)
    if (err === undefined) return true  // not cached
    if (err !== null) return true        // last attempt errored — retry
    return false                          // cached cleanly
  })
}

export function setTradeEma9Distance(tradeId: number, pct: number | null): void {
  const db = openDatabase()
  db.prepare('UPDATE trades SET entry_ema9_distance_pct = ? WHERE id = ?').run(pct, tradeId)
}

export function setTradeMaeMfe(
  tradeId: number,
  mae: number | null,
  mfe: number | null,
): void {
  const db = openDatabase()
  db.prepare('UPDATE trades SET mae = ?, mfe = ? WHERE id = ?').run(mae, mfe, tradeId)
}

export interface TradeDateRange {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
}

// Per-symbol date range — used so we only fetch aggregates spanning the
// dates the user actually traded plus a 30-day baseline buffer.
export function tradeDateRangePerSymbol(): Map<string, TradeDateRange> {
  const db = openDatabase()
  const rows = db
    .prepare(`
      SELECT symbol, MIN(date) AS from_date, MAX(date) AS to_date
      FROM trades GROUP BY symbol
    `)
    .all() as { symbol: string; from_date: string; to_date: string }[]
  const out = new Map<string, TradeDateRange>()
  for (const r of rows) out.set(r.symbol, { from: r.from_date, to: r.to_date })
  return out
}
