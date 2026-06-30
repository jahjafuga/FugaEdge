// US equity-market (NYSE) FULL-closure schedule — computed, no API, offline-proof.
// PURE per ARCHITECTURE rule #1: zero electron/fs/sqlite/React imports, so it runs
// identically in the Calendar renderer, the dashboard MonthCalendarPreview, and a
// future web target. (Mirrors src/core/market/dailyChange.ts's purity convention.)
//
// FULL CLOSURES ONLY. The half-day / early-close sessions (the day after
// Thanksgiving, some Christmas Eves and July 3rds) are OPEN trading days at 1pm
// ET, NOT closures — they are intentionally NOT in this schedule and must never
// be marked "market closed".
//
// Dates are local-time 'YYYY-MM-DD' strings (the app-wide convention; the same
// representation the trades table and the Calendar cells use). All day-of-week
// math goes through a LOCAL `new Date(y, m-1, d)` so there is no UTC-offset
// day-of-week bug.

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** Day of week for a Y-M-D, LOCAL. 0=Sun .. 6=Sat. */
function dow(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getDay()
}

/** Day-of-month of the Nth `weekday` (0=Sun..6=Sat) in month `m`. e.g.
 *  nthWeekday(y, 1, 1, 3) = 3rd Monday of January. */
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  const firstDow = new Date(y, m - 1, 1).getDay()
  const offset = (weekday - firstDow + 7) % 7
  return 1 + offset + (n - 1) * 7
}

/** Day-of-month of the LAST `weekday` in month `m`. e.g. lastWeekday(y, 5, 1) =
 *  last Monday of May. */
function lastWeekday(y: number, m: number, weekday: number): number {
  const lastDay = new Date(y, m, 0).getDate() // 0th day of next month = last of this
  const lastDow = new Date(y, m - 1, lastDay).getDay()
  const offset = (lastDow - weekday + 7) % 7
  return lastDay - offset
}

/** Easter Sunday for a Gregorian year, as 'YYYY-MM-DD'. Anonymous Gregorian
 *  computus (Meeus/Jones/Butcher). Good Friday is this minus two days. */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const mth = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * mth + 114) / 31) // 3=Mar, 4=Apr
  const day = ((h + l - 7 * mth + 114) % 31) + 1
  return iso(year, month, day)
}

/** Observed date of a FIXED-DATE holiday under the standard NYSE rule: a holiday
 *  on Saturday is observed the preceding Friday; on Sunday, the following Monday.
 *  Only for holidays whose shift stays within the month (Juneteenth, Independence,
 *  Christmas) — New Year's is handled separately because its Saturday shift would
 *  cross into the prior year (and is NOT observed). */
function observedFixed(year: number, month: number, day: number): string {
  const w = dow(year, month, day)
  if (w === 6) return iso(year, month, day - 1) // Sat -> Fri
  if (w === 0) return iso(year, month, day + 1) // Sun -> Mon
  return iso(year, month, day)
}

/** Subtract `n` days from a 'YYYY-MM-DD' (local), re-serialized. Handles month
 *  rollover (Good Friday can cross the Apr->Mar boundary). */
function minusDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d - n)
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

/** Map of 'YYYY-MM-DD' -> holiday name for every FULL NYSE closure observed in
 *  `year`. Built once per lookup year; small and allocation-cheap. */
function holidayMap(year: number): Record<string, string> {
  const out: Record<string, string> = {}
  const add = (date: string | null, name: string) => {
    if (date) out[date] = name
  }

  // New Year's Day — Jan 1, observed-shifted, with the documented exception:
  // a Saturday Jan 1 is NOT observed (the prior Dec 31 Friday stays a trading
  // day), so it contributes no closure.
  const ny = dow(year, 1, 1)
  add(ny === 6 ? null : ny === 0 ? iso(year, 1, 2) : iso(year, 1, 1), "New Year's Day")

  add(iso(year, 1, nthWeekday(year, 1, 1, 3)), 'Martin Luther King Jr. Day') // 3rd Mon Jan
  add(iso(year, 2, nthWeekday(year, 2, 1, 3)), "Presidents' Day") //            3rd Mon Feb
  add(minusDays(easterSunday(year), 2), 'Good Friday') //                       Easter - 2
  add(iso(year, 5, lastWeekday(year, 5, 1)), 'Memorial Day') //                 last Mon May

  // Juneteenth — Jun 19 observed-shifted, but an NYSE holiday only from 2022.
  if (year >= 2022) {
    add(observedFixed(year, 6, 19), 'Juneteenth National Independence Day')
  }

  add(observedFixed(year, 7, 4), 'Independence Day') //                         Jul 4 observed
  add(iso(year, 9, nthWeekday(year, 9, 1, 1)), 'Labor Day') //                  1st Mon Sep
  add(iso(year, 11, nthWeekday(year, 11, 4, 4)), 'Thanksgiving Day') //         4th Thu Nov
  add(observedFixed(year, 12, 25), 'Christmas Day') //                          Dec 25 observed

  return out
}

/** The NYSE holiday name for a 'YYYY-MM-DD' date, or null if it is a normal
 *  trading day (or a weekend / half-day / malformed input). */
export function marketHolidayName(date: string): string | null {
  const [y, m, d] = date.split('-').map(Number)
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  // Re-canonicalize the key so an unpadded input ('2026-7-3') still matches.
  return holidayMap(y)[iso(y, m, d)] ?? null
}

/** True iff `date` ('YYYY-MM-DD') is a FULL NYSE market closure. */
export function isMarketHoliday(date: string): boolean {
  return marketHolidayName(date) !== null
}
