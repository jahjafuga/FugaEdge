import type { DailyPnlPoint } from '@shared/dashboard-types'
import type { EquityPoint } from '@shared/analytics-types'

// Turn the dashboard's per-day P&L series into a cumulative (running-total)
// series for the dashboard's "Cumulative P&L" curve.
//
// WINDOW-RELATIVE: the running total starts at $0 at the first point of the
// given series, so each range (7D / 30D / …) shows P&L accumulated WITHIN that
// window — NOT the absolute all-time account equity (that's the Analytics tab's
// job, which computes its curve from trades). Because `daily` is already the
// range-filtered dashboard series, the range toggle drives this for free.
//
// Pure + cache-derived: `daily` comes from the daily_summary-backed
// readDailySeries. Defensive sort by ISO date (lexicographic == chronological)
// so the running total is correct even if the input isn't already ascending;
// the input array is not mutated.
export function toCumulativeEquity(daily: DailyPnlPoint[]): EquityPoint[] {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  let running = 0
  return sorted.map((d) => {
    running += d.net_pnl
    return {
      date: d.date,
      daily_pnl: d.net_pnl,
      cumulative_net_pnl: running,
    }
  })
}
