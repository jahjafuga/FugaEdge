// Electron-side wiring around the pure import-time country orchestrator.
// Pulls the API keys + DB writers in here so the orchestrator can stay
// portable per ARCHITECTURE.md (keys passed as params into pure code).
//
// v0.2.3 Stage 1 — FMP /stable/profile is the PRIMARY country source
// (real domicile, fixes Polygon's free-tier "US (inferred)" bug for
// US-listed foreign issuers); Polygon's /v3/reference/tickers is the
// FALLBACK, only hit when FMP returns no country. The Polygon path is
// otherwise UNCHANGED.
//
// v0.2.3 Stage 2 — the SAME FMP profile call also yields marketCap, sector,
// and industry. These ride through the orchestrator as passenger fields and
// are persisted to market_data here (ZERO extra requests). A null passenger
// never wipes a previously-populated value — we prefer the fresh FMP value
// and fall back to whatever the row already had. The market-refresh path
// (electron/market/fetch.ts) still sources cap/sector from Polygon — out of
// scope for Stage 2. TAXONOMY: FMP sector/industry are GICS-style
// ("Healthcare" / "Biotechnology"), NOT Polygon SIC text.

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
    fetchProfile: fmp_api_key
      ? (symbol: string) => fetchCompanyProfile(fmp_api_key, symbol)
      : undefined,
    // FALLBACK: Polygon ticker-ref. Only wired when a Polygon key exists; an
    // FMP-only setup leaves this off and relies on FMP alone.
    fetchRef: polygon_api_key
      ? (symbol) =>
          withRateLimitRetry(() => fetchTickerReference(polygon_api_key, symbol))
      : async () => ({}),
    applyToTrades: (symbol, r) => {
      // Pass the resolver's confidence through verbatim — 'fmp' (real
      // domicile), 'polygon' (address/text hint), 'inferred' (listing guess),
      // or 'unknown'. trades stores only the country fields.
      const source: CountrySource = r.resolved.source
      applyCountryToSymbol(symbol, {
        country: r.resolved.country,
        country_name: r.resolved.country_name,
        region: r.resolved.region,
        source,
      })
    },
    applyToCache: (symbol, r) => {
      // Keep the market_data row in sync. v0.2.3 Stage 2: market_cap / sector
      // / industry now come from the FMP profile passenger fields (replacing
      // the old preserve-only nulls). A null passenger never wipes a
      // previously-populated value — prefer fresh FMP, else keep existing.
      // float / shares_outstanding stay owned by the float phase + refresh.
      const existing = getMarketRow(symbol)
      upsertMarketRow({
        symbol,
        float: existing?.float ?? null,
        shares_outstanding: existing?.shares_outstanding ?? null,
        market_cap: r.marketCap ?? existing?.market_cap ?? null,
        sector: r.sector ?? existing?.sector ?? null,
        industry: r.industry ?? existing?.industry ?? null,
        avg_volume: existing?.avg_volume ?? null,
        daily_volumes: existing?.daily_volumes ?? {},
        country: r.resolved.country,
        country_name: r.resolved.country_name,
        region: r.resolved.region,
        fetched_at: existing?.fetched_at ?? new Date().toISOString(),
        error: existing?.error ?? null,
      })
    },
    spacingMs: REQUEST_SPACING_MS,
  })
}
