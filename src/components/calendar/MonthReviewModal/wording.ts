import type { PeriodWording } from '@shared/period-wording'

// THE MONTH'S OWN WORDS. Beat 261 lifted sixteen hardcoded strings out of five
// tabs into a prop; this is the second host to supply them, and the first one
// that says a different noun.
//
// EVERY FIELD IS THE WEEK'S STRING WITH ITS NOUN CHANGED AND NOTHING ELSE.
// Same punctuation, same em dashes, same curly apostrophe, same sentence
// shape. Where the week's line has no noun in it, the month's is identical --
// the point of the wording prop is the noun, not a rewrite.
//
// reviewTitle / reviewDone / reviewPrompt ARE FILLED IN BUT NOT RENDERED. The
// month has no monthly-review XP award yet, so MonthReviewModal passes
// showReview={false} and the Overview tab omits the card entirely. They are
// written now, in the month's voice, so the beat that wires the award changes
// one boolean and not this file.
export const MONTH_WORDING: PeriodWording = {
  reviewTitle: 'Monthly review',
  reviewDone: 'Logged for this month — monthly-review XP banked.',
  reviewPrompt: 'Mark this month reviewed to bank the monthly-review XP.',
  noTrades: 'No trades this month.',
  equitySubtitle: 'Cumulative net P&L across the month — steps at each trade close.',
  streakLabel: 'Streak into next month',
  profitFactorUndefined: 'No losing trades — profit factor is undefined (winning-only month).',
  noPlaybooks: 'No playbooks tagged this month.',
  dayByDaySubtitle: 'Which days carried the month.',
  mistakesSubtitle: 'Aggregated across the month’s trades.',
  patternsTitle: 'Patterns this month',
  patternsEmpty: 'No recurring topics yet — they’ll appear as you journal this month.',
  patternsSubtitle: 'Topics you wrote across this month’s entries — counts, not judgments.',
}
