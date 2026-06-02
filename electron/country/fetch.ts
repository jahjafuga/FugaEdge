import { getSettings } from '../settings/repo'
import { fetchTickerReference, MassiveError } from '../market/massive'
import { fetchCompanyProfile } from '@/services/fmp'
import { withRateLimitRetry } from '../market/rate-limit'
import {
  resolveCountryFromFmp,
  resolveCountryFromPolygon,
  type ResolvedCountry,
} from '@/core/country/resolve'
import {
  tradesNeedingCountryFetch,
  applyCountryToBoth,
  saveTradeCountry,
} from '../trades/country'

const REQUEST_SPACING_MS = 350
const PROGRESS_EVERY = 1

export interface CountryBackfillResult {
  updated: number
  skipped: number
  failed: number
  apiKeyMissing: boolean
  errors: { symbol: string; message: string }[]
  durationMs: number
}

let inFlight: Promise<CountryBackfillResult> | null = null

/** One-shot resolve for a single ticker. Used by the on-demand IPC and not
 *  subject to the singleton in-flight lock.
 *
 *  v0.2.3 Stage 1 — FMP profile domicile is PRIMARY; Polygon ticker-ref is
 *  the FALLBACK, hit only when FMP returns no country. Returns null when NO
 *  usable key is configured (neither FMP nor Polygon). A confident FMP hit
 *  short-circuits before Polygon is called. */
export async function resolveForTicker(symbol: string): Promise<ResolvedCountry | null> {
  const { polygon_api_key, fmp_api_key } = getSettings().values
  if (!polygon_api_key && !fmp_api_key) return null

  // PRIMARY: FMP domicile. fetchCompanyProfile never throws except on a real
  // 15s timeout; for an on-demand single lookup let that propagate to the IPC
  // caller (unlike the import path, there's no batch to protect).
  if (fmp_api_key) {
    // v0.2.3 Stage 2 — fetchCompanyProfile now returns the full CompanyProfile
    // (country + marketCap/sector/industry). This on-demand single-ticker
    // resolve only needs the country; pull it off the profile. (The import
    // path persists the passengers; this IPC path resolves country only.)
    const profile = await fetchCompanyProfile(fmp_api_key, symbol)
    const fromFmp = resolveCountryFromFmp(profile?.country ?? null)
    if (fromFmp.country) return fromFmp
  }

  // FALLBACK: Polygon ticker-ref. If there's no Polygon key, FMP was all we
  // had — return its (unknown) result rather than null so the caller still
  // gets a shaped answer.
  if (!polygon_api_key) return resolveCountryFromFmp(null)
  const ref = await fetchTickerReference(polygon_api_key, symbol)
  return resolveCountryFromPolygon(ref)
}

export function backfillAllCountries(
  opts: { force?: boolean; emitProgress?: (p: { current: number; total: number; symbol: string }) => void } = {},
): Promise<CountryBackfillResult> {
  if (inFlight) return inFlight
  inFlight = run(opts).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run(opts: {
  force?: boolean
  emitProgress?: (p: { current: number; total: number; symbol: string }) => void
}): Promise<CountryBackfillResult> {
  const startedAt = Date.now()
  // v0.2.3 Stage 1.5 — FMP is now PRIMARY for the batch backfill too (mirrors
  // resolveForTicker / the import orchestrator). Only short-circuit when NO
  // usable key is configured at all; FMP alone is enough to run.
  const { polygon_api_key, fmp_api_key } = getSettings().values
  if (!polygon_api_key && !fmp_api_key) {
    return {
      updated: 0, skipped: 0, failed: 0,
      apiKeyMissing: true, errors: [], durationMs: Date.now() - startedAt,
    }
  }

  const groups = tradesNeedingCountryFetch(!!opts.force)
  if (groups.length === 0) {
    return {
      updated: 0, skipped: 0, failed: 0,
      apiKeyMissing: false, errors: [], durationMs: Date.now() - startedAt,
    }
  }

  let lastRequestAt = 0
  const respectSpacing = async () => {
    const since = Date.now() - lastRequestAt
    if (since < REQUEST_SPACING_MS) {
      await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS - since))
    }
    lastRequestAt = Date.now()
  }

  let updated = 0
  let skipped = 0
  let failed = 0
  const errors: { symbol: string; message: string }[] = []

  for (let i = 0; i < groups.length; i++) {
    const { symbol, trade_ids } = groups[i]
    if (opts.emitProgress && (i % PROGRESS_EVERY === 0 || i === groups.length - 1)) {
      opts.emitProgress({ current: i + 1, total: groups.length, symbol })
    }
    try {
      await respectSpacing()
      // PRIMARY: FMP domicile (mirror resolveForTicker). A confident FMP
      // country short-circuits Polygon — the request-count win and the fix for
      // Polygon's free tier omitting domicile on US-listed foreign issuers.
      let resolved: ResolvedCountry | null = null
      if (fmp_api_key) {
        try {
          const profile = await withRateLimitRetry(() =>
            fetchCompanyProfile(fmp_api_key, symbol),
          )
          const fromFmp = resolveCountryFromFmp(profile?.country ?? null)
          if (fromFmp.country) resolved = fromFmp // source 'fmp'
        } catch (e) {
          // FMP threw (e.g. a 15s timeout). Log and fall through to Polygon —
          // an FMP error must NOT break per-symbol resolution or the loop.
          console.info(
            `[FE country] ${symbol} fmp failed: ${e instanceof Error ? e.message : String(e)}`,
          )
        }
      }
      // FALLBACK: Polygon ticker-ref, only when FMP gave no confident country.
      if (!resolved && polygon_api_key) {
        const ref = await withRateLimitRetry(() =>
          fetchTickerReference(polygon_api_key, symbol),
        )
        resolved = resolveCountryFromPolygon(ref) // 'polygon' | 'inferred' | 'unknown'
      }
      // FMP-only key with no domicile on file → unknown sentinel.
      if (!resolved) resolved = resolveCountryFromFmp(null)
      const changed = applyCountryToBoth(symbol, {
        country: resolved.country,
        country_name: resolved.country_name,
        region: resolved.region,
        source: resolved.source,
      })
      if (changed > 0) updated += changed
      else skipped += trade_ids.length
    } catch (e) {
      failed += trade_ids.length
      const msg = e instanceof MassiveError
        ? `${e.status === 0 ? 'network' : e.status}: ${e.message}`
        : e instanceof Error ? e.message : String(e)
      errors.push({ symbol, message: msg })
      console.info(`[FE country] ${symbol} failed: ${msg}`)
    }
  }

  return {
    updated, skipped, failed,
    apiKeyMissing: false,
    errors,
    durationMs: Date.now() - startedAt,
  }
}

export { saveTradeCountry }
