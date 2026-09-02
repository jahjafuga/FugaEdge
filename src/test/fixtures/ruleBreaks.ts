import type { RuleBreaksAnalytics } from '@shared/analytics-types'

/** THE EMPTY ROLLUP -- what a window with no rule breaks in it produces.
 *
 *  Zero counts, an empty row list, and NULL rates: a rate of zero would be a
 *  claim ("you were green on none of your flawed days"), where null is the
 *  absence of one. computeRuleBreaks returns exactly this shape for empty
 *  inputs, so a fixture using it is using the real thing and not a guess.
 *
 *  Test fixtures reach for this rather than spelling out seven fields each
 *  time -- and because a field added to RuleBreaksAnalytics later should
 *  break ONE file, not every drawer test in the repo. */
export const EMPTY_RULE_BREAKS: RuleBreaksAnalytics = {
  byRuleBreak: [],
  days_with_any_break: 0,
  clean_days: 0,
  flawed_day_net_pnl: 0,
  clean_day_net_pnl: 0,
  flawed_green_rate: null,
  clean_green_rate: null,
}
