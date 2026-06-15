// v0.2.5 EdgeIQ Trader DNA — RVOL fill, the CACHE-ONLY cousin of the daily-%
// backfill. Re-derives full-day relative volume (daily_volumes[date] /
// avg_volume) from the market_data already cached — ZERO API: no fetchDailyBars,
// no withRateLimitRetry, no spacing. A fast local pass (the backfillAllMaeMfe
// profile, not daily-%'s network sweep). The per-value math is the tested pure
// helper (rvolFor) — no re-implemented logic. NULL-only → idempotent.

import { openDatabase } from '../db/database'
import {
  getMarketRow,
  setTradeRvol,
  symbolsNeedingRvol,
  tradesNeedingRvolForSymbol,
} from './repo'
import { rvolFor } from '@/core/market/rvol'

// Literal must match the migration's arm in electron/db/database.ts.
const PENDING_KEY = 'rvol_backfill_pending'

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

/** Fire-once consumer of the schema-32 arm flag (the runPendingMaeMfeBackfill
 *  precedent). A cache re-derive, so it runs inline (fast, no API) and clears the
 *  flag. No manual retry button: nothing 429-fails — symbols whose market_data
 *  arrives later are covered by the chain-after-refresh + the import-time fill. */
export function runPendingRvolBackfill(): void {
  const conn = openDatabase()
  const pending = conn
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(PENDING_KEY) as { value: string } | undefined
  if (pending?.value !== 'true') return
  try {
    const r = backfillAllRvol()
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'false')
         ON CONFLICT(key) DO UPDATE SET value = 'false'`,
      )
      .run(PENDING_KEY)
    console.info(
      `[FE rvol] auto-backfill: symbols=${r.symbols} filled=${r.filled} uncomputable=${r.uncomputable}`,
    )
  } catch (e) {
    console.error(`[FE rvol] auto-backfill threw, flag left set for retry: ${e}`)
  }
}
