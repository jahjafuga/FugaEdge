// Electron-side wiring around the pure import-time aggregates orchestrator.
// Mirrors electron/import/enrich-float.ts: pulls the API key + DB writers
// in here so src/core/aggregates/orchestrator.ts can stay portable per
// ARCHITECTURE.md.
//
// Date range derivation: tradeDateRangePerSymbol() reflects post-commit
// state because this wrapper runs from enrichAfterCommit (which fires
// after commit() inserts the trips). Falls back to a 90-day window
// ending today if a symbol unexpectedly has no trades after commit.

import { getSettings } from '../settings/repo'
import { fetchAggregatesForSymbol } from '../market/fetch'
import { withRateLimitRetry } from '../market/rate-limit'
import {
  getMarketRow,
  setTradeDailyChange,
  tradeDateRangePerSymbol,
  tradesNeedingDailyChangeForSymbol,
  upsertMarketRow,
  type TradeDateRange,
} from '../market/repo'
import {
  enrichAggregatesForSymbols,
  type EnrichAggregatesResult,
} from '@/core/aggregates/orchestrator'
import { dailyChangeForTrade } from '@/core/market/dailyChange'

const REQUEST_SPACING_MS = 350

/** Fetch daily-bar aggregates (volume series + 30-day-ish average) for
 *  each newly-imported symbol, upsert the market_data row's daily_volumes
 *  + avg_volume fields, and leave country / float / market_cap / sector
 *  untouched (the prior phases wrote those). Bypasses the
 *  symbolsNeedingFetch 7-day TTL gate — same contract as the country and
 *  float orchestrators. */
export async function enrichAggregatesForImportedSymbols(
  symbols: string[],
  onProgress?: (p: { current: number; total: number; symbol: string }) => void,
): Promise<EnrichAggregatesResult> {
  if (symbols.length === 0) {
    return { fetched: 0, empty: 0, errored: 0, errors: [] }
  }
  const { polygon_api_key } = getSettings().values
  if (!polygon_api_key) {
    // No key → can't fetch. Count as empty so the toast can nudge the
    // user toward Settings → API key, same as country/float wrappers.
    return { fetched: 0, empty: symbols.length, errored: 0, errors: [] }
  }

  // Snapshot ranges once for the whole batch. tradeDateRangePerSymbol
  // reads MIN/MAX date per symbol from the trades table; called post-
  // commit, so newly-inserted rows are included.
  const ranges = tradeDateRangePerSymbol()

  return enrichAggregatesForSymbols({
    symbols,
    fetchAggregates: (symbol) => {
      const { from, to } = rangeFor(ranges, symbol)
      return withRateLimitRetry(() =>
        fetchAggregatesForSymbol(polygon_api_key, symbol, from, to),
      )
    },
    persistAggregates: (symbol, result) => {
      // Preserve everything the prior two phases wrote — country block +
      // float/market_cap/sector/industry. Only daily_volumes + avg_volume
      // change here. upsertMarketRow's COALESCE on country/industry fields
      // means writing existing values is belt-and-suspenders.
      const existing = getMarketRow(symbol)
      upsertMarketRow({
        symbol,
        float: existing?.float ?? null,
        shares_outstanding: existing?.shares_outstanding ?? null,
        market_cap: existing?.market_cap ?? null,
        sector: existing?.sector ?? null,
        industry: existing?.industry ?? null,
        avg_volume: result.avg_volume,
        daily_volumes: result.daily_volumes,
        country: existing?.country ?? null,
        country_name: existing?.country_name ?? null,
        region: existing?.region ?? null,
        fetched_at: new Date().toISOString(),
        error: null,
      })

      // v0.2.5 Trader DNA — fill daily_change_pct for THIS symbol's new trades
      // from the closes in the SAME fetch (FREE, no extra request). NULL-only,
      // so only freshly-imported trades are touched; existing values stand. A
      // trade with no prior close in range gets NULL (honest "uncomputable").
      const bars = Object.entries(result.daily_closes).map(([date, close]) => ({ date, close }))
      for (const t of tradesNeedingDailyChangeForSymbol(symbol)) {
        setTradeDailyChange(t.id, dailyChangeForTrade(t, bars))
      }
    },
    emitProgress: onProgress,
    spacingMs: REQUEST_SPACING_MS,
  })
}

function rangeFor(
  ranges: Map<string, TradeDateRange>,
  symbol: string,
): { from: string; to: string } {
  const r = ranges.get(symbol)
  if (r) {
    return { from: addDays(r.from, -30), to: r.to }
  }
  // Defensive fallback — shouldn't fire because enrichAfterCommit is
  // gated on insertedTrips > 0, but if it ever does, give a 90-day window
  // ending today so RVOL math still has a baseline.
  const to = todayISO()
  return { from: addDays(to, -90), to }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function todayISO(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}
