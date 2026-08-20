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
//     Compare growth row divides by
// A share card that disagrees with the app that produced it is worse than no
// share card, so there is no second arithmetic anywhere in here.

import { computeStreak } from '@/core/analytics/week'
import type { CalendarCardData, CalendarCardDay, CalendarCardUnit } from '@/lib/calendarCard'
import { longestGreenRun } from '@/lib/calendarCard'
import type { CalendarMonth } from '@shared/calendar-types'

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
  contributed: number | null,
): CalendarCardData {
  const { year, month: m } = month.stats

  const days: CalendarCardDay[] = month.days.map((d) => ({
    date: d.date,
    pnl: d.net_pnl,
    pct: pctOf(d.net_pnl, contributed),
    tradeCount: d.trade_count,
  }))

  // The run in progress at the month's end. computeStreak walks BACKWARD from
  // the anchor over the map it is given, so passing only this month's days
  // bounds the run to the month — which is what a month card should claim. The
  // anchor is the last day the month actually traded, not its 31st: walking
  // back from an untraded date would still find the same run, but the anchor
  // reads as a lie in a debugger and the map has the real one to hand.
  const dailyPnl = new Map(days.map((d) => [d.date, d.pnl]))
  const lastTraded = days.reduce<string | null>(
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
    monthPnl: month.stats.net_pnl,
    monthPct: pctOf(month.stats.net_pnl, contributed),
    longestGreenRun: longestGreenRun(days),
    currentStreak,
    unit,
  }
}

/** The saved file's name. Carries the month so a folder of these sorts itself,
 *  and carries NO account name — the same rule the card's own header follows,
 *  applied to the one piece of text that survives outside the image. */
export function cardFileName(year: number, month: number): string {
  return `fugaedge-calendar-${year}-${String(month).padStart(2, '0')}.png`
}
