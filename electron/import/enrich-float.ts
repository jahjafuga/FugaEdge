// Electron-side wiring around the pure import-time float orchestrator.
// Mirrors electron/import/resolve-countries.ts: pulls the API key + DB
// writers in here so src/core/float/orchestrator.ts can stay portable per
// ARCHITECTURE.md.
//
// The orchestrator's fetchFloat returns FloatFetchResult ({float,
// market_cap, sector}) — all three come back in the same Polygon ticker
// reference call, so persisting market_cap + sector alongside float costs
// zero extra API spend. v0.3.0 Pillars work (small-cap / sector pillars)
// reads those fields.

import { getSettings } from '../settings/repo'
import { fetchTickerDetails } from '../market/massive'
import { withRateLimitRetry } from '../market/rate-limit'
import { getMarketRow, upsertMarketRow } from '../market/repo'
import { backfillFloatShares } from './repo'
import {
  enrichFloatForSymbols,
  type EnrichFloatResult,
} from '@/core/float/orchestrator'

const REQUEST_SPACING_MS = 350

/** Fetch ticker details (float + market_cap + sector from one Polygon
 *  call) for each newly-imported symbol, upsert the market_data row, and
 *  propagate float to trades.float_shares via a per-symbol backfill.
 *  Bypasses the symbolsNeedingFetch 7-day TTL gate entirely — the import
 *  flow already knows these symbols are new and must be fetched. Awaited
 *  by the post-commit-enrich composer so the toast can report a consistent
 *  post-enrichment state. */
export async function enrichFloatForImportedSymbols(
  symbols: string[],
  onProgress?: (p: { current: number; total: number; symbol: string }) => void,
): Promise<EnrichFloatResult> {
  if (symbols.length === 0) {
    return { fetched: 0, missing: 0, errored: 0, errors: [] }
  }
  const { polygon_api_key } = getSettings().values
  if (!polygon_api_key) {
    // No key → can't fetch. Count as missing so the toast can nudge the
    // user toward Settings → API key. Mirrors the country-side handling.
    return { fetched: 0, missing: symbols.length, errored: 0, errors: [] }
  }

  return enrichFloatForSymbols({
    symbols,
    fetchFloat: (symbol) =>
      withRateLimitRetry(async () => {
        const d = await fetchTickerDetails(polygon_api_key, symbol)
        return {
          float: d.shares_outstanding,
          market_cap: d.market_cap,
          sector: d.sector,
        }
      }),
    persistFloat: (symbol, result) => {
      // Update the market_data cache so a later refresh sees the values.
      // Country fields written by the country phase in the prior step are
      // preserved by upsertMarketRow's COALESCE on country/country_name/
      // region — passing the existing row's values is belt-and-suspenders.
      // Aggregates fields (daily_volumes / avg_volume) are preserved here
      // too — they're written by the aggregates phase that runs next.
      const existing = getMarketRow(symbol)
      upsertMarketRow({
        symbol,
        // Commit A: existing Polygon flow still writes shares-outstanding
        // into the `float` column (the legacy behaviour). Commit B will
        // replace this with the FMP-shares-float wrapper that writes real
        // float here and outstandingShares into shares_outstanding. Until
        // then, shares_outstanding stays at the existing (post-migration)
        // value or null.
        float: result.float,
        shares_outstanding: existing?.shares_outstanding ?? null,
        market_cap: result.market_cap,
        sector: result.sector,
        avg_volume: existing?.avg_volume ?? null,
        daily_volumes: existing?.daily_volumes ?? {},
        country: existing?.country ?? null,
        country_name: existing?.country_name ?? null,
        region: existing?.region ?? null,
        fetched_at: new Date().toISOString(),
        error: null,
      })
      // Copy the float onto trades.float_shares for this symbol. The
      // backfill is idempotent and only touches rows whose float_shares
      // is still NULL, so manual overrides survive.
      backfillFloatShares([symbol])
    },
    emitProgress: onProgress,
    spacingMs: REQUEST_SPACING_MS,
  })
}
