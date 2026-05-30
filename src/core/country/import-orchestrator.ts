// Pure import-time country + profile resolution orchestrator.
//
// Web-portable: takes injected callbacks for the provider fetches +
// persistence side-effects, so the same logic powers both the Electron import
// path and a future server-side importer. No electron/fs/sqlite/http here.
//
// v0.2.3 Stage 1 — FMP PRIMARY, Polygon FALLBACK for COUNTRY. Per symbol:
//   1. fetchProfile(symbol) → FMP /stable/profile (country + passengers).
//      A valid country resolves confidently (source 'fmp'). This is the fix
//      for Polygon's free tier omitting domicile on US-listed foreign issuers.
//   2. Only when FMP returns null country do we call fetchRef(symbol)
//      (Polygon) and run resolveCountryFromPolygon — the existing path,
//      UNCHANGED.
//   fetchProfile is OPTIONAL: when omitted (or it throws), the orchestrator
//   behaves exactly as before — Polygon-only. That keeps the pure contract
//   back-compatible and lets the FMP wiring fail soft.
//
// v0.2.3 Stage 2 — the SAME /stable/profile call also carries marketCap,
// sector, and industry. These "passenger" fields ride alongside the resolved
// country (Option B threading) so the import country phase can persist them to
// market_data with ZERO extra requests. They have no bearing on country
// resolution — a symbol with a null country but a non-null marketCap still
// carries the marketCap through. TAXONOMY: FMP sector/industry are GICS-style
// ("Healthcare" / "Biotechnology"), NOT Polygon SIC text.
//
// Contract:
//   - One result per symbol (import groups trades by symbol).
//   - On a resolved country: writes to BOTH trades and the cache via the two
//     persistence callbacks. Counted in `resolved`.
//   - On null country (both providers): writes source='unknown' to trades so
//     a future backfill retries. Counted in `unknown`. (Passengers may still
//     be non-null and are persisted regardless.)
//   - On a provider FETCH error: { symbol, message } in `errors`, counted in
//     `unknown`. The FMP error does NOT skip the Polygon fallback — only a
//     Polygon error (or FMP returning a clean null country) is
//     terminal-for-the-symbol. NEVER throws — the import path must not block.

import {
  resolveCountryFromFmp,
  resolveCountryFromPolygon,
  type PolygonTickerRef,
  type ResolvedCountry,
} from './resolve'
import type { CompanyProfile } from '@shared/fmp-types'

/** What the orchestrator resolved for one symbol: the country (FMP-primary,
 *  Polygon-fallback) plus the FMP profile passenger fields from the same
 *  /stable/profile call. Passengers are all-null when no FMP profile was
 *  fetched (Polygon-only mode) or the profile carried nulls. */
export interface ResolvedSymbol {
  resolved: ResolvedCountry
  marketCap: number | null
  sector: string | null
  industry: string | null
}

export interface ImportResolveDeps {
  symbols: string[]
  /** FMP /stable/profile fetch (v0.2.3 PRIMARY for country + the source of the
   *  marketCap/sector/industry passengers). Returns the full CompanyProfile or
   *  null on a total miss. OPTIONAL — when omitted, resolution is Polygon-only
   *  and passengers are all-null, preserving pre-v0.2.3 behaviour. */
  fetchProfile?: (symbol: string) => Promise<CompanyProfile | null>
  /** Polygon ticker-reference fetch (FALLBACK, also the legacy primary). */
  fetchRef: (symbol: string) => Promise<PolygonTickerRef>
  applyToTrades: (symbol: string, r: ResolvedSymbol) => void
  applyToCache?: (symbol: string, r: ResolvedSymbol) => void
  spacingMs?: number
}

export interface ImportResolveResult {
  resolved: number
  unknown: number
  errors: { symbol: string; message: string }[]
  /** True when the Electron wrapper short-circuited because NO usable API key
   *  is configured. The pure orchestrator never sets this — it receives fetch
   *  callbacks and has no concept of credentials. */
  apiKeyMissing: boolean
}

export async function resolveCountriesForImport(
  deps: ImportResolveDeps,
): Promise<ImportResolveResult> {
  const out: ImportResolveResult = { resolved: 0, unknown: 0, errors: [], apiKeyMissing: false }
  const spacing = deps.spacingMs ?? 0
  let lastAt = 0

  for (const symbol of deps.symbols) {
    if (spacing > 0) {
      const wait = spacing - (Date.now() - lastAt)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      lastAt = Date.now()
    }
    try {
      const r = await resolveOne(symbol, deps, out)
      deps.applyToTrades(symbol, r)
      deps.applyToCache?.(symbol, r)
      if (r.resolved.country) out.resolved++
      else out.unknown++
    } catch (e) {
      // Reaches here only when the Polygon FALLBACK threw (FMP errors are
      // caught inside resolveOne so they can't suppress the fallback).
      const message = e instanceof Error ? e.message : String(e)
      out.errors.push({ symbol, message })
      out.unknown++
    }
  }

  return out
}

/** PRIMARY (FMP) → FALLBACK (Polygon) for one symbol. A confident FMP country
 *  hit short-circuits before Polygon is ever called (the request-count win: a
 *  resolved symbol costs ONE FMP call, not FMP + Polygon). An FMP throw is
 *  recorded in errors[] but still falls through to Polygon.
 *
 *  The FMP profile's passenger fields (marketCap/sector/industry) ride through
 *  whenever a profile was fetched — even if country fell back to Polygon, we
 *  still keep the passengers from the call we already made. */
async function resolveOne(
  symbol: string,
  deps: ImportResolveDeps,
  out: ImportResolveResult,
): Promise<ResolvedSymbol> {
  let profile: CompanyProfile | null = null
  if (deps.fetchProfile) {
    try {
      profile = await deps.fetchProfile(symbol)
      const fromFmp = resolveCountryFromFmp(profile?.country ?? null)
      if (fromFmp.country) {
        // FMP gave a confident country — short-circuit Polygon. Passengers
        // come from the same profile.
        return {
          resolved: fromFmp,
          marketCap: profile?.marketCap ?? null,
          sector: profile?.sector ?? null,
          industry: profile?.industry ?? null,
        }
      }
      // FMP returned a null country → no domicile on file. Fall through to
      // Polygon for COUNTRY (NOT counted as an error — expected miss). Any
      // passengers FMP did return are still carried through below.
    } catch (e) {
      // FMP fetch threw (e.g. a 15s timeout). Record it, but DON'T let it
      // suppress the Polygon fallback — the symbol may still resolve there.
      // profile stays null, so passengers are null.
      const message = e instanceof Error ? e.message : String(e)
      out.errors.push({ symbol, message: `fmp: ${message}` })
    }
  }

  const ref = await deps.fetchRef(symbol)
  return {
    resolved: resolveCountryFromPolygon(ref),
    marketCap: profile?.marketCap ?? null,
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
  }
}
