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
}

export interface RiskBreakdown {
  risk_per_share: number | null
  total_risk: number | null
  r_multiple: number | null
}

function entryPrice(p: RiskParams): number {
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
