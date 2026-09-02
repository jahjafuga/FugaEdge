import { monthWindow, monthParts, type MonthId } from './monthWindow'

// THE WEEKS INSIDE A MONTH, CLIPPED TO IT.
//
// A row in the month's ladder has to know TWO things, and they are not the
// same thing:
//
//   what it SHOWS  -- the part of the week that lies inside the month. June
//                     2026 opens mid-week, so its first row is Monday the 1st
//                     to Saturday the 6th: six days, not seven. Summing the
//                     full weeks instead would count May 31 and July 1..4, and
//                     the rows would overshoot the month they sit in.
//   what it OPENS  -- the WHOLE week. A trader clicking the first row wants
//                     the week, not the fragment of it the month happened to
//                     contain; the weekly review is a week's review.
//
// Both live on every row, which is why this returns a shape rather than a pair
// of parallel arrays.
//
// WHY NOT gridWeekStarts. electron/calendar/weekly.ts:18 always returns SIX
// Sundays, because the calendar grid always draws six rows -- including one
// that can lie entirely outside the month (February 2026 starts on a Sunday
// and is 28 days long: rows five and six belong wholly to March). A ladder
// that rendered those would show weeks the month does not contain. This
// filters by overlap, so the row count is 4, 5 or 6 as the month actually
// falls.
//
// UTC THROUGHOUT, matching monthWindow: trades.date is a bare YYYY-MM-DD
// string compared as a string, and a local-time Date would shift the 1st of
// the month across a timezone boundary.

export interface MonthWeekRow {
  /** The FULL week's Sunday. What a row OPENS. */
  weekStart: string
  /** The FULL week's Saturday. */
  weekEnd: string
  /** Clipped start: max(weekStart, monthStart). What a row SHOWS. */
  from: string
  /** Clipped end: min(weekEnd, monthEnd). */
  to: string
  /** Calendar days in the clipped window, 1..7. */
  days: number
  /** True when the clip actually cut something off either end. */
  straddles: boolean
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n))

function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function addDays(s: string, n: number): string {
  const d = parseDay(s)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

/** Inclusive day count between two YYYY-MM-DD strings. */
function dayCount(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86400000) + 1
}

/**
 * The month's weeks, in calendar order, each clipped to the month and each
 * carrying the full week it came from.
 *
 * The rows PARTITION the month: their clipped day counts sum to the month's
 * day count exactly, with no gap and no overlap, because consecutive Sundays
 * are seven days apart and the clip only ever trims the first and last.
 */
export function monthWeekRows(monthId: MonthId): MonthWeekRow[] {
  const { from: monthStart, to: monthEnd } = monthWindow(monthId)
  const { year, month } = monthParts(monthId)

  // The Sunday on or before the 1st -- the same anchor the calendar grid uses,
  // derived here rather than imported because gridWeekStarts lives in the main
  // process and builds LOCAL dates.
  const first = new Date(Date.UTC(year, month - 1, 1))
  let weekStart = iso(new Date(Date.UTC(year, month - 1, 1 - first.getUTCDay())))

  const rows: MonthWeekRow[] = []
  while (weekStart <= monthEnd) {
    const weekEnd = addDays(weekStart, 6)
    const from = weekStart > monthStart ? weekStart : monthStart
    const to = weekEnd < monthEnd ? weekEnd : monthEnd
    rows.push({
      weekStart,
      weekEnd,
      from,
      to,
      days: dayCount(from, to),
      straddles: from !== weekStart || to !== weekEnd,
    })
    weekStart = addDays(weekStart, 7)
  }
  return rows
}
