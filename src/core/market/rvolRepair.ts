// v0.2.7 Bug 1 — deferred RVOL repair. PURE per ARCHITECTURE #1: zero
// electron / fs / sqlite / React imports. Every side effect arrives as an
// injected dependency, so the whole decision path is unit-testable and the
// module would run unchanged inside a Next.js route.
//
// WHY THIS EXISTS. Import asks Polygon for daily aggregates over
// MIN(trade)-30 .. MAX(trade). Import the same day you trade and that session's
// daily bar is not published yet, so daily_volumes ends at the previous session
// and daily_volumes[trade.date] is undefined — rvolFor honestly returns null and
// the tile renders "—". The existing repair (backfillAllRvol) is cache-only BY
// CONTRACT, so it re-derives from the same short cache and can never heal it.
//
// The WINDOW is not the defect; the TIMING is. Asked again later, that identical
// window covers the missing session. So this repair refetches — it does not
// widen the request, and it does not invent a number.

import { rvolFor } from './rvol'

export interface RvolTradeNeed {
  id: number
  symbol: string
  /** YYYY-MM-DD — the key used to index daily_volumes. */
  date: string
}

export interface RvolCacheRow {
  daily_volumes: Record<string, number>
  avg_volume: number | null
}

export interface RvolRepairDeps {
  /** The NULL-only work-list: every trade whose rvol is still absent. */
  listTradesNeedingRvol: () => RvolTradeNeed[]
  /** Cached market_data for a symbol, or null when the row is absent. Called
   *  again AFTER a refetch, so freshly-landed sessions are visible. */
  getCached: (symbol: string) => RvolCacheRow | null
  /** Refetch aggregates for exactly these symbols, bypassing the freshness
   *  gate. Resolves once the cache has been updated. */
  refetchSymbols: (symbols: string[]) => Promise<void>
  setRvol: (tradeId: number, rvol: number | null) => void
}

export interface RvolRepairResult {
  scanned: number
  symbolsRefetched: number
  filled: number
  stillNull: number
}

/** Symbols carrying at least one NULL-rvol trade whose OWN date is absent from
 *  the cached daily_volumes map — plus any symbol with no market_data row at
 *  all. A trade whose date is already present needs no network: the cache can
 *  answer it, and rvolFor decides honestly from there. Deduped, sorted, so the
 *  request set is stable and minimal. */
export function symbolsMissingTradeDates(
  trades: RvolTradeNeed[],
  getCached: (symbol: string) => RvolCacheRow | null,
): string[] {
  const out = new Set<string>()
  for (const t of trades) {
    const row = getCached(t.symbol)
    if (!row || !(t.date in row.daily_volumes)) out.add(t.symbol)
  }
  return [...out].sort()
}

/** Fill every NULL rvol we honestly can, refetching ONLY the symbols whose
 *  cache cannot answer. Stands down with zero fetches when nothing is missing.
 *  Never fabricates: a value still uncomputable after the refetch is written
 *  back as null, exactly as rvolFor decided (the no-fake law). */
export async function repairMissingRvol(
  deps: RvolRepairDeps,
): Promise<RvolRepairResult> {
  const trades = deps.listTradesNeedingRvol()
  if (trades.length === 0) {
    return { scanned: 0, symbolsRefetched: 0, filled: 0, stillNull: 0 }
  }

  const symbols = symbolsMissingTradeDates(trades, deps.getCached)
  if (symbols.length > 0) await deps.refetchSymbols(symbols)

  // Re-read per symbol AFTER the refetch. Memoised so a nine-trade day costs
  // one cache read, not nine.
  const seen = new Map<string, RvolCacheRow | null>()
  const cached = (symbol: string): RvolCacheRow | null => {
    if (!seen.has(symbol)) seen.set(symbol, deps.getCached(symbol))
    return seen.get(symbol) ?? null
  }

  let filled = 0
  let stillNull = 0
  for (const t of trades) {
    const row = cached(t.symbol)
    const value = rvolFor(row?.daily_volumes[t.date], row?.avg_volume)
    deps.setRvol(t.id, value)
    if (value === null) stillNull++
    else filled++
  }

  return {
    scanned: trades.length,
    symbolsRefetched: symbols.length,
    filled,
    stillNull,
  }
}
