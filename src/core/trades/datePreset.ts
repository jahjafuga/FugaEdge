// v0.2.7 — A DATE PRESET IS NOT A DATE.
//
// The quick-filter chips ("Today", "Week", "Month") name a window RELATIVE to
// now. The first implementation stored one by flattening it to the two absolute
// dates it happened to mean at the instant of the click, and recovered it by
// recomputing those dates and string-comparing them back:
//
//     if (f.dateFrom === todayStr() && f.dateTo === todayStr()) return 'today'
//
// That works for exactly as long as the page stays mounted. Once filters began
// persisting, it stopped: a "Today" set on Monday came back on Tuesday as a
// hard range over Monday, with no chip lit — so the user was reading yesterday
// under a control that looked switched off, and the only way to clear it was to
// click a chip that did not appear to be set.
//
// The cause is that the INTENT was never stored, only its projection. So this
// module owns the intent and the projection separately: `datePreset` is what
// the user chose, dateFrom/dateTo are what it currently means. Everything
// downstream — applyTradesFilters, isFiltering, the two date inputs, the
// persisted blob — keeps reading the dates and needs no knowledge of presets.
//
// PURE AND CLOCK-INJECTED. No `new Date()` inside a resolver: the caller passes
// the clock, so the behaviour on the day of a month boundary is a test rather
// than a wait. Platform-free (no electron / fs / node / react / DB), so this
// ports to the Next.js target unchanged.

import type { TradesFilterState } from '@/core/trades/tradesFilter'

export type DatePreset = 'today' | 'week' | 'month'

/** Every preset, in the order the chips are drawn. */
export const DATE_PRESETS: readonly DatePreset[] = ['today', 'week', 'month'] as const

/** How many days each preset spans, counting today as the first. These are
 *  ROLLING windows, deliberately: a momentum trader asking for "week" on a
 *  Tuesday means the last seven sessions, not the two days since Monday. The
 *  calendar-period vocabulary (`PeriodPreset` in core/performance/dateUtils)
 *  answers the other question and is not interchangeable with this one. */
const SPAN_DAYS: Record<DatePreset, number> = { today: 1, week: 7, month: 30 }

export function isPreset(v: unknown): v is DatePreset {
  return typeof v === 'string' && (DATE_PRESETS as readonly string[]).includes(v)
}

/** A date as the trader's own calendar shows it — LOCAL, never UTC. An
 *  ISO-string slice would roll an 11pm click forward a day east of UTC and an
 *  early-morning one back a day west of it, and trade dates in this app are
 *  local session dates. */
export function isoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** `n` days before the given clock, by CALENDAR arithmetic. setDate handles
 *  month, year and leap rollover, and — unlike subtracting n×86,400,000 ms —
 *  does not drift onto the wrong calendar day across a DST transition, where a
 *  local day is 23 or 25 hours long. */
function daysBefore(now: Date, n: number): Date {
  const d = new Date(now.getTime())
  d.setDate(d.getDate() - n)
  return d
}

/** What a preset means AT A GIVEN MOMENT. The window is inclusive at both ends
 *  and always ends today, which is what every one of these chips promises. */
export function resolveDatePreset(
  preset: DatePreset,
  now: Date,
): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: isoDay(daysBefore(now, SPAN_DAYS[preset] - 1)),
    dateTo: isoDay(now),
  }
}

/** Set (or clear) the preset and the window it implies, together. Clearing
 *  drops the dates too: a chip switched off must leave nothing filtering
 *  behind it, or the list stays narrowed by a control that reads as unset. */
export function withDatePreset(
  f: TradesFilterState,
  preset: DatePreset | null,
  now: Date,
): TradesFilterState {
  if (preset === null) return { ...f, datePreset: null, dateFrom: '', dateTo: '' }
  return { ...f, datePreset: preset, ...resolveDatePreset(preset, now) }
}

/** Hand-pick one end of the range. THE PRESET STANDS DOWN — an explicit date
 *  outranks a relative one, and leaving the preset armed would let the next
 *  refresh silently overwrite what the user just typed. */
export function withManualDate(
  f: TradesFilterState,
  end: 'from' | 'to',
  value: string,
): TradesFilterState {
  return {
    ...f,
    datePreset: null,
    ...(end === 'from' ? { dateFrom: value } : { dateTo: value }),
  }
}

/** Re-derive a preset's window against the current clock. Called wherever a
 *  filter state re-enters the app from storage, so a stored "Today" is today
 *  again rather than the day it was stored.
 *
 *  Returns the SAME OBJECT when there is no preset — a hand-picked range is
 *  never touched, and an unchanged identity keeps this free to call on mount. */
export function refreshDatePreset(f: TradesFilterState, now: Date): TradesFilterState {
  if (!f.datePreset) return f
  return { ...f, ...resolveDatePreset(f.datePreset, now) }
}
