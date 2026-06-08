// v0.2.4 — lazy-guard hook for trade_technicals compute.
//
// Fires from electron/market/bars-get.ts after warmup +
// active bars become available. For each trade on the
// (symbol, date), checks the trade_technicals row state
// and triggers compute if missing / incomplete / stale.
// Per-trade try/catch isolates failures.
//
// Design: fire-and-forget from the bars-get wrapper via
// setImmediate so chart-open stays snappy. The compute
// itself is pure JS math (Commit 2) and runs in
// milliseconds; the upsert is synchronous better-sqlite3
// (Commit 3) and equally fast. Bumps dataVersion if any
// row was upserted so Session 4's tab re-queries.
//
// SaaS-port shape: the lazy-guard primitive maps directly
// to a server-side "compute on first read" cache-warm
// worker. The pure compute (Commit 2) ships unchanged.

import type { IntradayBarsPayload } from '@shared/market-types'
import { openDatabase } from '../db/database'
import { bumpDataVersion } from '../lib/cache'
import {
  computeTradeTechnicals,
  TECHNICALS_SCHEMA_VERSION,
  type TradeForTechnicals,
} from '@/core/technicals/computeTradeTechnicals'
import {
  getTradeTechnicals,
  upsertTradeTechnicals,
} from './repo'

/**
 * Raw shape returned by the per-(symbol, date) trade
 * lookup — id, side (long/short), and the raw
 * executions_json TEXT column from disk.
 */
interface TradeLookupRow {
  id: number
  side: 'long' | 'short'
  executions_json: string | null
}

/**
 * Per-fill execution shape as stored in executions_json.
 * Structurally satisfies the narrow TradeForTechnicals.executions
 * shape from Commit 2 without any adaptation.
 */
interface ParsedExecution {
  side: 'B' | 'S'
  qty: number
  price: number
  time: string
}

/**
 * Parse executions_json into a typed array. Inlined
 * 3-line copy matching the existing convention at
 * electron/trades/list.ts:80 and electron/analytics/get.ts:59
 * (both have identical local copies). Dedup of the
 * three parsers is parked tech debt for v0.3.0.
 */
function parseExecutions(raw: string | null | undefined): ParsedExecution[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr as ParsedExecution[]
  } catch {
    return []
  }
}

/**
 * Return all trades for a given (symbol, date) — excluding
 * Trash via deleted_at IS NULL, matching the filter
 * template at electron/import/apply-fees.ts.
 *
 * Returns the raw rows; the caller parses executions
 * and adapts to TradeForTechnicals.
 */
function getTradesForSymbolDate(symbol: string, date: string): TradeLookupRow[] {
  const db = openDatabase()
  return db
    .prepare(`
      SELECT id, side, executions_json
      FROM trades
      WHERE symbol = ? AND date = ? AND deleted_at IS NULL
    `)
    .all(symbol, date) as TradeLookupRow[]
}

/**
 * Skip predicate: a trade's existing trade_technicals row
 * is current iff it exists, has data_complete = true, and
 * its schema_version is >= the current
 * TECHNICALS_SCHEMA_VERSION.
 *
 * Exported for testability.
 */
export function isTechnicalsCurrent(
  existing: { data_complete: boolean; schema_version: number } | null,
): boolean {
  if (existing === null) return false
  if (!existing.data_complete) return false
  if (existing.schema_version < TECHNICALS_SCHEMA_VERSION) return false
  return true
}

/**
 * Adapt a raw TradeLookupRow to the narrow TradeForTechnicals
 * shape expected by computeTradeTechnicals. Parses
 * executions_json inline.
 *
 * Exported for testability.
 */
export function toTradeForTechnicals(row: TradeLookupRow): TradeForTechnicals {
  return {
    side: row.side,
    executions: parseExecutions(row.executions_json),
  }
}

/**
 * Lazy-guard entry point. Called fire-and-forget from
 * bars-get.ts after a complete (warmup + active, no
 * error) payload is resolved.
 *
 * For each trade on the (symbol, date):
 *   1. Check the existing trade_technicals row state via
 *      getTradeTechnicals.
 *   2. Skip if current per isTechnicalsCurrent.
 *   3. Otherwise compute via computeTradeTechnicals and
 *      upsert via upsertTradeTechnicals.
 *   4. Per-trade try/catch so one trade's failure doesn't
 *      poison the rest of the batch.
 *
 * Bumps dataVersion if >= 1 row was upserted (matches
 * the electron/market/intraday.ts:59,75 idiom). Returns
 * void; errors are logged but not thrown to the caller.
 */
export function runLazyGuardForPayload(payload: IntradayBarsPayload): void {
  // Defensive: gated by the caller, but double-check.
  if (payload.error) return
  if (!payload.bars || payload.bars.length === 0) return
  if (!payload.warmupBars || payload.warmupBars.length === 0) {
    // Active-only is acceptable for compute, but the
    // gated trigger requires warmup present per the
    // §E "When it runs" amendment. Skip to keep the
    // hook scope tight to the documented trigger.
    return
  }

  let trades: TradeLookupRow[]
  try {
    trades = getTradesForSymbolDate(payload.symbol, payload.date)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[FE technicals] trade lookup failed for ${payload.symbol} ${payload.date}: ${msg}`,
    )
    return
  }

  if (trades.length === 0) return

  let upserted = 0
  for (const row of trades) {
    try {
      const existing = getTradeTechnicals(row.id)
      if (isTechnicalsCurrent(existing)) continue

      const trade = toTradeForTechnicals(row)
      const result = computeTradeTechnicals(
        trade,
        payload.warmupBars,
        payload.bars,
      )
      upsertTradeTechnicals(row.id, result)
      upserted += 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(
        `[FE technicals] compute failed for trade ${row.id} (${payload.symbol} ${payload.date}): ${msg}`,
      )
      // Continue to the next trade — one bad apple
      // doesn't poison the (symbol, date) batch.
    }
  }

  if (upserted > 0) {
    bumpDataVersion()
  }
}
