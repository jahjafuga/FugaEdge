// Pure import-time country resolution orchestrator.
//
// Web-portable: takes injected callbacks for the Polygon fetch + persistence
// side-effects, so the same logic powers both the Electron import path and a
// future server-side importer. No electron/fs/sqlite/http imports here.
//
// Contract:
//   - Resolves one country per symbol (the import flow groups trades by
//     symbol, so we call Polygon once per ticker, not once per trade).
//   - On success: writes country to BOTH trades and the cache via the two
//     persistence callbacks. Counted in `resolved`.
//   - On null country: writes source='unknown' to trades (so a future
//     backfill knows to retry). Counted in `unknown`.
//   - On fetch error: collects { symbol, message } in `errors` and counts in
//     `unknown` (the trade keeps its current state — typically NULL/NULL).
//     NEVER throws — callers in the import path must not block the import.

import { resolveCountryFromPolygon, type PolygonTickerRef, type ResolvedCountry } from './resolve'

export interface ImportResolveDeps {
  symbols: string[]
  fetchRef: (symbol: string) => Promise<PolygonTickerRef>
  applyToTrades: (symbol: string, resolved: ResolvedCountry) => void
  applyToCache?: (symbol: string, resolved: ResolvedCountry) => void
  spacingMs?: number
}

export interface ImportResolveResult {
  resolved: number
  unknown: number
  errors: { symbol: string; message: string }[]
  /** True when the Electron wrapper short-circuited because no Polygon
   *  API key is configured. The pure orchestrator never sets this — it
   *  receives a fetchRef callback and has no concept of credentials. */
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
      const ref = await deps.fetchRef(symbol)
      const resolved = resolveCountryFromPolygon(ref)
      deps.applyToTrades(symbol, resolved)
      deps.applyToCache?.(symbol, resolved)
      if (resolved.country) out.resolved++
      else out.unknown++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      out.errors.push({ symbol, message })
      out.unknown++
    }
  }

  return out
}
