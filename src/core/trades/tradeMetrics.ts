// v0.2.7 Feature 4 — the two per-trade figures the codebase did NOT already have.
//
// PURE per ARCHITECTURE #1: no electron / fs / sqlite / React imports.
//
// Everything else the new columns show is either delivered on TradeListRow
// (stop price, risk per share, total risk, R, RVOL, daily change, confidence,
// timeframe, days since catalyst, MAE, MFE) or already computed by
// src/core/trades/executionStats.ts (first entry, price move %). These two were the
// genuine gaps: hold time had a FORMATTER but no derivation — executionStats says
// outright that hold time is "read directly off the trade in the component" — and
// P&L gain % had neither.
//
// Both return null rather than a number they cannot justify. A zero here would be a
// lie: a trade with no close time has an unknown hold, not a zero-second one.

interface HoldTimeTrade {
  open_time: string
  close_time: string | null
}

/** Seconds held, or null when the trade is still open or either timestamp is
 *  unparseable. Never negative — a close before an open is corrupt data, not a
 *  negative duration. */
export function holdTimeSeconds(t: HoldTimeTrade): number | null {
  if (!t.close_time) return null
  const open = Date.parse(t.open_time)
  const close = Date.parse(t.close_time)
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null
  const seconds = (close - open) / 1000
  return seconds >= 0 ? seconds : null
}

interface GainPctTrade {
  side: 'long' | 'short'
  avg_buy_price: number
  avg_sell_price: number
  shares_bought: number
  shares_sold: number
  net_pnl: number
}

/** Net P&L as a percentage of the capital the position actually tied up:
 *  net / (entry price x position size). Signed, so a losing trade is negative.
 *
 *  DISTINCT from executionStats' priceMovePct, which measures how far the PRICE
 *  travelled. This measures what the trader made on the money committed, so fees
 *  drag it below the price move rather than tracking it.
 *
 *  Null when the entry price or the position size is zero — the unfilled-side
 *  sentinel — so it em-dashes instead of dividing by nothing. */
export function pnlGainPct(t: GainPctTrade): number | null {
  const entry = t.side === 'short' ? t.avg_sell_price : t.avg_buy_price
  const size = Math.max(t.shares_bought, t.shares_sold)
  const basis = entry * size
  if (!Number.isFinite(basis) || basis === 0) return null
  return (t.net_pnl / basis) * 100
}
