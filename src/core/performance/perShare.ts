// v0.2.7 — THE per-share basis. One definition, reused everywhere.
//
// PURE per ARCHITECTURE #1: no electron / fs / sqlite / React imports.
//
// This is not a new metric. fullStats has divided net P&L by the summed POSITION size
// since the per-share family shipped, and Compare surfaces five figures on that basis
// (avg_per_share_pnl, the gain/loss means, the win/loss extremes). Extracting it here
// so the tier table can reuse it is the whole point: a second, side-aware denominator
// would have agreed on every fully-closed round trip and drifted apart precisely on
// the partial and flipped ones — the worst kind of disagreement, because it hides
// until the edge case that matters.
//
// POSITION SIZE is max(bought, sold), NOT the sum. The sum counts both legs and
// answers a different question — how many shares changed hands — which is what the
// volume stats want. Per-share P&L wants the size of the position that produced it.

interface TradeShares {
  shares_bought: number
  shares_sold: number
}

/** The size of the position a trade actually carried: one leg, not both. On a
 *  fully-closed trip the legs are equal; on a partial the larger leg is the size that
 *  was held. */
export function positionShares(t: TradeShares): number {
  return Math.max(t.shares_bought, t.shares_sold)
}

/** Net P&L per share held, over a set of trades. NULL — never NaN, never Infinity —
 *  when the set holds no shares at all, so a caller renders an em dash rather than
 *  nonsense.
 *
 *  AGGREGATE, not an average of averages: the totals are summed first and divided
 *  once. Averaging per-trade figures would weight a ten-share scalp equally with a
 *  thousand-share position, which is a different (and wrong) number. */
export function netPerShare(trades: readonly (TradeShares & { net_pnl: number })[]): number | null {
  let net = 0
  let shares = 0
  for (const t of trades) {
    net += t.net_pnl
    shares += positionShares(t)
  }
  return shares > 0 ? net / shares : null
}
