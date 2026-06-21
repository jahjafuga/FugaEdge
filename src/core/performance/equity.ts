// Shared equity-curve + drawdown utilities. Both the Analytics and Reports
// modules call into here so the numbers can't drift.
//
// Pure module (no electron/fs/sqlite imports) so it runs in the renderer too —
// the per-period Compare feature needs the equity curve for K-Ratio. Moved here
// from electron/lib/equity.ts (which now re-exports this) without changing any
// logic.

export interface EquityPoint {
  date: string                  // YYYY-MM-DD
  daily_pnl: number             // sum of net_pnl on this date
  cumulative: number            // running total through this date inclusive
}

export interface DrawdownEquityPoint extends EquityPoint {
  in_drawdown: boolean          // true when this point is below the running peak
}

export interface DrawdownInfo {
  amount: number                // peak - trough in $
  percent: number | null        // amount / peak; null when peak <= 0
  peak_date: string
  peak_value: number
  trough_date: string
  trough_value: number
  recovered: boolean
  recovery_date: string | null
  longest_period_days: number   // longest consecutive run of in_drawdown==true
  current_drawdown: number      // peak_so_far - last_point.cumulative (always ≥ 0)
  equity: DrawdownEquityPoint[]
}

interface TradeForEquity {
  date: string
  net_pnl: number
}

export function buildEquityCurve(trades: TradeForEquity[]): EquityPoint[] {
  const byDate = new Map<string, number>()
  for (const t of trades) {
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.net_pnl)
  }
  const dates = Array.from(byDate.keys()).sort()
  let cum = 0
  return dates.map((d) => {
    const daily = byDate.get(d) ?? 0
    cum += daily
    return { date: d, daily_pnl: daily, cumulative: cum }
  })
}

export function computeDrawdown(points: EquityPoint[]): DrawdownInfo | null {
  if (points.length === 0) return null

  let peakValue = points[0].cumulative
  let peakDate = points[0].date
  let maxAmount = 0
  let ddPeakValue = peakValue
  let ddPeakDate = peakDate
  let ddTroughValue = peakValue
  let ddTroughDate = peakDate

  // Walk the curve, also annotate per-point in_drawdown so the UI can shade
  // segments. Track longest consecutive in-drawdown run in days (= points).
  let runningPeak = points[0].cumulative
  let currentRun = 0
  let longestRun = 0
  const equity: DrawdownEquityPoint[] = []

  for (const p of points) {
    if (p.cumulative > peakValue) {
      peakValue = p.cumulative
      peakDate = p.date
    }
    const draw = peakValue - p.cumulative
    if (draw > maxAmount) {
      maxAmount = draw
      ddPeakValue = peakValue
      ddPeakDate = peakDate
      ddTroughValue = p.cumulative
      ddTroughDate = p.date
    }

    if (p.cumulative > runningPeak) runningPeak = p.cumulative
    const inDd = p.cumulative < runningPeak
    if (inDd) {
      currentRun += 1
      if (currentRun > longestRun) longestRun = currentRun
    } else {
      currentRun = 0
    }
    equity.push({ ...p, in_drawdown: inDd })
  }

  if (maxAmount <= 0) {
    // No drawdown at all — equity curve only goes up (or only one point).
    // Surface a degenerate DrawdownInfo so the UI can still render zeros.
    const last = points[points.length - 1]
    return {
      amount: 0,
      percent: null,
      peak_date: last.date,
      peak_value: last.cumulative,
      trough_date: last.date,
      trough_value: last.cumulative,
      recovered: true,
      recovery_date: last.date,
      longest_period_days: 0,
      current_drawdown: 0,
      equity,
    }
  }

  // Recovery: first date after the trough where cumulative >= the pre-drawdown peak.
  let recoveryDate: string | null = null
  for (const p of points) {
    if (p.date <= ddTroughDate) continue
    if (p.cumulative >= ddPeakValue) {
      recoveryDate = p.date
      break
    }
  }

  const last = points[points.length - 1]
  const currentDrawdown = Math.max(0, runningPeak - last.cumulative)

  return {
    amount: maxAmount,
    percent: ddPeakValue > 0 ? maxAmount / ddPeakValue : null,
    peak_date: ddPeakDate,
    peak_value: ddPeakValue,
    trough_date: ddTroughDate,
    trough_value: ddTroughValue,
    recovered: recoveryDate != null,
    recovery_date: recoveryDate,
    longest_period_days: longestRun,
    current_drawdown: currentDrawdown,
    equity,
  }
}
