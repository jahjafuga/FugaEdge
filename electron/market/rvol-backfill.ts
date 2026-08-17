// v0.2.5 EdgeIQ Trader DNA — RVOL fill, the CACHE-ONLY cousin of the daily-%
// backfill. Re-derives full-day relative volume (daily_volumes[date] /
// avg_volume) from the market_data already cached — ZERO API: no fetchDailyBars,
// no withRateLimitRetry, no spacing. A fast local pass (the backfillAllMaeMfe
// profile, not daily-%'s network sweep). The per-value math is the tested pure
// helper (rvolFor) — no re-implemented logic. NULL-only → idempotent.
//
// v0.2.7: that ZERO-API description still describes backfillAllRvol EXACTLY, and
// its contract is unchanged. It no longer describes the whole file —
// runPendingRvolBackfill below now delegates to the API-capable repair, because
// cache-only re-derivation provably cannot heal a session that never landed in
// the cache.

import {
  getMarketRow,
  setTradeRvol,
  symbolsNeedingRvol,
  tradesNeedingRvolForSymbol,
} from './repo'
import { rvolFor } from '@/core/market/rvol'
import { runRvolRepair } from './rvol-repair'

export interface RvolBackfillResult {
  symbols: number
  filled: number
  uncomputable: number
}

/** Re-derive rvol for every trade whose value is NULL, from CACHED market_data.
 *  Fast + synchronous — no network. NULL when the symbol has no market_data, the
 *  trade's date isn't in daily_volumes, or avg_volume ≤ 0 (honest). Idempotent:
 *  a still-NULL trade is re-derived once its market_data arrives (the
 *  chain-after-refresh below + the import-time fill). */
export function backfillAllRvol(): RvolBackfillResult {
  const symbols = symbolsNeedingRvol()
  let filled = 0
  let uncomputable = 0
  for (const symbol of symbols) {
    const md = getMarketRow(symbol) // cache read — no fetch
    for (const t of tradesNeedingRvolForSymbol(symbol)) {
      const rvol = md ? rvolFor(md.daily_volumes[t.date], md.avg_volume) : null
      setTradeRvol(t.id, rvol)
      if (rvol === null) uncomputable++
      else filled++
    }
  }
  return { symbols: symbols.length, filled, uncomputable }
}

/** Launch-time RVOL repair.
 *
 *  v0.2.7 — THE TRIGGER IS NOW DERIVED FROM DATA, NOT A FLAG. This used to gate
 *  on the schema-32 arm `rvol_backfill_pending`, a key written ONLY by the
 *  priorVersion < 32 upgrade path. A database created FRESH at schema >= 32
 *  never receives it, so `pending?.value !== 'true'` returned immediately and
 *  the launch repair was a permanent no-op on exactly the books that need it.
 *  Measured on the live journal (2026-08-17): the key is absent from `settings`
 *  entirely, and all 28 trades carry rvol NULL. Ask the data instead — "is any
 *  trade still missing rvol?" — which is true on an unhealed book and false once
 *  it is whole, needing no migration arm and no bookkeeping.
 *
 *  Unlike the old body this is API-CAPABLE: it delegates to runRvolRepair, which
 *  refetches only the symbols whose cache cannot answer. backfillAllRvol above
 *  keeps its cache-only contract untouched and its other two callers unchanged.
 *
 *  Never rejects — the whole body is wrapped, so the bare
 *  `setImmediate(runPendingRvolBackfill)` call site stays safe. */
export async function runPendingRvolBackfill(): Promise<void> {
  try {
    if (symbolsNeedingRvol().length === 0) return
    const r = await runRvolRepair()
    console.info(
      `[FE rvol] launch repair: scanned=${r.scanned} refetched=${r.symbolsRefetched} ` +
        `filled=${r.filled} stillNull=${r.stillNull}`,
    )
  } catch (e) {
    console.error(`[FE rvol] launch repair threw (non-fatal, retries next launch): ${e}`)
  }
}
