// Pure date helpers for the performance engine. No date-fns dependency —
// the things we need (start-of-week / month / quarter / year, day diffs)
// are 5-10 lines of pure JS Date arithmetic. Keeps the renderer bundle
// slim and avoids pulling a heavy dep into /src/core.
//
// Convention throughout: dates are local-time YYYY-MM-DD strings (the same
// representation we use in the trades table). We do all math through the
// JS Date object then re-serialize.

import type { DateRange, QuickRange } from './types'

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Construct a Date at local midnight from a YYYY-MM-DD string. */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10))
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** ISO week start (Monday). */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = out.getDay() // 0=Sun, 1=Mon ...
  const shift = (dow + 6) % 7 // Mon=0, Sun=6
  out.setDate(out.getDate() - shift)
  return out
}

export function endOfWeek(d: Date): Date {
  const start = startOfWeek(d)
  start.setDate(start.getDate() + 6)
  return start
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3)
  return new Date(d.getFullYear(), q * 3, 1)
}

export function endOfQuarter(d: Date): Date {
  const start = startOfQuarter(d)
  return new Date(start.getFullYear(), start.getMonth() + 3, 0)
}

export function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1)
}

export function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31)
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + n)
  return out
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate())
}

/** Inclusive day count between two YYYY-MM-DD strings. */
export function daysBetween(from: string, to: string): number {
  const ms = parseDate(to).getTime() - parseDate(from).getTime()
  return Math.floor(ms / 86_400_000) + 1
}

export function rangeFromDates(from: Date, to: Date): DateRange {
  return { from: isoDate(from), to: isoDate(to) }
}

/** Convert a quick-range preset to a DateRange relative to `now`. Returns
 *  null for 'all', meaning "no date constraint". */
export function rangeForQuick(quick: QuickRange, now: Date = new Date()): DateRange | null {
  if (quick === 'all') return null
  if (quick === 'ytd') return rangeFromDates(startOfYear(now), now)
  const days = quick === '30d' ? 30 : quick === '60d' ? 60 : 90
  const from = addDays(now, -(days - 1))
  return rangeFromDates(from, now)
}

// ── Preset PERIOD ranges for the compare picker ──────────────────────────
//
// The presets below are what powers the chip strip in compare mode.
// 'thisWeek' uses ISO Monday-start weeks; 'thisQuarter' uses calendar
// quarters (Jan/Apr/Jul/Oct); 'lastYear' = previous calendar year.

export type PeriodPreset =
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'lastYear'

export const PERIOD_PRESET_LABEL: Record<PeriodPreset, string> = {
  thisWeek:    'This Week',
  lastWeek:    'Last Week',
  thisMonth:   'This Month',
  lastMonth:   'Last Month',
  thisQuarter: 'This Quarter',
  lastQuarter: 'Last Quarter',
  thisYear:    'This Year',
  lastYear:    'Last Year',
}

export function rangeForPreset(p: PeriodPreset, now: Date = new Date()): DateRange {
  switch (p) {
    case 'thisWeek':
      return rangeFromDates(startOfWeek(now), endOfWeek(now))
    case 'lastWeek': {
      const prev = addDays(startOfWeek(now), -7)
      return rangeFromDates(prev, addDays(prev, 6))
    }
    case 'thisMonth':
      return rangeFromDates(startOfMonth(now), endOfMonth(now))
    case 'lastMonth': {
      const prev = addMonths(startOfMonth(now), -1)
      return rangeFromDates(prev, endOfMonth(prev))
    }
    case 'thisQuarter':
      return rangeFromDates(startOfQuarter(now), endOfQuarter(now))
    case 'lastQuarter': {
      const prev = addMonths(startOfQuarter(now), -3)
      return rangeFromDates(prev, endOfQuarter(prev))
    }
    case 'thisYear':
      return rangeFromDates(startOfYear(now), endOfYear(now))
    case 'lastYear': {
      const prev = new Date(now.getFullYear() - 1, 0, 1)
      return rangeFromDates(prev, new Date(now.getFullYear() - 1, 11, 31))
    }
  }
}

/** Same calendar month as `now`, one year ago. e.g. May 2026 → May 2025. */
export function rangeForSameMonthLastYear(now: Date = new Date()): DateRange {
  const from = new Date(now.getFullYear() - 1, now.getMonth(), 1)
  const to = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0)
  return rangeFromDates(from, to)
}

/** Return a list of distinct trading-day YYYY-MM-DDs (no weekends/holidays
 *  awareness — just calendar days that fall in [from, to]). Used to render
 *  the X-axis of charts so missing days still appear with zero P&L. */
export function calendarDatesInRange(range: DateRange): string[] {
  const out: string[] = []
  let cur = parseDate(range.from)
  const end = parseDate(range.to)
  while (cur.getTime() <= end.getTime()) {
    out.push(isoDate(cur))
    cur = addDays(cur, 1)
  }
  return out
}
