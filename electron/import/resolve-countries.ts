// Electron-side wiring around the pure import-time country orchestrator.
// Pulls the API keys + DB writers in here so the orchestrator can stay
// portable per ARCHITECTURE.md (keys passed as params into pure code).
//
// v0.2.3 Stage 1 — FMP /stable/profile is the PRIMARY country source
// (real domicile, fixes Polygon's free-tier "US (inferred)" bug for
// US-listed foreign issuers); Polygon's /v3/reference/tickers is the
// FALLBACK, only hit when FMP returns no country. The Polygon path is
// otherwise UNCHANGED.

import { getSettings } from '../settings/repo'
import { fetchTickerReference } from '../market/massive'
import { fetchCompanyProfile } from '@/services/fmp'
import { withRateLimitRetry } from '../market/rate-limit'
import { applyCountryToSymbol, type CountrySource } from '../trades/country'
import { getMarketRow, upsertMarketRow } from '../market/repo'
import {
  resolveCountriesForImport,
  type ImportResolveResult,
} from '@/core/country/import-orchestrator'

const REQUEST_SPACING_MS = 350

/** Resolve country for each newly-imported symbol — FMP profile first
 *  (domicile), Polygon ticker-ref as fallback — then persist to trades +
 *  the market_data cache in a single pass. Awaited by the import IPC so the
 *  toast can report counters. */
export async function resolveCountriesForImportedSymbols(
  symbols: string[],
): Promise<ImportResolveResult> {
  if (symbols.length === 0) {
    return { resolved: 0, unknown: 0, errors: [], apiKeyMissing: false }
  }
  const { polygon_api_key, fmp_api_key } = getSettings().values
  // apiKeyMissing only when NEITHER key is usable. With an FMP key alone we
  // proceed (FMP is primary; the Polygon fallback simply won't run). With a
  // Polygon key alone we proceed Polygon-only (pre-v0.2.3 behaviour).
  if (!polygon_api_key && !fmp_api_key) {
    // No usable key → can't resolve. Flag it so the renderer can surface a
    // specific "API key missing" banner instead of the generic
    // "N tickers unknown" line.
    return { resolved: 0, unknown: symbols.length, errors: [], apiKeyMissing: true }
  }

  return resolveCountriesForImport({
    symbols,
    // PRIMARY: FMP profile domicile. Only wired when an FMP key exists; when
    // it's absent the orchestrator skips straight to the Polygon fallback.
    // fetchCompanyProfile never throws except on a real 15s timeout, which
    // the orchestrator records without suppressing the fallback.
    fetchProfileCountry: fmp_api_key
      ? (symbol) => fetchCompanyProfile(fmp_api_key, symbol)
      : undefined,
    // FALLBACK: Polygon ticker-ref. Only wired when a Polygon key exists; an
    // FMP-only setup leaves this off and relies on FMP alone.
    fetchRef: polygon_api_key
      ? (symbol) =>
          withRateLimitRetry(() => fetchTickerReference(polygon_api_key, symbol))
      : async () => ({}),
    applyToTrades: (symbol, resolved) => {
      // Pass the resolver's confidence through verbatim — 'polygon' (real
      // address/text hint), 'inferred' (listing/exchange guess), or 'unknown'.
      const source: CountrySource = resolved.source
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
        shares_outstanding: existing?.shares_outstanding ?? null,
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
