// Electron-side wiring around the pure import-time country orchestrator.
// Pulls the API key + DB writers in here so the orchestrator can stay
// portable per ARCHITECTURE.md.

import { getSettings } from '../settings/repo'
import { fetchTickerReference } from '../market/massive'
import { withRateLimitRetry } from '../market/rate-limit'
import { applyCountryToSymbol, type CountrySource } from '../trades/country'
import { getMarketRow, upsertMarketRow } from '../market/repo'
import {
  resolveCountriesForImport,
  type ImportResolveResult,
} from '@/core/country/import-orchestrator'

const REQUEST_SPACING_MS = 350

/** Resolve country for each newly-imported symbol using Polygon's
 *  /v3/reference/tickers cached response, then persist to trades + the
 *  market_data cache in a single pass. Awaited by the import IPC so the
 *  toast can report counters. */
export async function resolveCountriesForImportedSymbols(
  symbols: string[],
): Promise<ImportResolveResult> {
  if (symbols.length === 0) {
    return { resolved: 0, unknown: 0, errors: [] }
  }
  const { polygon_api_key } = getSettings().values
  if (!polygon_api_key) {
    // No key → can't resolve. Treat all as unknown so the toast nudges the
    // user to set up Backfill (which itself prompts for an API key).
    return { resolved: 0, unknown: symbols.length, errors: [] }
  }

  return resolveCountriesForImport({
    symbols,
    fetchRef: (symbol) =>
      withRateLimitRetry(() => fetchTickerReference(polygon_api_key, symbol)),
    applyToTrades: (symbol, resolved) => {
      const source: CountrySource = resolved.country ? 'polygon' : 'unknown'
      applyCountryToSymbol(symbol, {
        country: resolved.country,
        country_name: resolved.country_name,
        region: resolved.region,
        source,
      })
    },
    applyToCache: (symbol, resolved) => {
      // Keep the market_data row in sync so a follow-up refreshMarketData()
      // doesn't re-call Polygon just for country. Float / market_cap come
      // from the broader refresh; leave those untouched here.
      const existing = getMarketRow(symbol)
      upsertMarketRow({
        symbol,
        float: existing?.float ?? null,
        market_cap: existing?.market_cap ?? null,
        sector: existing?.sector ?? null,
        avg_volume: existing?.avg_volume ?? null,
        daily_volumes: existing?.daily_volumes ?? {},
        country: resolved.country,
        country_name: resolved.country_name,
        region: resolved.region,
        fetched_at: existing?.fetched_at ?? new Date().toISOString(),
        error: existing?.error ?? null,
      })
    },
    spacingMs: REQUEST_SPACING_MS,
  })
}
