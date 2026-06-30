import type { GivebackStats } from '@shared/analytics-types'

// "Gave back profits" rollup (djsevans87) — the goal-TRIGGERED sibling of
// computeRuleBreaks. PURE: zero electron / DB / DOM imports, per ARCHITECTURE.
// getAnalytics orders each day's CLOSED trades by close_time, groups them by
// date, reads the daily_profit_target setting, and calls this; the pure fn
// trusts the input order (like the rest of src/core).
//
// Goal-TRIGGERED definition (founder-locked):
//   For each day's ordered closed trades, walk running cumulative net P&L. Find
//   the FIRST index where cumulative >= target (the goal-crossing). peak = the
//   highest cumulative from that index onward; final = the last cumulative.
//   giveback = peak − final; pct_off_top = giveback / peak. A day counts ONLY
//   when it crossed the goal AND giveback > 0 (it actually surrendered some).
//   peak >= target > 0 on a counted day, so pct_off_top never divides by zero.
//
//   target <= 0 means no daily goal is set — the feature is N/A; goal_set:false
//   drives the card's "set a goal" empty state.

export function computeGiveback(
  tradesByDate: Map<string, { net_pnl: number }[]>,
  target: number,
): GivebackStats {
  if (!Number.isFinite(target) || target <= 0) {
    return { days: 0, total_giveback: 0, avg_pct_off_top: null, goal_set: false }
  }

  let days = 0
  let totalGiveback = 0
  let sumPctOffTop = 0

  for (const trades of tradesByDate.values()) {
    let running = 0
    let crossed = false
    let peakAfterCross = 0

    for (const t of trades) {
      running += t.net_pnl
      if (!crossed) {
        // The crossing trade seeds the post-cross peak with its own cumulative.
        if (running >= target) {
          crossed = true
          peakAfterCross = running
        }
      } else if (running > peakAfterCross) {
        peakAfterCross = running
      }
    }

    if (!crossed) continue
    const giveback = peakAfterCross - running // running is now the day's final
    if (giveback <= 0) continue // hit the goal but rode it to the close — not a giveback

    days += 1
    totalGiveback += giveback
    sumPctOffTop += giveback / peakAfterCross
  }

  return {
    days,
    total_giveback: totalGiveback,
    avg_pct_off_top: days > 0 ? sumPctOffTop / days : null,
    goal_set: true,
  }
}
