// v0.2.2 — standalone float backfill over EXISTING trades.
//
// Distinct from the import-time float enrichment (enrich-float.ts), which only
// runs for freshly-imported symbols. This path is user-triggered from
// Settings → Data backfill and operates on trades ALREADY in the DB whose
// float_shares is still NULL (imported before FMP wiring existed).
//
// It reuses the tested primitives wholesale — NO new fetch / persist / SQL
// logic lives here:
//   - symbolsNeedingFloatFetch()        → the work list (distinct null-float symbols)
//   - enrichFloatForImportedSymbols()   → real FMP fetch + market_data upsert +
//                                         per-symbol backfillFloatShares propagation,
//                                         already sequential at REQUEST_SPACING_MS with
//                                         429 → "missing" and FMP-no-float → NULL handling.
//
// Deliberately does NOT touch the MARKET_REFRESH path: that writes Polygon
// shares-outstanding into the float column (the mislabel Commit B fixed). Real
// tradable float comes only from the FMP enrichment wrapper.
//
// The "unavailable" set is derived as ground truth, not from counters: after
// enrichment, any attempted symbol that STILL has a null-float trade is one
// FMP had no float for (or a transient 429). symbolsNeedingFloatFetch() re-run
// returns exactly those, so the renderer can NAME them for manual entry.
//
// Web-portable per ARCHITECTURE.md Rule 4: the FMP key never leaves the main
// process; this module reads it via getSettings (mirrors country/fetch.ts) and
// the pure FMP service receives it as a parameter inside the enrichment wrapper.

import type {
  FloatBackfillProgress,
  FloatBackfillResult,
} from '@shared/market-types'
import { getSettings } from '../settings/repo'
import { symbolsNeedingFloatFetch } from './repo'
import { enrichFloatForImportedSymbols } from './enrich-float'

let inFlight: Promise<FloatBackfillResult> | null = null

/** Backfill real FMP float onto every existing trade whose float_shares is
 *  NULL. Singleton-locked (mirrors backfillAllCountries) so a double-click or
 *  a racing import can't run two FMP sweeps at once. */
export function backfillAllFloat(
  opts: { emitProgress?: (p: FloatBackfillProgress) => void } = {},
): Promise<FloatBackfillResult> {
  if (inFlight) return inFlight
  inFlight = run(opts).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run(opts: {
  emitProgress?: (p: FloatBackfillProgress) => void
}): Promise<FloatBackfillResult> {
  const startedAt = Date.now()

  const { fmp_api_key } = getSettings().values
  if (!fmp_api_key) {
    return {
      attempted: 0,
      filled: 0,
      unavailable: 0,
      unavailableSymbols: [],
      apiKeyMissing: true,
      durationMs: Date.now() - startedAt,
    }
  }

  const symbols = symbolsNeedingFloatFetch()
  if (symbols.length === 0) {
    return {
      attempted: 0,
      filled: 0,
      unavailable: 0,
      unavailableSymbols: [],
      apiKeyMissing: false,
      durationMs: Date.now() - startedAt,
    }
  }

  // FMP fetch → market_data upsert → per-symbol backfillFloatShares (NULL-only).
  // Rate-limit spacing, 429 → missing, and FMP-no-float → NULL are all inherited.
  await enrichFloatForImportedSymbols(symbols, opts.emitProgress)

  // Ground truth: which attempted symbols are STILL null after the sweep?
  const stillNull = new Set(symbolsNeedingFloatFetch())
  const unavailableSymbols = symbols.filter((s) => stillNull.has(s))

  return {
    attempted: symbols.length,
    filled: symbols.length - unavailableSymbols.length,
    unavailable: unavailableSymbols.length,
    unavailableSymbols,
    apiKeyMissing: false,
    durationMs: Date.now() - startedAt,
  }
}
