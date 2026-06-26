// Beat 4 — the NEW per-trade execution-quality derivations for the Trade Detail
// "Execution" panel: the entry/exit BOOKEND fills (first entry, last exit — the
// single fill prices/times, distinct from the volume-weighted averages) and the
// direction-aware price move between the average entry and exit.
//
// Pure module: ZERO electron / DB / React imports (sibling discipline like
// src/core/playbook/topUsedSecondaries.ts). Hold time, avg prices, and position
// size are read directly off the trade in the component — NOT recomputed here.

/** A single bookend fill — the price and timestamp of one execution. */
export interface Bookend {
  price: number
  /** ISO 8601 UTC with a Z suffix (same string the fills carry). */
  time: string
}

export interface ExecutionStats {
  /** Earliest entry-side fill (long → first BUY, short → first SELL). Null when
   *  the trade carries no entry-side fills (malformed row). */
  firstEntry: Bookend | null
  /** Latest exit-side fill (long → last SELL, short → last BUY). Null when the
   *  trade has no exit-side fills yet (still open). */
  lastExit: Bookend | null
  /** Direction-aware % move from average entry to average exit, signed so a
   *  WINNING trade is positive (long sold higher, short covered lower). Null
   *  when the relevant average price is zero / non-finite (divide-by-zero
   *  guard). */
  priceMovePct: number | null
  /** Volume-weighted average ENTRY price (avg_buy_price), or null when it is
   *  exactly 0 — the unfilled-side sentinel for a trade with no buys yet. */
  avgEntry: number | null
  /** Volume-weighted average EXIT price (avg_sell_price), or null when it is
   *  exactly 0 — the unfilled-side sentinel for an open trade with no sells. */
  avgExit: number | null
}

/** The minimal structural shape computeExecutionStats reads. A full
 *  TradeListRow satisfies it (RoundTripExecution carries extra fields the
 *  bookends ignore); tests pass bare objects. */
export interface ExecutionStatsInput {
  side: 'long' | 'short'
  executions: readonly { side: 'B' | 'S'; price: number; time: string }[]
  avg_buy_price: number
  avg_sell_price: number
}

function bookend(
  fills: readonly { side: 'B' | 'S'; price: number; time: string }[],
  wantSide: 'B' | 'S',
  pick: 'earliest' | 'latest',
): Bookend | null {
  let best: Bookend | null = null
  for (const f of fills) {
    if (f.side !== wantSide) continue
    // Fill times are ISO-8601 UTC, so a lexical string compare sorts
    // chronologically (mirrors computeTradeTechnicals.ts:306-311).
    if (
      best === null ||
      (pick === 'earliest' ? f.time < best.time : f.time > best.time)
    ) {
      best = { price: f.price, time: f.time }
    }
  }
  return best
}

export function computeExecutionStats(trade: ExecutionStatsInput): ExecutionStats {
  // Side-aware fill split (mirrors computeTradeTechnicals.ts:279): a long enters
  // by BUYING and exits by SELLING; a short is the inverse.
  const entrySide: 'B' | 'S' = trade.side === 'long' ? 'B' : 'S'
  const exitSide: 'B' | 'S' = entrySide === 'B' ? 'S' : 'B'

  const firstEntry = bookend(trade.executions, entrySide, 'earliest')
  const lastExit = bookend(trade.executions, exitSide, 'latest')

  // Direction-aware price move, signed so a winning trade reads positive.
  //   long:  (avg_sell - avg_buy) / avg_buy   — sold higher than bought = win.
  //   short: (avg_sell - avg_buy) / avg_sell  — sold higher than covered = win.
  // NOTE: the Beat 4 brief's literal short formula was
  // (avg_buy - avg_sell)/avg_sell, which yields a NEGATIVE value for a winning
  // short and contradicts its own "(covering lower = positive)" intent and the
  // pnlClass green/red tone the panel applies. Implemented to the stated intent;
  // flagged for confirmation.
  //
  // BOTH averages must be real for a move to exist: an OPEN trade stores the
  // unfilled side's avg as 0 (build-round-trips.ts:225-226), so guarding only
  // the denominator would emit a fabricated ±100% on open trades. Guard both
  // (finite, non-zero) so the panel honestly em-dashes Price Move until close.
  const { avg_buy_price: buy, avg_sell_price: sell } = trade
  const avgsValid =
    Number.isFinite(buy) && buy !== 0 && Number.isFinite(sell) && sell !== 0
  const base = trade.side === 'long' ? buy : sell
  const priceMovePct = avgsValid ? ((sell - buy) / base) * 100 : null

  // An avg of exactly 0 is the no-fills-that-side sentinel (build-round-trips.ts:
  // 225-226), so it em-dashes. CRITICAL: the test is `!== 0`, NEVER a threshold —
  // sub-$1 small-cap averages (e.g. 0.42) are legitimate and must render normally.
  const avgEntry = Number.isFinite(buy) && buy !== 0 ? buy : null
  const avgExit = Number.isFinite(sell) && sell !== 0 ? sell : null

  return { firstEntry, lastExit, priceMovePct, avgEntry, avgExit }
}

/**
 * Volume-weighted average price across ALL fills, regardless of side
 * (sum(qty·price) / sum(qty)) — the Fills timeline's OWN blended summary,
 * distinct from computeExecutionStats' per-side avgEntry / avgExit. Null when
 * there are no fills or the total quantity is 0 (divide-by-zero guard).
 */
export function blendedFillAvg(
  executions: readonly { qty: number; price: number }[],
): number | null {
  let notional = 0
  let qty = 0
  for (const f of executions) {
    notional += f.qty * f.price
    qty += f.qty
  }
  return qty > 0 ? notional / qty : null
}
