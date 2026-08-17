// v0.2.7 Bug 1 — electron wiring for the deferred RVOL repair. Owns the
// side-effecting edges (repo reads/writes + the Polygon refresh) and hands them
// to the pure orchestrator in src/core/market/rvolRepair.ts, per ARCHITECTURE #1.
//
// The refetch REUSES the existing force path — refreshMarketData({ force: true,
// symbols }) — rather than introducing a second fetch client. force=true is
// precisely what bypasses the 7-day CACHE_MS freshness gate: symbolsNeedingFetch
// classifies a symbol fetched under a week ago as 'fresh', and orderRefreshSymbols
// DROPS fresh symbols before any network call. That gate is why the stale cache
// could never heal itself.
//
// KNOWN LIMIT: refreshMarketData is guarded by a singleton `inFlight` promise —
// a caller arriving while another refresh runs joins THAT run and its opts are
// discarded. If a launch-time refresh is already in flight, this repair's forced
// per-symbol request can be absorbed by it and the sessions may not land. The
// pass is idempotent and NULL-only, so the next launch simply retries; making
// the lock opts-aware is a separate change.

import { getMarketRow, setTradeRvol, tradesNeedingRvol } from './repo'
import { refreshMarketData } from './fetch'
import {
  repairMissingRvol,
  type RvolRepairResult,
} from '@/core/market/rvolRepair'

/** Heal every trade whose rvol is NULL because its own session never landed in
 *  the cache, refetching only the symbols that need it. Zero fetches when the
 *  cache can already answer. */
export async function runRvolRepair(): Promise<RvolRepairResult> {
  return repairMissingRvol({
    listTradesNeedingRvol: tradesNeedingRvol,
    getCached: (symbol) => {
      const row = getMarketRow(symbol)
      return row
        ? { daily_volumes: row.daily_volumes, avg_volume: row.avg_volume }
        : null
    },
    refetchSymbols: async (symbols) => {
      await refreshMarketData({ force: true, symbols })
    },
    setRvol: setTradeRvol,
  })
}
