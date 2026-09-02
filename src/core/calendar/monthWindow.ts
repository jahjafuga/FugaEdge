// A MONTH IS A PAIR OF DATES AND A LABEL. Nothing here touches a database, a
// window object or an IPC channel: the main process turns an id into a window
// for getPeriodDetail, and the renderer turns the same id into a title and a
// nav population. One definition, both sides.
//
// THE WINDOW IS CALENDAR DAYS. June 2026 is 2026-06-01 through 2026-06-30 --
// NOT the six rows the calendar grid draws for it, which reach back to May 31
// and on to July 4. A month that summed the grid would count eleven days it
// does not own and would disagree with the year roll-up on every straddling
// boundary.
//
// UTC THROUGHOUT. `trades.date` is the Eastern TRADING DAY as a bare
// YYYY-MM-DD string and is compared as a string, so the only job here is
// getting the arithmetic right; a local-time Date would shift the 1st of the
// month across a timezone boundary and silently drop or gain a day.

/** 'YYYY-MM'. The id the drawer is keyed on and the arrows walk. */
export type MonthId = string

const MONTH_NAME = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n))

function parse(monthId: MonthId): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(monthId)
  if (!m) throw new Error(`monthWindow: month id must be bare YYYY-MM, got '${monthId}'`)
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) {
    throw new Error(`monthWindow: '${monthId}' is not a real month`)
  }
  return { year, month }
}

/** 2026, 6 -> '2026-06'. */
export function monthIdOf(year: number, month: number): MonthId {
  return `${year}-${pad2(month)}`
}

/** '2026-06' -> { year: 2026, month: 6 }. */
export function monthParts(monthId: MonthId): { year: number; month: number } {
  return parse(monthId)
}

/** '2026-06' -> { from: '2026-06-01', to: '2026-06-30' }.
 *
 *  The end day comes from day 0 of the FOLLOWING month, which is how February
 *  and its leap year get the right answer without a table. */
export function monthWindow(monthId: MonthId): { from: string; to: string } {
  const { year, month } = parse(monthId)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: `${year}-${pad2(month)}-01`, to: `${year}-${pad2(month)}-${pad2(lastDay)}` }
}

/** The twelve ids of a year, January first. THIS ORDER IS THE ARROWS' ORDER --
 *  getNavPosition walks the array as given, so a sort here is the difference
 *  between "next month" and whatever happened to be adjacent. */
export function monthIdsOfYear(year: number): MonthId[] {
  return Array.from({ length: 12 }, (_, i) => monthIdOf(year, i + 1))
}

/** '2026-06' -> 'June 2026'. The drawer's heading. The week's heading is a
 *  RANGE (longDate start -> longDate end) because a week has no name of its
 *  own; a month does, so it says it. */
export function monthLabel(monthId: MonthId): string {
  const { year, month } = parse(monthId)
  return `${MONTH_NAME[month - 1]} ${year}`
}
