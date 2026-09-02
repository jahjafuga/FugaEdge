import type { RuleBreaksWording } from '@shared/period-wording'

// The MONTH's words. Every field is the week's string with its noun changed
// and nothing else.
export const MONTH_RULE_BREAKS_WORDING: RuleBreaksWording = {
  tabLabel: 'Rule Breaks',
  title: 'Rules broken this month',
  subtitle: 'Tagged per day, so a day counts once no matter how many rules it broke.',
  empty: 'No rules broken this month.',
  headlineLabel: 'Days with a rule broken',
  netLabel: 'Their net P&L',
  cleanLabel: 'Clean days',
  tableCaption: 'Per rule, worst P&L impact first',
  footnote:
    'A day can break more than one rule, so it appears in a row for each one. The totals above count each day once, so a day that broke two rules sits in two rows but is counted once above.',
}
