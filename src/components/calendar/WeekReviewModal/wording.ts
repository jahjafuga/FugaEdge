import type { PeriodWording } from '@shared/period-wording'

/** THE WEEK'S WORDS, in one place, byte-identical to what the five tabs said
 *  before the wording became a parameter.
 *
 *  Every string here was lifted verbatim from the tab that used to hold it;
 *  the field docs in shared/period-wording.ts name the old file and line for
 *  each. A month host would build its own object of this type and mount the
 *  same five tabs — which is the whole point — but no such host exists yet and
 *  no month wording is written anywhere.
 */
export const WEEK_WORDING: PeriodWording = {
  reviewTitle: 'Weekly review',
  reviewDone: 'Logged for this week — weekly-review XP banked.',
  reviewPrompt: 'Mark this week reviewed to bank the weekly-review XP.',
  noTrades: 'No trades this week.',
  equitySubtitle: 'Cumulative net P&L across the week — steps at each trade close.',
  streakLabel: 'Streak into next week',
  profitFactorUndefined: 'No losing trades — profit factor is undefined (winning-only week).',
  noPlaybooks: 'No playbooks tagged this week.',
  dayByDaySubtitle: 'Which days carried the week.',
  mistakesSubtitle: "Aggregated across the week's trades.",
  patternsTitle: 'Patterns this week',
  patternsEmpty: "No recurring topics yet — they'll appear as you journal this week.",
  patternsSubtitle: "Topics you wrote across this week's entries — counts, not judgments.",
}
