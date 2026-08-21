// @vitest-environment jsdom
// v0.2.7 Feature 5 — BEAT 14: THE HEAT RAMP IS HOSTAGE TO ONE DAY.
//
// MEASURED on the judging book's 2026-03: twenty traded days, one at HEAT_MAX
// and nineteen packed between 0.147 and 0.251 — 32.5% of the usable alpha
// range, fifteen of them inside a 0.066 band, fourteen distinct rendered bytes
// over twenty days. The dense month reads as one bright cell and nineteen
// identical ones.
//
// The cause is the SCALE, not the curve. `heatScale` returned max(|pnl|), so a
// single 3.5x day owned 71.5% of the ratio range and every other day was
// squeezed into what was left. A sweep over the whole family of curves against
// that distribution says no function of |pnl|/max can fix it:
//
//     power r^p   best 32.5% at p=0.5 (today's sqrt); 24.1% linear, 31.1% p=.35
//     log 1+kr    best 41.9% at k=15
//     target      60%
//
// So this file guards the SHAPE of the ramp, not its constants. Five invariants
// that must survive any future re-tuning, and one target that says the middle of
// the month must be legible. The five are what stop the sixth being satisfied
// by something stupid — a pure rank ramp would score 100% and be a lie.

import { describe, expect, it } from 'vitest'
import {
  buildCells,
  cardRegions,
  composeCalendarCard,
  gridCellBoxes,
  heatAlpha,
  heatScale,
  isTraded,
  visibleRows,
  type CalendarCardData,
  type CalendarCardDay,
  type CalendarCardFormat,
} from '../calendarCard'
import { chartColors } from '../chartColors'
import { AUGUST_DAYS, AUGUST_WEEKS, cardDay } from '@/test/fixtures/calendarCard'
import { installImageDecode, installRecordingCanvas } from '@/test/recordingCanvas'

const DARK = chartColors('dark')

// THE MEASURED MARCH. Every traded day's net P&L from the judging book's
// 2026-03, read through getCalendarMonth -> buildMonthCardData. Not invented:
// this is the distribution the beat exists because of. One outlier at 3.51x the
// second-largest day, then nineteen days inside a 6.6x band.
const MARCH_PNL = [
  1331.73, 378.89, 343.39, 313.97, 294.92, 284.79, 281.9, 279.47, 274.51,
  272.51, 266.8, 221.94, 205.08, 171.27, -151.14, -149.5, -143.94, -142.3,
  -76.66, -57.63,
]

const marchDays = (): CalendarCardDay[] =>
  MARCH_PNL.map((p, i) => cardDay(`2026-03-${String(i + 1).padStart(2, '0')}`, p, 5 + i))

/** The floor and the ceiling, read off the ramp's own behaviour rather than
 *  re-declared here — a test that hardcodes the constants it is guarding tells
 *  you nothing when they move. Zero is always the floor; a month of one day is
 *  always the ceiling (that is H5, asserted separately). */
const floorOf = (days: readonly CalendarCardDay[]) => heatAlpha(0, heatScale(days))
const ceilOf = () => {
  const one = [cardDay('2026-03-02', 100, 3)]
  return heatAlpha(100, heatScale(one))
}

/** The spread of every day EXCEPT the largest, as a fraction of the usable
 *  range. The one number this beat exists to move. */
function bodySpread(days: readonly CalendarCardDay[]): number {
  const scale = heatScale(days)
  const traded = days.filter(isTraded).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
  const rest = traded.slice(1).map((d) => heatAlpha(d.pnl, scale))
  const usable = ceilOf() - floorOf(days)
  return (Math.max(...rest) - Math.min(...rest)) / usable
}

// ─── H1 ──────────────────────────────────────────────────────────────────────

describe('H1 the sign picks the tone, and the ramp never touches that', () => {
  it('every traded day fills in the tone its sign demands', async () => {
    const rec = installRecordingCanvas()
    const restore = installImageDecode()
    try {
      const data = {
        monthLabel: 'August 2026', year: 2026, month: 8,
        days: AUGUST_DAYS, weeks: AUGUST_WEEKS,
        monthPnl: 168.75, monthPct: 1.6875, monthFees: 19.98, monthFeesPct: 0.1998,
        tradeCount: 74, monthWinners: 48, monthLosers: 26, longestGreenRun: 2,
        currentStreak: { kind: 'win', days: 1 }, unit: 'percent', denominator: 'ok',
      } as unknown as CalendarCardData
      const f: CalendarCardFormat = 'wide'
      await composeCalendarCard(data, 'dark', f)

      const px = (n: number) => Math.round(n * 1.6)
      const rows = visibleRows(buildCells(2026, 8))
      const cells = buildCells(2026, 8).slice(0, rows * 7)
      const boxes = gridCellBoxes(cardRegions(f, true).find((r) => r.name === 'grid')!, rows, px)
      const byDate = new Map(AUGUST_DAYS.map((d) => [d.date, d]))

      let checked = 0
      cells.forEach((c, i) => {
        const day = byDate.get(c.date)
        if (!c.inMonth || !day || !isTraded(day)) return
        const b = boxes[i]
        const fill = rec.shapes.find(
          (s) => s.op === 'fill' && Math.abs(s.x - b.x) < 2 && Math.abs(s.y - b.y) < 2 &&
            Math.abs(s.w - b.w) < 2,
        )
        expect(fill, `no heat fill on traded day ${c.date}`).toBeDefined()
        const want = day.pnl > 0 ? DARK.win : DARK.loss
        expect(
          fill!.style.startsWith(want),
          `${c.date} nets ${day.pnl} but filled ${fill!.style}`,
        ).toBe(true)
        checked++
      })
      // A loop that checked nothing is not a guard.
      expect(checked, 'no traded day was examined').toBe(5)
    } finally {
      rec.restore()
      restore()
    }
  })
})

// ─── H2..H5 — the invariants, pure arithmetic ────────────────────────────────

describe('H2 the biggest day still lands at HEAT_MAX', () => {
  it('on a month with a violent outlier', () => {
    const days = marchDays()
    expect(heatAlpha(1331.73, heatScale(days))).toBeCloseTo(ceilOf(), 6)
  })

  it('and on a month with no outlier at all', () => {
    const days = [40, 44, 47, 51, 55].map((p, i) => cardDay(`2026-03-0${i + 1}`, p, 4))
    expect(heatAlpha(55, heatScale(days))).toBeCloseTo(ceilOf(), 6)
  })

  it('and when the biggest day is a LOSS', () => {
    const days = [-900, 120, -85, 40].map((p, i) => cardDay(`2026-03-0${i + 1}`, p, 4))
    expect(heatAlpha(-900, heatScale(days))).toBeCloseTo(ceilOf(), 6)
  })
})

describe('H3 a bigger day is never dimmer than a smaller one', () => {
  it('holds across a shuffled March', () => {
    // Deliberately not sorted — the ramp must not depend on input order.
    const shuffled = [...MARCH_PNL].sort((a, b) => (a * 7919) % 13 - (b * 7919) % 13)
    const days = shuffled.map((p, i) => cardDay(`2026-03-${String(i + 1).padStart(2, '0')}`, p, 6))
    const scale = heatScale(days)
    const ranked = [...days].sort((a, b) => Math.abs(a.pnl) - Math.abs(b.pnl))
    for (let i = 1; i < ranked.length; i++) {
      const lo = heatAlpha(ranked[i - 1].pnl, scale)
      const hi = heatAlpha(ranked[i].pnl, scale)
      expect(
        hi,
        `|${ranked[i].pnl}| > |${ranked[i - 1].pnl}| but ${hi.toFixed(4)} < ${lo.toFixed(4)}`,
      ).toBeGreaterThanOrEqual(lo - 1e-9)
    }
  })

  it('and across the whole continuum, not just the days that exist', () => {
    const days = marchDays()
    const scale = heatScale(days)
    let prev = -Infinity
    for (let x = 0; x <= 1400; x += 7) {
      const a = heatAlpha(x, scale)
      expect(a, `ramp went backwards at |pnl|=${x}`).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = a
    }
  })
})

describe('H4 the smallest traded day stays visible', () => {
  it('never below the floor, however small it is', () => {
    const days = marchDays()
    const scale = heatScale(days)
    const floor = floorOf(days)
    for (const d of days) {
      expect(
        heatAlpha(d.pnl, scale),
        `${d.date} (${d.pnl}) fell through the floor`,
      ).toBeGreaterThanOrEqual(floor - 1e-9)
    }
    // And a day worth one cent, on a month whose biggest is four figures.
    expect(heatAlpha(0.01, scale)).toBeGreaterThanOrEqual(floor - 1e-9)
    expect(heatAlpha(0, scale)).toBeCloseTo(floor, 6)
  })
})

describe('H5 a month with one traded day renders it at HEAT_MAX', () => {
  it('one day, full strength', () => {
    const days = [cardDay('2026-03-04', 212.5, 7)]
    expect(heatAlpha(212.5, heatScale(days))).toBeCloseTo(ceilOf(), 6)
  })

  it('and one traded day among touched ones is still the whole scale', () => {
    const days = [
      cardDay('2026-03-02', 0, 0, { noTrade: true }),
      cardDay('2026-03-03', 0, 0, { hasJournal: true }),
      cardDay('2026-03-04', -212.5, 7),
    ]
    expect(heatAlpha(-212.5, heatScale(days))).toBeCloseTo(ceilOf(), 6)
  })
})

// ─── H6 — the target ─────────────────────────────────────────────────────────

describe('H6 the body of the month occupies the range, not a sliver of it', () => {
  it('March-shaped: the nineteen non-outlier days span at least 60% of usable', () => {
    const spread = bodySpread(marchDays())
    expect(
      spread,
      `the nineteen non-outlier days span ${(spread * 100).toFixed(1)}% of the usable ` +
        `alpha range; the month is still hostage to its largest day`,
    ).toBeGreaterThanOrEqual(0.6)
  })

  it('and a near-identical month gets NO contrast manufactured for it', () => {
    // Six days within 0.4% of each other. A rank-position ramp would paint these
    // across the whole band from pure noise. The ramp must refuse.
    const flat = [500.0, 500.4, 500.8, 501.2, 501.6, 502.0].map((p, i) =>
      cardDay(`2026-03-0${i + 1}`, p, 5),
    )
    const scale = heatScale(flat)
    const alphas = flat.map((d) => heatAlpha(d.pnl, scale))
    const span = Math.max(...alphas) - Math.min(...alphas)
    expect(
      span,
      `six days within 0.4% of each other were painted across ${span.toFixed(3)} of alpha`,
    ).toBeLessThan(0.02)
  })
})
