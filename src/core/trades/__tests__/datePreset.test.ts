// v0.2.7 — A DATE PRESET IS NOT A DATE.
//
// MEASURED, before any of this existed. QuickFilters stored a preset by
// FLATTENING it to the two dates it happened to mean at the moment of the
// click, and recovered it by recomputing those dates and string-comparing:
//
//   "Today" set Monday 2026-08-17, read Tuesday 2026-08-18
//     stored dateFrom : "2026-08-17"      restored : "2026-08-17"
//     active chip MON : ["Today"]         active chip TUE : []
//
//   "Month" set 2026-08-17, read 2026-09-17
//     restored range  : 2026-07-19 .. 2026-08-17     active chips : []
//
// Two defects from one cause. The WINDOW is stale — "today" keeps showing a day
// that is no longer today, and the user is reading last month's trades under a
// chip they set expecting this month's. And the CHIP goes dark — the intent was
// never stored, so nothing can light up, and the only way back is to click a
// chip that already looks unset.
//
// THE FIX: store the INTENT (`datePreset`), not its projection. dateFrom and
// dateTo stay in the state and stay authoritative for filtering — every other
// consumer (applyTradesFilters, isFiltering, the two date inputs, the prefs
// blob) is untouched — but when a preset is set they are DERIVED from it, and
// re-derived against the current clock whenever the state is read back.
//
// This module is the whole of the date arithmetic, in core, pure, clock-injected.

import { describe, expect, it } from 'vitest'
import {
  DATE_PRESETS,
  isoDay,
  resolveDatePreset,
  refreshDatePreset,
  type DatePreset,
} from '../datePreset'
import { emptyFilters, type TradesFilterState } from '../tradesFilter'

const at = (iso: string) => new Date(iso)

/** Days spanned by a resolved window, inclusive of both ends. */
function span(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return (b - a) / 86400000 + 1
}

// ─── D1 ──────────────────────────────────────────────────────────────────────

describe('D1 a preset resolves against the clock it is given, not a hidden one', () => {
  it('the same preset yields a different window on a different day', () => {
    const mon = resolveDatePreset('today', at('2026-08-17T15:00:00'))
    const tue = resolveDatePreset('today', at('2026-08-18T15:00:00'))
    expect(mon).toEqual({ dateFrom: '2026-08-17', dateTo: '2026-08-17' })
    expect(tue).toEqual({ dateFrom: '2026-08-18', dateTo: '2026-08-18' })
    expect(tue, 'the window did not move with the clock').not.toEqual(mon)
  })

  it('the resolution is total — every preset resolves, none returns empty', () => {
    for (const p of DATE_PRESETS) {
      const r = resolveDatePreset(p, at('2026-08-17T15:00:00'))
      expect(r.dateFrom, `${p} produced no start`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(r.dateTo, `${p} produced no end`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(r.dateFrom <= r.dateTo, `${p} is inverted`).toBe(true)
    }
  })
})

// ─── D2 ──────────────────────────────────────────────────────────────────────

describe('D2 the windows keep the widths the chips promise', () => {
  const now = at('2026-08-17T15:00:00')
  const WIDTHS: Record<DatePreset, number> = { today: 1, week: 7, month: 30 }
  for (const p of DATE_PRESETS) {
    it(`"${p}" spans ${WIDTHS[p]} day(s), and ends today`, () => {
      const { dateFrom, dateTo } = resolveDatePreset(p, now)
      expect(span(dateFrom, dateTo), `"${p}" changed width`).toBe(WIDTHS[p])
      expect(dateTo, `"${p}" no longer ends today`).toBe('2026-08-17')
    })
  }
})

// ─── D3 — the boundaries the old string arithmetic could get wrong ───────────

describe('D3 the arithmetic survives month, year and DST boundaries', () => {
  it('a 30-day window reaches back across a month boundary', () => {
    expect(resolveDatePreset('month', at('2026-03-05T12:00:00'))).toEqual({
      dateFrom: '2026-02-04',
      dateTo: '2026-03-05',
    })
  })

  it('and across a year boundary', () => {
    expect(resolveDatePreset('week', at('2026-01-03T12:00:00'))).toEqual({
      dateFrom: '2025-12-28',
      dateTo: '2026-01-03',
    })
  })

  it('a leap day is a day like any other', () => {
    expect(resolveDatePreset('week', at('2028-03-02T12:00:00'))).toEqual({
      dateFrom: '2028-02-25',
      dateTo: '2028-03-02',
    })
  })

  it('the window is a LOCAL calendar window — a late-evening clock is still today', () => {
    // 23:30 local. A UTC-based .toISOString().slice(0,10) would roll this
    // forward for anyone east of UTC and back for anyone west; the day a trader
    // means by "today" is the one on their own wall.
    const late = new Date(2026, 7, 17, 23, 30, 0)
    expect(isoDay(late)).toBe('2026-08-17')
    expect(resolveDatePreset('today', late).dateTo).toBe('2026-08-17')
  })

  it('and an early-morning clock has not slipped to yesterday', () => {
    const early = new Date(2026, 7, 17, 0, 15, 0)
    expect(isoDay(early)).toBe('2026-08-17')
  })

  it("spans stay honest across the DST transitions of WHATEVER ZONE THIS RUNS IN", () => {
    // Deliberately NOT a hard-coded date. Written first as 2026-03-08 (the US
    // spring-forward), this guard was dead on a machine in Europe/Berlin, whose
    // transition is three weeks later — it asserted a boundary it never crossed.
    // A guard that only fires in one timezone is not a guard, so the
    // transitions are FOUND, in whatever zone the suite happens to run in.
    const transitions: Date[] = []
    let prev = new Date(2026, 0, 1, 12, 0, 0).getTimezoneOffset()
    for (let i = 1; i < 365; i++) {
      const d = new Date(2026, 0, 1 + i, 12, 0, 0)
      if (d.getTimezoneOffset() !== prev) transitions.push(d)
      prev = d.getTimezoneOffset()
    }
    if (transitions.length === 0) {
      // UTC and other fixed-offset zones have no boundary to cross.
      expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(new Date(2026, 0, 1).getTimezoneOffset())
      return
    }

    for (const t of transitions) {
      // WHERE THE DEFECT ACTUALLY LIVES. A ms-subtracting implementation is off
      // by exactly one hour across a transition, which only changes the
      // CALENDAR day when the clock sits within an hour of midnight. Sampled at
      // 09:00 this guard was green against a planted `now - n * 86400000` — it
      // was testing the right property at the wrong time of day. So the
      // time-of-day is swept, and both edges of midnight are included.
      for (const [hh, mm] of [[0, 30], [12, 0], [23, 30]] as const) {
        for (const back of [1, 2, 3]) {
          const now = new Date(t.getFullYear(), t.getMonth(), t.getDate() + back, hh, mm, 0)
          const where = `${isoDay(t)} transition, now=${isoDay(now)} ${hh}:${String(mm).padStart(2, '0')}`

          const w = resolveDatePreset('week', now)
          expect(w.dateTo, `week did not end today (${where})`).toBe(isoDay(now))
          expect(span(w.dateFrom, w.dateTo), `week was not 7 days (${where})`).toBe(7)

          const m = resolveDatePreset('month', now)
          expect(span(m.dateFrom, m.dateTo), `month was not 30 days (${where})`).toBe(30)

          const d = resolveDatePreset('today', now)
          expect(d.dateFrom, `today straddled midnight (${where})`).toBe(isoDay(now))
        }
      }
    }
  })
})

// ─── D4 — refresh ────────────────────────────────────────────────────────────

describe('D4 refreshing re-derives a preset window and leaves everything else alone', () => {
  const withPreset = (p: DatePreset, now: Date): TradesFilterState => ({
    ...emptyFilters(),
    symbol: 'AAPL',
    outcome: 'winners',
    datePreset: p,
    ...resolveDatePreset(p, now),
  })

  it('a "today" state built Monday reads as Tuesday after a refresh', () => {
    const monday = withPreset('today', at('2026-08-17T15:00:00'))
    expect(monday.dateFrom).toBe('2026-08-17')

    const tuesday = refreshDatePreset(monday, at('2026-08-18T09:00:00'))
    expect(tuesday.dateFrom, 'the window did not follow the clock').toBe('2026-08-18')
    expect(tuesday.dateTo).toBe('2026-08-18')
    expect(tuesday.datePreset, 'the intent was lost in the refresh').toBe('today')
  })

  it('a month-old "month" window is a month-old no longer', () => {
    const august = withPreset('month', at('2026-08-17T15:00:00'))
    const september = refreshDatePreset(august, at('2026-09-17T15:00:00'))
    expect(september).toMatchObject({
      dateFrom: '2026-08-19',
      dateTo: '2026-09-17',
      datePreset: 'month',
    })
  })

  it('every OTHER field is carried through untouched', () => {
    const before = withPreset('week', at('2026-08-17T15:00:00'))
    const after = refreshDatePreset(before, at('2026-08-25T15:00:00'))
    for (const k of Object.keys(before) as (keyof TradesFilterState)[]) {
      if (k === 'dateFrom' || k === 'dateTo') continue
      expect(after[k], `refresh disturbed "${k}"`).toEqual(before[k])
    }
  })

  it('with no preset set, a hand-picked range is NOT touched', () => {
    const manual: TradesFilterState = {
      ...emptyFilters(),
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      datePreset: null,
    }
    const after = refreshDatePreset(manual, at('2029-11-04T15:00:00'))
    expect(after.dateFrom, 'a manual range was overwritten by the clock').toBe('2026-01-01')
    expect(after.dateTo).toBe('2026-01-31')
  })

  it('and the untouched case returns the SAME OBJECT, so a mount cannot re-render on nothing', () => {
    const manual = { ...emptyFilters(), dateFrom: '2026-01-01', dateTo: '2026-01-31' }
    expect(refreshDatePreset(manual, at('2029-11-04T15:00:00'))).toBe(manual)
  })

  it('refreshing twice on the same clock changes nothing further', () => {
    const once = refreshDatePreset(withPreset('week', at('2026-08-17T15:00:00')), at('2026-08-25T15:00:00'))
    expect(refreshDatePreset(once, at('2026-08-25T18:00:00'))).toEqual(once)
  })
})

// ─── D5 — emptyFilters carries the field ─────────────────────────────────────

describe('D5 the empty filter has no preset, and says so explicitly', () => {
  it('datePreset is present and null, not absent', () => {
    expect(Object.keys(emptyFilters())).toContain('datePreset')
    expect(emptyFilters().datePreset).toBeNull()
  })
})
