// Pure import-time country resolution orchestrator.
//
// Web-portable: takes injected callbacks for the provider fetches +
// persistence side-effects, so the same logic powers both the Electron import
// path and a future server-side importer. No electron/fs/sqlite/http here.
//
// v0.2.3 Stage 1 — FMP PRIMARY, Polygon FALLBACK. Per symbol:
//   1. fetchProfileCountry(symbol) → FMP /stable/profile domicile (alpha-2).
//      A valid country resolves confidently (source 'fmp'). This is the fix
//      for Polygon's free tier omitting domicile on US-listed foreign issuers.
//   2. Only when FMP returns null/empty do we call fetchRef(symbol) (Polygon)
//      and run resolveCountryFromPolygon — the existing path, UNCHANGED.
//   fetchProfileCountry is OPTIONAL: when omitted (or it throws), the
//   orchestrator behaves exactly as before — Polygon-only. That keeps the
//   pure contract back-compatible and lets the FMP wiring fail soft.
//
// Contract (unchanged):
//   - One country per symbol (import groups trades by symbol).
//   - On a resolved country: writes to BOTH trades and the cache via the two
//     persistence callbacks. Counted in `resolved`.
//   - On null country (both providers): writes source='unknown' to trades so
//     a future backfill retries. Counted in `unknown`.
//   - On a provider FETCH error: { symbol, message } in `errors`, counted in
//     `unknown`. The FMP error does NOT skip the Polygon fallback — only a
//     Polygon error (or FMP returning a clean null) is terminal-for-the-symbol.
//     NEVER throws — the import path must not block.

import {
  resolveCountryFromFmp,
  resolveCountryFromPolygon,
  type PolygonTickerRef,
  type ResolvedCountry,
} from './resolve'

export interface ImportResolveDeps {
  symbols: string[]
  /** FMP /stable/profile domicile fetch (v0.2.3 PRIMARY). Returns an ISO
   *  alpha-2 or null. OPTIONAL — when omitted, resolution is Polygon-only,
   *  preserving pre-v0.2.3 behaviour. */
  fetchProfileCountry?: (symbol: string) => Promise<string | null>
  /** Polygon ticker-reference fetch (FALLBACK, also the legacy primary). */
  fetchRef: (symbol: string) => Promise<PolygonTickerRef>
  applyToTrades: (symbol: string, resolved: ResolvedCountry) => void
  applyToCache?: (symbol: string, resolved: ResolvedCountry) => void
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
      const resolved = await resolveOne(symbol, deps, out)
      deps.applyToTrades(symbol, resolved)
      deps.applyToCache?.(symbol, resolved)
      if (resolved.country) out.resolved++
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

/** PRIMARY (FMP) → FALLBACK (Polygon) for one symbol. A confident FMP hit
 *  short-circuits before Polygon is ever called (the request-count win: a
 *  resolved symbol costs ONE FMP call, not FMP + Polygon). An FMP throw is
 *  recorded in errors[] but still falls through to Polygon. */
async function resolveOne(
  symbol: string,
  deps: ImportResolveDeps,
  out: ImportResolveResult,
): Promise<ResolvedCountry> {
  if (deps.fetchProfileCountry) {
    try {
      const country = await deps.fetchProfileCountry(symbol)
      const fromFmp = resolveCountryFromFmp(country)
      if (fromFmp.country) return fromFmp
      // FMP returned a clean null → no domicile on file. Fall through to
      // Polygon (NOT counted as an error — this is an expected miss).
    } catch (e) {
      // FMP fetch threw (e.g. a 15s timeout). Record it, but DON'T let it
      // suppress the Polygon fallback — the symbol may still resolve there.
      const message = e instanceof Error ? e.message : String(e)
      out.errors.push({ symbol, message: `fmp: ${message}` })
    }
  }

  const ref = await deps.fetchRef(symbol)
  return resolveCountryFromPolygon(ref)
}
