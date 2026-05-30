// v0.2.2 Commit B — FMP-backed import-time float enrichment.
//
// Replaces the legacy Polygon-shares-outstanding flow (which wrote
// shares-outstanding into the column NAMED float — the bug). The wrapper
// now sources REAL tradable float from FMP `/stable/shares-float` and
// writes:
//   market_data.float              ← FMP floatShares  (real tradable float)
//   market_data.shares_outstanding ← FMP outstandingShares (issued count)
//
// Honesty rules (mirrored in enrich-float-fmp.test.ts):
//   - market_data.float receives FMP floatShares, NEVER outstandingShares.
//   - LABT-case (FMP returns null float): row.float = NULL. NO silent
//     fallback to shares_outstanding. The UI then surfaces "Unavailable".
//   - market_cap + sector are NOT fetched here in Commit B. FMP's
//     shares-float endpoint doesn't return them; pulling them from FMP
//     profile would double the API spend per symbol. The market refresh
//     button (separate path, electron/market/fetch.ts) still populates
//     them from Polygon. Existing market_cap/sector values are preserved
//     via upsertMarketRow's behaviour: error-path null doesn't wipe a
//     prior value (we explicitly pass through `existing?.market_cap`).
//
// Web-portable per ARCHITECTURE.md Rule 4: the FMP key is read from
// settings here (main process) and passed as a parameter into the pure
// src/services/fmp.ts service module. The service module never reads
// process.env — same shape as src/services/massive.ts.
//
// Convention notes:
//   - The orchestrator's contract is unchanged. Only the injected
//     fetchFloat impl swaps from Polygon → FMP. The orchestrator's
//     `missing` counter still gates on result.float === null, so the
//     LABT case correctly counts as missing without losing the
//     outstanding-shares payload.
//   - On settle, both backfill primitives run: trades.float_shares ←
//     market_data.float, trades.shares_outstanding ← market_data.shares_outstanding.

import { getSettings } from '../settings/repo'
import { fetchSharesFloat } from '@/services/fmp'
import { getMarketRow, upsertMarketRow } from '../market/repo'
import { backfillFloatShares, backfillSharesOutstanding } from './repo'
import {
  enrichFloatForSymbols,
  type EnrichFloatResult,
} from '@/core/float/orchestrator'

const REQUEST_SPACING_MS = 350

/** Fetch real tradable float (FMP) for each newly-imported symbol, upsert
 *  the market_data row with float + shares_outstanding, and propagate to
 *  trades via the per-symbol backfills. Bypasses the symbolsNeedingFetch
 *  7-day TTL gate entirely — the import flow already knows these symbols
 *  are new. */
export async function enrichFloatForImportedSymbols(
  symbols: string[],
  onProgress?: (p: { current: number; total: number; symbol: string }) => void,
): Promise<EnrichFloatResult> {
  if (symbols.length === 0) {
    return { fetched: 0, missing: 0, errored: 0, errors: [] }
  }
  const { fmp_api_key } = getSettings().values
  if (!fmp_api_key) {
    // No FMP key → can't fetch real float. Count as missing so a future
    // toast / status surface can nudge the user toward Settings → FMP key
    // (mirrors the existing Massive-key handling).
    return { fetched: 0, missing: symbols.length, errored: 0, errors: [] }
  }

  return enrichFloatForSymbols({
    symbols,
    fetchFloat: async (symbol) => {
      // fetchSharesFloat never throws — all-null on transient errors or
      // coverage gaps. The orchestrator interprets null float as MISSING.
      const r = await fetchSharesFloat(fmp_api_key, symbol)
      return {
        float: r.floatShares,
        shares_outstanding: r.outstandingShares,
        // FMP shares-float endpoint doesn't supply these; the existing
        // market refresh button still populates them from Polygon when run.
        market_cap: null,
        sector: null,
      }
    },
    persistFloat: (symbol, result) => {
      // Preserve everything other phases wrote — country block from
      // resolve-countries.ts, aggregates fields from enrich-aggregates.ts,
      // and any cached market_cap / sector from a prior Polygon refresh.
      const existing = getMarketRow(symbol)
      upsertMarketRow({
        symbol,
        // ── Load-bearing honesty ──
        // .float gets REAL FMP float. NEVER falls back to outstanding —
        // a null FMP float persists as a null .float column, which the
        // UI surfaces as "Unavailable" rather than the historical bug
        // of silently showing shares-outstanding.
        float: result.float,
        shares_outstanding: result.shares_outstanding,
        // Passenger fields — NOT fetched here (FMP shares-float endpoint has
        // no cap/sector/industry; the country/profile phase writes those).
        // Preserved as-is so this phase never clobbers them.
        market_cap: existing?.market_cap ?? null,
        sector: existing?.sector ?? null,
        industry: existing?.industry ?? null,
        // Other phases' values preserved as-is.
        avg_volume: existing?.avg_volume ?? null,
        daily_volumes: existing?.daily_volumes ?? {},
        country: existing?.country ?? null,
        country_name: existing?.country_name ?? null,
        region: existing?.region ?? null,
        fetched_at: new Date().toISOString(),
        error: null,
      })
      // Propagate to trades — both columns. Each backfill is idempotent
      // and only touches rows whose target column is still NULL, so user
      // manual overrides survive.
      backfillFloatShares([symbol])
      backfillSharesOutstanding([symbol])
    },
    emitProgress: onProgress,
    spacingMs: REQUEST_SPACING_MS,
  })
}
