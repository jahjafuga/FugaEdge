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
import { MassiveError } from '../market/massive'
import { fetchAggregatesForSymbol } from '../market/fetch'
import {
  getMarketRow,
  tradeDateRangePerSymbol,
  upsertMarketRow,
  type TradeDateRange,
} from '../market/repo'
import {
  enrichAggregatesForSymbols,
  type EnrichAggregatesResult,
} from '@/core/aggregates/orchestrator'

const REQUEST_SPACING_MS = 350
const RETRY_BACKOFF_MS = 12_000

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
    return { fetched: 0, empty: 0, errors: [] }
  }
  const { polygon_api_key } = getSettings().values
  if (!polygon_api_key) {
    // No key → can't fetch. Count as empty so the toast can nudge the
    // user toward Settings → API key, same as country/float wrappers.
    return { fetched: 0, empty: symbols.length, errors: [] }
  }

  // Snapshot ranges once for the whole batch. tradeDateRangePerSymbol
  // reads MIN/MAX date per symbol from the trades table; called post-
  // commit, so newly-inserted rows are included.
  const ranges = tradeDateRangePerSymbol()

  return enrichAggregatesForSymbols({
    symbols,
    fetchAggregates: async (symbol) => {
      const { from, to } = rangeFor(ranges, symbol)
      const fetchOnce = () => fetchAggregatesForSymbol(polygon_api_key, symbol, from, to)
      try {
        return await fetchOnce()
      } catch (e) {
        // Single soft retry on rate-limit, matching enrich-float.ts +
        // resolve-countries.ts + runRefresh's pattern.
        if (e instanceof MassiveError && e.status === 429) {
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS))
          return fetchOnce()
        }
        throw e
      }
    },
    persistAggregates: (symbol, result) => {
      // Preserve everything the prior two phases wrote — country block +
      // float/market_cap/sector. Only daily_volumes + avg_volume change
      // here. upsertMarketRow's COALESCE on country fields means writing
      // existing values is belt-and-suspenders.
      const existing = getMarketRow(symbol)
      upsertMarketRow({
        symbol,
        float: existing?.float ?? null,
        market_cap: existing?.market_cap ?? null,
        sector: existing?.sector ?? null,
        avg_volume: result.avg_volume,
        daily_volumes: result.daily_volumes,
        country: existing?.country ?? null,
        country_name: existing?.country_name ?? null,
        region: existing?.region ?? null,
        fetched_at: new Date().toISOString(),
        error: null,
      })
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
