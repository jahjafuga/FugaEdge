import type { RuleBreaksAnalytics, RuleBreakImpact } from '@shared/analytics-types'

// Phase 3 (djsevans87) — the PER-DAY rule-break rollup, the day-level sibling of
// computeMistakes (which is per-trade). PURE: zero electron / DB / DOM imports,
// per ARCHITECTURE — unlike the legacy computeMistakes, which sits inside
// electron/analytics/get.ts. getAnalytics builds the two maps (from the journal
// rule_breaks rows + the existing per-date equity) and calls this.
//
// Inputs:
//   ruleBreaksByDate — date -> the rule-breaks tagged on that day. We dedup per
//                      day defensively so a malformed duplicate can't double-count
//                      a label for one day.
//   netPnlByDate     — date -> that day's net P&L (computeEquity's daily_pnl).
//
// Universe of days = trading days (netPnlByDate keys) ∪ broke-a-rule days
// (ruleBreaksByDate keys with a non-empty set). A day's net defaults to 0 when it
// has breaks but no trades (a no-trade day on which a rule was still broken).
//
// A day is FLAWED when it has >= 1 break, else CLEAN. A day with N breaks counts
// toward N labels' day_count, but is ONE day in the clean-vs-flawed split.
// green_day_rate = days net>0 / day_count. Empty -> [] + null rates (never 0/NaN).
export function computeRuleBreaks(
  ruleBreaksByDate: Map<string, string[]>,
  netPnlByDate: Map<string, number>,
): RuleBreaksAnalytics {
  const perLabel = new Map<
    string,
    { label: string; day_count: number; net: number; green: number }
  >()

  let flawedDays = 0
  let cleanDays = 0
  let flawedNet = 0
  let cleanNet = 0
  let flawedGreen = 0
  let cleanGreen = 0

  // Every date that has trades OR a logged rule-break.
  const dates = new Set<string>([
    ...netPnlByDate.keys(),
    ...ruleBreaksByDate.keys(),
  ])

  for (const date of dates) {
    // Dedup per day so a day contributes ONCE to each label's day_count; drop
    // any blank entry defensively.
    const breaks = Array.from(new Set((ruleBreaksByDate.get(date) ?? []).filter(Boolean)))
    const net = netPnlByDate.get(date) ?? 0
    const isGreen = net > 0

    if (breaks.length > 0) {
      flawedDays += 1
      flawedNet += net
      if (isGreen) flawedGreen += 1
      for (const label of breaks) {
        let entry = perLabel.get(label)
        if (!entry) {
          entry = { label, day_count: 0, net: 0, green: 0 }
          perLabel.set(label, entry)
        }
        entry.day_count += 1
        entry.net += net
        if (isGreen) entry.green += 1
      }
    } else {
      cleanDays += 1
      cleanNet += net
      if (isGreen) cleanGreen += 1
    }
  }

  const byRuleBreak: RuleBreakImpact[] = Array.from(perLabel.values()).map((e) => ({
    label: e.label,
    day_count: e.day_count,
    net_pnl: e.net,
    avg_pnl_per_day: e.day_count > 0 ? e.net / e.day_count : null,
    green_day_rate: e.day_count > 0 ? e.green / e.day_count : null,
  }))
  // Worst net impact first — the rule-break costing you the most sits on top.
  byRuleBreak.sort((a, b) => a.net_pnl - b.net_pnl)

  return {
    byRuleBreak,
    days_with_any_break: flawedDays,
    clean_days: cleanDays,
    flawed_day_net_pnl: flawedNet,
    clean_day_net_pnl: cleanNet,
    flawed_green_rate: flawedDays > 0 ? flawedGreen / flawedDays : null,
    clean_green_rate: cleanDays > 0 ? cleanGreen / cleanDays : null,
  }
}
