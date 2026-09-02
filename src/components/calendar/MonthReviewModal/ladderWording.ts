import type { LadderWording } from '@shared/period-wording'

// THE MONTH'S WORDS FOR ITS WEEKS LADDER. Nothing here is typed inside the tab
// -- the tab renders what it is handed, the same contract the other six follow
// through PeriodWording.
export const MONTH_LADDER_WORDING: LadderWording = {
  tabLabel: 'Weeks',
  title: 'The weeks in this month',
  subtitle:
    'Each row is the part of that week inside the month, so the rows add up to the month. Click a row to open the whole week.',
  empty: 'This month contains no weeks.',
}
