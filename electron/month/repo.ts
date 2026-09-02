import { getPeriodDetail } from '../week/repo'
import { monthWindow } from '@/core/calendar/monthWindow'
import { monthWeekRows } from '@/core/calendar/monthWeeks'
import type { AccountScope } from '@shared/accounts-types'
import type { MonthDetail } from '@shared/week-types'
import { getMonthNotes } from './notes'

// THE MONTH IS ONE WINDOW OF THE BOOK, and getPeriodDetail (beat 260) is that
// window. This module adds exactly one thing: turning 'YYYY-MM' into the pair
// of dates it takes.
//
// WHY THERE IS NO MonthDetail TYPE. The week needed its own shape because it
// carries a note keyed on its Sunday (week_notes) and a pair of week-named
// labels. A month has neither yet -- month_notes is a later beat -- so its
// detail IS a PeriodDetail, from and to and nothing invented. When the note
// arrives it will compose one by hand exactly as getWeekDetail does, rather
// than extending this.
//
// THE WINDOW IS CALENDAR DAYS, from src/core/calendar/monthWindow.ts. The
// renderer builds its title and its arrow population from the same function,
// so the id the drawer shows and the days it sums cannot drift.
export function getMonthDetail(
  monthId: string,
  opts?: { accountScope?: AccountScope },
): MonthDetail {
  const { from, to } = monthWindow(monthId)
  const period = getPeriodDetail(from, to, opts)

  // The note is GLOBAL -- unscoped, exactly as the week note is: a
  // reflection is the trader's, not an account's.
  return {
    from: period.from,
    to: period.to,
    metrics: period.metrics,
    trades: period.trades,
    entries: period.entries,
    ruleBreaks: period.ruleBreaks,
    notes: getMonthNotes(monthId),
    // THE LADDER RIDES THIS CALL, not a channel of its own. The rows are
    // getPeriodDetail on narrower windows with THE SAME opts, so the
    // topline and the rows can never be scoped differently -- which two
    // independent fetches, either side of an account switch, could be.
    // The price is measured: 3.6ms -> 9.6ms, 18 queries instead of 3.
    ladder: monthWeekRows(monthId).map((r) => {
      const w = getPeriodDetail(r.from, r.to, opts)
      return {
        ...r,
        tradeCount: w.trades.length,
        netPnl: w.metrics.netPnl,
        tradingDays: w.metrics.tradingDays,
        winRate: w.metrics.winRate,
      }
    }),
  }
}
