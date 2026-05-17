// Pure import-time float enrichment orchestrator.
//
// Web-portable: takes injected callbacks for the Polygon fetch + persistence
// side-effects, so the same logic powers both the Electron import path and a
// future server-side importer. No electron/fs/sqlite/http imports here.
//
// Contract:
//   - Operates on an EXPLICIT symbol list (the import flow passes newly-
//     inserted symbols). The orchestrator deliberately does NOT apply a
//     staleness filter; the import path has already determined these symbols
//     need a float fetch. Callers that want TTL-based gating should filter
//     before calling.
//   - On success with a numeric float: persists via `persistFloat` and counts
//     in `fetched`.
//   - On success with a null float (Polygon has no shares_outstanding for the
//     ticker — common for delisted / non-equity instruments): persists null
//     via `persistFloat` so the row reflects "we asked, nothing there",
//     counts in `missing`.
//   - On fetch error: collects { symbol, message } in `errors`. No persist —
//     the existing row is left untouched so the next refresh can retry.
//     NEVER throws — callers in the import path must not block the import.
//   - Empty symbol list: fast no-op return.
//
// Shape mirrors src/core/country/import-orchestrator.ts so the post-commit
// composer can treat both orchestrators uniformly.

export interface EnrichFloatProgress {
  current: number
  total: number
  symbol: string
}

export interface EnrichFloatDeps {
  symbols: string[]
  fetchFloat: (symbol: string) => Promise<number | null>
  persistFloat: (symbol: string, float: number | null) => void
  emitProgress?: (p: EnrichFloatProgress) => void
  spacingMs?: number
}

export interface EnrichFloatResult {
  fetched: number
  missing: number
  errors: { symbol: string; message: string }[]
}

export async function enrichFloatForSymbols(
  deps: EnrichFloatDeps,
): Promise<EnrichFloatResult> {
  const out: EnrichFloatResult = { fetched: 0, missing: 0, errors: [] }
  if (deps.symbols.length === 0) return out

  const spacing = deps.spacingMs ?? 0
  let lastAt = 0
  const total = deps.symbols.length

  for (let i = 0; i < deps.symbols.length; i++) {
    const symbol = deps.symbols[i]
    if (spacing > 0) {
      const wait = spacing - (Date.now() - lastAt)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      lastAt = Date.now()
    }
    try {
      const float = await deps.fetchFloat(symbol)
      deps.persistFloat(symbol, float)
      if (float === null) out.missing++
      else out.fetched++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      out.errors.push({ symbol, message })
    }
    deps.emitProgress?.({ current: i + 1, total, symbol })
  }

  return out
}
