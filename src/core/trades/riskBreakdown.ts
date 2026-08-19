// R-multiple and the risk breakdown behind it.
//
// PURE per ARCHITECTURE #1: zero electron / fs / sqlite / React imports. It lived
// in electron/lib, which put arithmetic every screen depends on outside the core
// test lane — nothing in the 400-file suite could reach it, and the divergence
// between how a stop is DERIVED and how its risk is MEASURED went unnoticed
// because of it. Moved verbatim: this commit changes no behaviour, and the tests
// beside it characterise what that behaviour currently is.
//
// Shared R-multiple computation. Two inputs:
//   * planned_stop_loss_price (new): a price; risk_per_share = |entry - stop|;
//     total_risk = risk_per_share × max(shares_bought, shares_sold); R is
//     net_pnl / total_risk.
//   * planned_risk (legacy): a dollar amount; R = net_pnl / planned_risk.
// The price path wins when set. Null returns mean "no risk defined".
export function computeRMultiple(
  netPnl: number,
  plannedRisk: number | null | undefined,
): number | null {
  if (plannedRisk == null) return null
  if (!Number.isFinite(plannedRisk) || plannedRisk <= 0) return null
  return netPnl / plannedRisk
}

export interface RiskParams {
  side: 'long' | 'short'
  avg_buy_price: number
  avg_sell_price: number
  shares_bought: number
  shares_sold: number
  planned_risk: number | null
  planned_stop_loss_price: number | null
  /** WHO set the stop. 'auto' means the app derived it from the FIRST entry, so
   *  that is the price its risk has to be measured against. Without this the two
   *  halves disagree: a stop derived three percent off the first fill was reported
   *  as a fourteen percent risk because the reading came off the average. */
  stop_source: 'manual' | 'auto' | null
  /** The first entry-side fill's price — the number a derived stop was derived
   *  FROM. Null when the trade has no entry fills, which is the only case where a
   *  derived stop cannot be measured honestly. */
  first_entry_price: number | null
}

/** The first entry-side fill's price for a trade, or null when it has none.
 *  Exported so every caller of computeRiskBreakdown derives it the same way
 *  rather than each writing its own idea of "first". */
export function firstEntryPriceOf(
  side: 'long' | 'short',
  executions: readonly { side: 'B' | 'S'; price: number; time: string }[] | null | undefined,
): number | null {
  if (!executions || executions.length === 0) return null
  const want: 'B' | 'S' = side === 'long' ? 'B' : 'S'
  let best: { price: number; time: string } | null = null
  for (const f of executions) {
    if (f.side !== want) continue
    // Fill times are ISO-8601 UTC, so a lexical compare sorts chronologically —
    // the same rule computeExecutionStats uses for its bookends.
    if (best === null || f.time < best.time) best = { price: f.price, time: f.time }
  }
  return best ? best.price : null
}

export interface RiskBreakdown {
  risk_per_share: number | null
  total_risk: number | null
  r_multiple: number | null
}

/** The price a stop's risk is measured against.
 *
 *  A DERIVED stop is measured from the first entry, because that is the price it
 *  was derived from — measuring it against anything else reports a risk the user
 *  never chose. A TYPED stop keeps the average, which is the reading it has always
 *  had and the one the trader was looking at when they typed the number.
 *
 *  A derived stop with no first entry falls back to the average rather than
 *  guessing. It cannot happen through the auto-fill, which refuses to derive a
 *  stop without a first entry at all, but the column is nullable and a fallback
 *  that reports something measurable beats one that reports nothing. */
function entryPrice(p: RiskParams): number {
  if (
    p.stop_source === 'auto' &&
    p.first_entry_price != null &&
    Number.isFinite(p.first_entry_price) &&
    p.first_entry_price > 0
  ) {
    return p.first_entry_price
  }
  if (p.side === 'short') return p.avg_sell_price || p.avg_buy_price
  return p.avg_buy_price || p.avg_sell_price
}

export function computeRiskBreakdown(
  netPnl: number,
  params: RiskParams,
): RiskBreakdown {
  if (params.planned_stop_loss_price != null && params.planned_stop_loss_price > 0) {
    const entry = entryPrice(params)
    if (Number.isFinite(entry) && entry > 0) {
      const riskPerShare = Math.abs(entry - params.planned_stop_loss_price)
      const shares = Math.max(params.shares_bought, params.shares_sold)
      if (riskPerShare > 0 && shares > 0) {
        const totalRisk = riskPerShare * shares
        return {
          risk_per_share: riskPerShare,
          total_risk: totalRisk,
          r_multiple: netPnl / totalRisk,
        }
      }
    }
  }
  const legacyR = computeRMultiple(netPnl, params.planned_risk)
  return {
    risk_per_share: null,
    total_risk: params.planned_risk != null && params.planned_risk > 0
      ? params.planned_risk
      : null,
    r_multiple: legacyR,
  }
}
