// Pure import-time aggregates enrichment orchestrator.
//
// Web-portable: takes injected callbacks for the Polygon fetch + persistence
// side-effects, so the same logic powers both the Electron import path and a
// future server-side importer. No electron/fs/sqlite/http imports here.
//
// Contract:
//   - Operates on an EXPLICIT symbol list (the import flow passes newly-
//     inserted symbols). Deliberately no staleness filter — same rationale
//     as the float orchestrator. The bug that motivated this whole
//     pipeline refactor was a staleness filter silently no-op'ing
//     first-time symbols; orchestrators on the import path must not
//     replicate that hazard.
//   - fetchAggregates returns AggregatesFetchResult — a date→volume map
//     plus a computed avg_volume over the same bars. The orchestrator
//     hands this to persistAggregates as-is; storage shape decisions
//     belong in the wrapper.
//   - Counters:
//       fetched — daily_volumes had ≥1 entry (≥1 real trading day in range)
//       empty   — the call succeeded but daily_volumes is empty (range fell
//                 outside trading days, delisted, etc.) — still persisted
//                 so the cache reflects "we asked, nothing there"
//       errors  — fetch threw; nothing persisted; orchestrator never throws
//
//   - Empty symbol list: fast no-op return.
//
// Shape mirrors src/core/float/orchestrator.ts so the post-commit composer
// can treat all three orchestrators uniformly.

export interface EnrichAggregatesProgress {
  current: number
  total: number
  symbol: string
}

/** Per-symbol payload returned by the wrapper's fetchAggregates callback.
 *  `avg_volume` is computed from the same bars as `daily_volumes` so the
 *  two stay consistent — recalculating downstream from daily_volumes
 *  alone would lose precision once volumes are JSON-roundtripped. */
export interface AggregatesFetchResult {
  daily_volumes: Record<string, number>
  avg_volume: number | null
}

export interface EnrichAggregatesDeps {
  symbols: string[]
  fetchAggregates: (symbol: string) => Promise<AggregatesFetchResult>
  persistAggregates: (symbol: string, result: AggregatesFetchResult) => void
  emitProgress?: (p: EnrichAggregatesProgress) => void
  spacingMs?: number
}

export interface EnrichAggregatesResult {
  fetched: number
  empty: number
  /** Symbols whose fetch threw (after all retries exhausted). Distinct
   *  from `empty` (which means Polygon returned zero bars for the range,
   *  a legitimate answer for delisted tickers or trade dates outside
   *  the market calendar). Length matches `errors.length`. */
  errored: number
  errors: { symbol: string; message: string }[]
}

export async function enrichAggregatesForSymbols(
  deps: EnrichAggregatesDeps,
): Promise<EnrichAggregatesResult> {
  const out: EnrichAggregatesResult = { fetched: 0, empty: 0, errored: 0, errors: [] }
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
      const result = await deps.fetchAggregates(symbol)
      deps.persistAggregates(symbol, result)
      if (Object.keys(result.daily_volumes).length === 0) out.empty++
      else out.fetched++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      out.errors.push({ symbol, message })
      out.errored++
    }
    deps.emitProgress?.({ current: i + 1, total, symbol })
  }

  return out
}
