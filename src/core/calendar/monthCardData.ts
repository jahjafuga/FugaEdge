// Turn the month the calendar is CURRENTLY SHOWING into the share card's input.
//
// Pure by design and not merely by habit. The one thing this feature can get
// wrong in a way nobody notices is exporting a different month from the one on
// screen — a card that is correct in every detail except which month it is.
// Keeping the mapping pure means the test can hand it July and assert July,
// with no clock, no fetch and no component in the way.
//
// NOTHING IS DERIVED THAT THE APP DOES NOT ALREADY KNOW:
//   • the days are CalendarMonth.days, the same rows the grid draws
//   • the total is stats.net_pnl, the same number the header prints
//   • the ending streak is computeStreak — the function the weekly panel uses,
//     called with the month's own day map so the run cannot reach outside it
//   • the percentage denominator is contributed capital, the same one the
//     Compare growth row divides by, WITH its reason carried through so the
//     card can say why a percentage is missing instead of drawing a dash
//   • win rate and P&L ratio are the grid cell's own derivations
//     (CalendarGrid.tsx), which match winLossRatio in
//     src/core/performance/metrics.ts -- every field already came back from the
//     calendar query, so nothing here widened it
// A share card that disagrees with the app that produced it is worse than no
// share card, so there is no second arithmetic anywhere in here.

import { computeStreak } from '@/core/analytics/week'
import type {
  CalendarCardData,
  CalendarCardDay,
  CalendarCardFormat,
  CalendarCardUnit,
  CalendarCardWeek,
  DenominatorState,
} from '@/lib/calendarCard'
import { isTraded, longestGreenRun, scopeWeeksToMonth } from '@/lib/calendarCard'
import type { CalendarDay, CalendarMonth, WeeklySummary } from '@shared/calendar-types'
import type { ContributedCapital } from '@/lib/useContributedCapital'

/** The one list of month names. CalendarHeader imports it too — it renders the
 *  month and the year in differently-styled spans so it cannot use the joined
 *  label, but there is no reason for it to carry a second copy of the names. */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "July 2026". The header's own wording, so the card is titled the way the
 *  screen it came from is titled. */
export function monthLabelOf(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

/** P&L as a percentage of contributed capital, or null when it must not compute.
 *
 *  FAIL-HONEST, matching useContributedCapital's own rule: no anchor and a
 *  non-positive denominator both resolve to null, never to Infinity, NaN or a
 *  fabricated zero. A null reaches the card as an em dash (or, in streamer
 *  mode, as the withheld mark) — the card says "not known", which is true. */
export function pctOf(pnl: number, contributed: number | null): number | null {
  if (contributed == null || !Number.isFinite(contributed) || contributed <= 0) return null
  if (!Number.isFinite(pnl)) return null
  return (pnl / contributed) * 100
}

/** Per-day win rate over DECIDED trades. Null when nothing was decided, so the
 *  cell omits the line rather than printing 0%. Identical to CalendarGrid's. */
export function dayWinRate(d: Pick<CalendarDay, 'winners' | 'losers'>): number | null {
  const decided = d.winners + d.losers
  return decided > 0 ? d.winners / decided : null
}

/** Per-day P&L ratio = avg winner / |avg loser|. Null when there were no
 *  winners, no losers, or avg_loser is 0 -- never a fabricated number. Identical
 *  to CalendarGrid's, which matches winLossRatio in metrics.ts. */
export function dayPlRatio(
  d: { avg_winner: number | null; avg_loser: number | null },
): number | null {
  const w = d.avg_winner
  const l = d.avg_loser
  return w != null && l != null && l !== 0 ? w / Math.abs(l) : null
}

/** WeeklySummary -> the card's week, field for field. Nothing is derived here
 *  except plRatio, and that is the grid cell's own derivation applied to the
 *  week's own averages -- exactly what WeeklyPanel does with the same two
 *  columns. The rail is a PORT, so it must not acquire arithmetic the panel
 *  does not have. */
export function weekOf(w: WeeklySummary, contributed: number | null): CalendarCardWeek {
  return {
    weekStart: w.week_start,
    weekEnd: w.week_end,
    inMonth: w.in_month,
    tradeCount: w.trade_count,
    netPnl: w.net_pnl,
    netPct: pctOf(w.net_pnl, contributed),
    totalFees: w.total_fees,
    winners: w.winners,
    losers: w.losers,
    winRate: w.win_rate,
    plRatio: dayPlRatio(w),
    feesPct: pctOf(w.total_fees, contributed),
    daysTraded: w.days_traded,
    daysJournaled: w.days_journaled,
    streak: w.streak,
    topMistake: w.top_mistake,
  }
}

/** How the hook's answer reaches the card. `null` is the window BEFORE the read
 *  resolves, which is not the same fact as "there is no anchor" -- a card
 *  composed in that window must say the denominator is unknown rather than
 *  claiming the trader never set a balance. */
export function denominatorStateOf(capital: ContributedCapital | null): DenominatorState {
  if (capital == null) return 'unknown'
  return capital.reason
}

/**
 * Build the card's input from the displayed month.
 *
 * `month` is the CalendarMonth in state — whatever the user navigated to. There
 * is deliberately no year/month parameter and no default: the only month this
 * can produce is the one it was handed.
 */
export function buildMonthCardData(
  month: CalendarMonth,
  unit: CalendarCardUnit,
  capital: ContributedCapital | null,
): CalendarCardData {
  const { year, month: m } = month.stats
  const contributed = capital?.contributed ?? null

  // EVERY day the calendar knows about, traded or merely touched. The card needs
  // both -- a journalled Sunday is not a trading day, but it is also not a day
  // nobody was there for, and the two must not draw the same.
  const days: CalendarCardDay[] = month.days.map((d) => ({
    date: d.date,
    pnl: d.net_pnl,
    pct: pctOf(d.net_pnl, contributed),
    tradeCount: d.trade_count,
    winners: d.winners,
    losers: d.losers,
    winRate: dayWinRate(d),
    plRatio: dayPlRatio(d),
    noTrade: d.no_trade_day,
    holiday: d.is_holiday,
    hasJournal: d.has_journal,
    tags: d.day_tags,
    fees: d.total_fees,
  }))

  // The run in progress at the month's end. computeStreak walks BACKWARD from
  // the anchor over the map it is given, so passing only this month's days
  // bounds the run to the month — which is what a month card should claim. The
  // anchor is the last day the month actually traded, not its 31st: walking
  // back from an untraded date would still find the same run, but the anchor
  // reads as a lie in a debugger and the map has the real one to hand.
  //
  // TRADING DAYS ONLY. A zero-P&L journalled day dropped into computeStreak's
  // map reads as a scratch and ends any run it lands after -- so a month that
  // finished green would report "none" because the trader wrote a note on the
  // Sunday. The grid's predicate is the right one here too.
  const traded = days.filter(isTraded)
  const dailyPnl = new Map(traded.map((d) => [d.date, d.pnl]))
  const lastTraded = traded.reduce<string | null>(
    (acc, d) => (acc == null || d.date > acc ? d.date : acc),
    null,
  )
  const currentStreak =
    lastTraded == null
      ? ({ kind: 'none', days: 0 } as const)
      : computeStreak(lastTraded, dailyPnl)

  return {
    monthLabel: monthLabelOf(year, m),
    year,
    month: m,
    days,
    // THE RAIL BELONGS TO THE MONTH. A week whose trades all happened in the
    // previous month is not this month's week; one that straddles with trades on
    // both sides is re-totalled to ours. See scopeWeeksToMonth.
    weeks: scopeWeeksToMonth(month.weeks.map((w) => weekOf(w, contributed)), days),
    monthPnl: month.stats.net_pnl,
    monthPct: pctOf(month.stats.net_pnl, contributed),
    monthFees: month.stats.total_fees,
    monthFeesPct: pctOf(month.stats.total_fees, contributed),
    tradeCount: month.stats.trade_count,
    monthWinners: month.stats.winners,
    monthLosers: month.stats.losers,
    longestGreenRun: longestGreenRun(days),
    currentStreak,
    unit,
    denominator: denominatorStateOf(capital),
  }
}

/** The saved file's name. Carries the month so a folder of these sorts itself,
 *  and the format so four exports of one month do not overwrite each other in
 *  the save dialog. Carries NO account name — the same rule the card's own
 *  header follows, applied to the one piece of text that survives outside the
 *  image. */
export function cardFileName(
  year: number,
  month: number,
  format: CalendarCardFormat = 'wide',
): string {
  return `fugaedge-calendar-${year}-${String(month).padStart(2, '0')}-${format}.png`
}
