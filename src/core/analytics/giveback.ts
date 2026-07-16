import type { GivebackStats } from '@shared/analytics-types'

// "Gave back profits" rollup (djsevans87) — the goal-TRIGGERED sibling of
// computeRuleBreaks. PURE: zero electron / DB / DOM imports, per ARCHITECTURE.
// getAnalytics orders each day's CLOSED trades by close_time, groups them by
// date, pre-fetches the profit_target_history rows (sorted), and calls this;
// the pure fn trusts the input order (like the rest of src/core).
//
// Goal-TRIGGERED definition (founder-locked):
//   For each day's ordered closed trades, walk running cumulative net P&L. Find
//   the FIRST index where cumulative >= target (the goal-crossing). peak = the
//   highest cumulative from that index onward; final = the last cumulative.
//   giveback = peak − final; pct_off_top = giveback / peak. A day counts ONLY
//   when it crossed the goal AND giveback > 0 (it actually surrendered some).
//   peak >= target > 0 on a counted day, so pct_off_top never divides by zero.
//
//   Dave #9 (schema 48): `target` is now POINT-IN-TIME — each day evaluates
//   against the goal in force THAT day, resolved from the append-only
//   profit_target_history (epoch seed = the value at upgrade time, so existing
//   history computes identically to the old current-value read; correctness
//   accrues forward as changes are recorded). A day whose resolved target <= 0
//   had no goal and is skipped; goal_set is false only when NO history value
//   was ever > 0 (the card's "set a goal" empty state) — a goal set in the past
//   and later zeroed keeps its counted days, never a retroactive erasure.

/** One append-only history row. effective_from is ISO-8601 UTC with a Z —
 *  lexicographic compare is chronological. Rows arrive sorted ascending
 *  (effective_from, then append order). */
export interface TargetHistoryPoint {
  effective_from: string
  value: number
}

/** The seed row's effective_from — sorts before any real save stamp, so every
 *  day resolves (no null path for the profit target). */
export const EPOCH_EFFECTIVE_FROM = '1970-01-01T00:00:00.000Z'

/**
 * Point-in-time resolution: for each date (YYYY-MM-DD), the most recent history
 * value with effective_from <= that day's end. MID-DAY RULE: a change stamped
 * any time during day D applies to day D — the boundary is `${D}T23:59:59.999Z`,
 * same fixed-width ISO-Z format, so lexicographic <= is chronological. Dates
 * are sorted internally and history is pointer-walked once (O(D log D + H));
 * input date order doesn't matter. Days before the first history row resolve 0
 * (no goal) — unreachable for profit targets under the epoch seed.
 */
export function resolveDailyTargets(
  dates: readonly string[],
  history: readonly TargetHistoryPoint[],
): Map<string, number> {
  const sortedDates = [...dates].sort()
  const out = new Map<string, number>()
  let i = 0
  let current = 0
  for (const date of sortedDates) {
    const dayEnd = `${date}T23:59:59.999Z`
    while (i < history.length && history[i].effective_from <= dayEnd) {
      current = history[i].value
      i++
    }
    out.set(date, current)
  }
  return out
}

export function computeGiveback(
  tradesByDate: Map<string, { net_pnl: number }[]>,
  targetHistory: readonly TargetHistoryPoint[],
): GivebackStats {
  // Never any goal on record → the "set a goal" empty state. (With a goal on
  // record, per-day resolution below decides which days can count.)
  if (!targetHistory.some((p) => Number.isFinite(p.value) && p.value > 0)) {
    return { days: 0, total_giveback: 0, avg_pct_off_top: null, goal_set: false }
  }

  const targets = resolveDailyTargets([...tradesByDate.keys()], targetHistory)

  let days = 0
  let totalGiveback = 0
  let sumPctOffTop = 0

  for (const [date, trades] of tradesByDate) {
    const target = targets.get(date) ?? 0
    // No goal in force that day (target unset/zeroed) — the day can't cross.
    if (!Number.isFinite(target) || target <= 0) continue

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
