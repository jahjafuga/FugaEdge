import type { ExitDelta } from '@shared/analytics-types'
import type { RoundTripExecution } from '@shared/import-types'

// Minimal trade shape the best-exit math needs. TradeListRow satisfies it
// structurally; electron/analytics/get.ts maps its DB row (parsing
// executions_json) to the same fields.
export interface ExitDeltaInput {
  id: number
  date: string
  symbol: string
  side: 'long' | 'short'
  net_pnl: number
  total_fees: number
  executions: RoundTripExecution[]
}

// "Money left on table" per trade, derived purely from the trade's own exit
// fills — NOT intraday bars. For a scaled-out trade, the best exit fill is the
// price you actually got on your best lot; this asks what the whole exit would
// have netted had every share filled there (fees unchanged). delta ≥ 0 is the
// gap. Single-exit trades and flat-price scale-outs (delta = 0) are excluded.
// Returns every eligible trade, sorted by delta descending. Single source for
// the Analytics Exit Quality table (top-N) and the day/week Money-Left sum.
export function computeExitDeltas(trades: ExitDeltaInput[]): ExitDelta[] {
  const out: ExitDelta[] = []

  for (const t of trades) {
    if (t.executions.length === 0) continue

    const isLong = t.side === 'long'
    const exitSide: 'B' | 'S' = isLong ? 'S' : 'B'
    const entrySide: 'B' | 'S' = isLong ? 'B' : 'S'

    const exits = t.executions.filter((e) => e.side === exitSide)
    const entries = t.executions.filter((e) => e.side === entrySide)
    if (exits.length < 2 || entries.length === 0) continue

    const exitShares = exits.reduce((s, e) => s + e.qty, 0)
    if (exitShares === 0) continue
    const exitValue = exits.reduce((s, e) => s + e.qty * e.price, 0)
    const actualAvgExit = exitValue / exitShares

    const entryValue = entries.reduce((s, e) => s + e.qty * e.price, 0)

    const bestExitPrice = isLong
      ? Math.max(...exits.map((e) => e.price))
      : Math.min(...exits.map((e) => e.price))

    // Gross P&L is sell_value − buy_value regardless of side. Project all exit
    // shares onto the best exit price.
    const bestExitValue = exitShares * bestExitPrice
    const bestGross = isLong ? bestExitValue - entryValue : entryValue - bestExitValue
    const bestNet = bestGross - t.total_fees

    const delta = bestNet - t.net_pnl
    if (delta <= 0) continue // best exit was the only one, or no better than actual

    // The gap as a 0..1 fraction of the best exit price — the % form of `delta`.
    // Math.abs is deliberate: best_exit_price is the FAVORABLE extreme (max for a
    // long, MIN for a short), so (best − avg) is positive for longs but negative
    // for shorts. `delta` above is already sign-normalized to ≥ 0; mirroring it
    // with Math.abs keeps the $ and % columns consistent and the % positive for
    // both sides (Dave's literal (best − avg)/best would go negative on shorts).
    // best_exit_price is structurally > 0 when delta > 0; if it were 0 the
    // fraction is non-finite and the formatter renders "—" — never a fake 0.
    const pctLeftOnTable = Math.abs(bestExitPrice - actualAvgExit) / bestExitPrice

    out.push({
      trade_id: t.id,
      date: t.date,
      symbol: t.symbol,
      side: t.side,
      exit_count: exits.length,
      actual_avg_exit: actualAvgExit,
      best_exit_price: bestExitPrice,
      actual_net_pnl: t.net_pnl,
      best_exit_net_pnl: bestNet,
      delta,
      pct_left_on_table: pctLeftOnTable,
    })
  }

  out.sort((a, b) => b.delta - a.delta)
  return out
}
