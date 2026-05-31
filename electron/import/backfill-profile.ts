// v0.2.3 Stage A — standalone sector/industry backfill over EXISTING market_data
// rows (not an import side effect).
//
// Distinct from import-time enrichment: this path is user-triggered from
// Settings → Data backfill and operates on market_data rows ALREADY in the DB
// whose `industry` is still NULL (imported before FMP profile wiring existed,
// or carrying stale Polygon SIC `sector` text). It calls the EXISTING
// fetchCompanyProfile (src/services/fmp.ts) once per symbol and writes the
// GICS-style `sector` + `industry` back — NOTHING else.
//
// Scope discipline (Lao-approved): the SAME /stable/profile response also
// carries `country` + `marketCap`, but Stage A deliberately does NOT write them.
// Country has its own resolver + manual-override provenance (country_source);
// marketCap has its own story. Writing them here would bypass both.
//
// Honesty rules:
//   - A null profile (FMP has no data for the symbol) leaves the row UNTOUCHED:
//     no upsert, no empty strings, no partial write. The symbol is reported in
//     unavailableSymbols so the user can inspect / fill manually.
//   - On a hit, sector/industry are written via `?? existing` so a null FMP
//     FIELD never wipes a value already present (the upsert overwrites `sector`
//     unconditionally, so this JS coalesce is what protects it).
//   - A partial hit (sector present, industry null) writes the sector but the
//     row stays industry-NULL, so the non-force worklist re-attempts it later.
//
// Web-portable per ARCHITECTURE.md Rule 4: the FMP key never leaves the main
// process; this module reads it via getSettings (mirrors backfill-float.ts) and
// the pure FMP service receives it as a parameter.

import type {
  ProfileBackfillProgress,
  ProfileBackfillResult,
} from '@shared/market-types'
import { getSettings } from '../settings/repo'
import { fetchCompanyProfile } from '@/services/fmp'
import {
  getMarketRow,
  symbolsNeedingProfileBackfill,
  upsertMarketRow,
} from '../market/repo'

const REQUEST_SPACING_MS = 350

let inFlight: Promise<ProfileBackfillResult> | null = null

/** Backfill GICS sector + industry onto every market_data row whose industry is
 *  NULL (or every row when force=true). Singleton-locked (mirrors
 *  backfillAllFloat / backfillAllCountries) so a double-click or racing import
 *  can't run two FMP profile sweeps at once. */
export function backfillAllProfiles(
  opts: {
    force?: boolean
    emitProgress?: (p: ProfileBackfillProgress) => void
  } = {},
): Promise<ProfileBackfillResult> {
  if (inFlight) return inFlight
  inFlight = run(opts).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run(opts: {
  force?: boolean
  emitProgress?: (p: ProfileBackfillProgress) => void
}): Promise<ProfileBackfillResult> {
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

  const symbols = symbolsNeedingProfileBackfill(!!opts.force)
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

  // Sequential, rate-limit-spaced (mirrors country/fetch.ts) so the function is
  // safe if later reused against a much larger market_data table.
  let lastRequestAt = 0
  const respectSpacing = async () => {
    const since = Date.now() - lastRequestAt
    if (since < REQUEST_SPACING_MS) {
      await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS - since))
    }
    lastRequestAt = Date.now()
  }

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i]
    opts.emitProgress?.({ current: i + 1, total: symbols.length, symbol })
    try {
      await respectSpacing()
      const profile = await fetchCompanyProfile(fmp_api_key, symbol)
      // Null = FMP had nothing → leave the row UNTOUCHED (no upsert at all).
      if (!profile) continue

      const existing = getMarketRow(symbol)
      upsertMarketRow({
        symbol,
        // ── The only two columns Stage A writes ──
        // `?? existing` so a null FMP field never wipes a present value.
        sector: profile.sector ?? existing?.sector ?? null,
        industry: profile.industry ?? existing?.industry ?? null,
        // ── Passengers: preserved exactly, never written from the profile ──
        // (country + marketCap are intentionally out of scope; see header.)
        float: existing?.float ?? null,
        shares_outstanding: existing?.shares_outstanding ?? null,
        market_cap: existing?.market_cap ?? null,
        avg_volume: existing?.avg_volume ?? null,
        daily_volumes: existing?.daily_volumes ?? {},
        country: existing?.country ?? null,
        country_name: existing?.country_name ?? null,
        region: existing?.region ?? null,
        fetched_at: new Date().toISOString(),
        error: null,
      })

      // TEMPORARY sandbox-inspection log (remove before commit if noisy): the
      // raw strings FMP returns for our 19 symbols, so we can judge whether a
      // GICS normalization pass is needed before Stage B. Not persisted, not
      // surfaced in the UI. Secrets rule: symbol + values only, never the URL.
      console.info(
        `[stage-a] ${symbol} sector="${profile.sector ?? ''}" industry="${profile.industry ?? ''}"`,
      )
    } catch (e) {
      // fetchCompanyProfile throws ONLY on a genuine 15s timeout. One stall must
      // not abort the batch — treat as a miss (row untouched, retried next run).
      console.info(
        `[stage-a] ${symbol} fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  // Ground truth (mirrors backfill-float.ts): which attempted symbols STILL have
  // a null industry after the sweep? Those are the misses — FMP had no industry,
  // a partial hit (sector only), or a timeout. The non-force worklist returns
  // exactly the industry-NULL rows, so the renderer can NAME them.
  const stillNull = new Set(symbolsNeedingProfileBackfill(false))
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
