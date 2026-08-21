// @vitest-environment jsdom
// v0.2.7 Feature 5 — BEAT 11: THE UNTOUCHED DAY LOSES ITS BOX.
//
// MEASURED on the August export: 29 of 31 in-month cells were an opaque
// #2a3142 outline around nothing. A month with two trading days rendered as a
// grid of empty boxes with two coloured ones hiding in it.
//
// The three states are carried by the FILL — heat, a 0.05 wash, nothing — and
// the outline was applied to all three equally, which is the one thing that
// makes them hard to tell apart at a glance. So the outline now follows the
// same rule the fill does: a day the trader touched gets chrome, a day nobody
// touched gets a numeral.
//
// D6 is the reason this beat needs a guard at all. Once the box is gone, the
// ONLY thing separating an in-month untouched day from an out-of-month one is
// the numeral's alpha — 0.45 against 0.30. That separation was previously
// decorative; it is now load-bearing, so it gets locked down.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CALENDAR_CARD_FORMATS,
  buildCells,
  cardRegions,
  composeCalendarCard,
  gridCellBoxes,
  isTraded,
  visibleRows,
  type CalendarCardData,
  type CalendarCardFormat,
} from '../calendarCard'
import { chartColors } from '../chartColors'
import { AUGUST_DAYS, AUGUST_WEEKS } from '@/test/fixtures/calendarCard'
import { installImageDecode, installRecordingCanvas } from '@/test/recordingCanvas'

let rec: ReturnType<typeof installRecordingCanvas>
let restoreDecode: () => void
beforeEach(() => {
  localStorage.clear()
  rec = installRecordingCanvas()
  restoreDecode = installImageDecode()
})
afterEach(() => {
  rec.restore()
  restoreDecode()
})

const DARK = chartColors('dark')

const card = (over: Partial<CalendarCardData> = {}): CalendarCardData => ({
  monthLabel: 'August 2026',
  year: 2026,
  month: 8,
  days: AUGUST_DAYS,
  weeks: AUGUST_WEEKS,
  monthPnl: 168.75,
  monthPct: 1.6875,
  monthFees: 19.98,
  monthFeesPct: 0.1998,
  tradeCount: 74,
  monthWinners: 48,
  monthLosers: 26,
  longestGreenRun: 2,
  currentStreak: { kind: 'loss', days: 1 },
  unit: 'percent',
  denominator: 'ok',
  ...over,
})
const compose = (f: CalendarCardFormat = 'wide', over: Partial<CalendarCardData> = {}) =>
  composeCalendarCard(card(over), 'dark', f)

/** The grid's own cell box, for the format under test. */
function cellBox(f: CalendarCardFormat) {
  const px = (n: number) => Math.round(n * (CALENDAR_CARD_FORMATS[f].w / 1000))
  const grid = cardRegions(f, true).find((r) => r.name === 'grid')!
  return gridCellBoxes(grid, visibleRows(buildCells(2026, 8)), px)[0]
}

/** Shapes painted at exactly one cell's size — so a card border, a band or a
 *  rail card cannot satisfy a cell assertion. */
function cellShapes(f: CalendarCardFormat) {
  const box = cellBox(f)
  return rec.shapes.filter(
    (s) => s.op !== 'fillRect' && Math.abs(s.w - box.w) < 2 && Math.abs(s.h - box.h) < 2,
  )
}

/** August's cells, partitioned by state. */
function states() {
  const rows = visibleRows(buildCells(2026, 8))
  const cells = buildCells(2026, 8).slice(0, rows * 7)
  const byDate = new Map(AUGUST_DAYS.map((d) => [d.date, d]))
  const inMonth = cells.filter((c) => c.inMonth)
  return {
    traded: inMonth.filter((c) => byDate.has(c.date) && isTraded(byDate.get(c.date)!)),
    touched: inMonth.filter((c) => byDate.has(c.date) && !isTraded(byDate.get(c.date)!)),
    untouched: inMonth.filter((c) => !byDate.has(c.date)),
    outOfMonth: cells.filter((c) => !c.inMonth),
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('D1 an in-month UNTOUCHED day gets no box at all', () => {
  it('the cell census accounts for the touched days and nobody else', async () => {
    await compose('wide')
    const s = states()
    const cells = cellShapes('wide')
    const strokes = cells.filter((c) => c.op === 'stroke')
    const fills = cells.filter((c) => c.op === 'fill')
    // 23 untouched days must contribute NOTHING. Anything else is 5+3=8.
    expect(
      strokes,
      `${strokes.length} strokes for ${s.traded.length} traded + ${s.touched.length} touched`,
    ).toHaveLength(s.traded.length + s.touched.length)
    expect(fills).toHaveLength(s.traded.length + s.touched.length)
  })

  it('a month where NOTHING was touched paints no cell chrome whatsoever', async () => {
    await compose('wide', { days: [] })
    expect(cellShapes('wide'), 'an empty month still painted boxes').toEqual([])
  })

  it('and the count is exactly the shortfall the export showed', async () => {
    await compose('wide')
    // The recon measured 31 strokes for 2 traded, 0 touched, 29 untouched.
    // The fixture has 5 + 3 + 23; the 23 are what this beat removes.
    expect(states().untouched).toHaveLength(23)
    expect(cellShapes('wide').filter((c) => c.op === 'stroke')).toHaveLength(8)
  })
})

describe('D2 an in-month TOUCHED day keeps its stroke and its 0.05 wash', () => {
  it('three touched days, three strokes, three washes', async () => {
    await compose('wide')
    const cells = cellShapes('wide')
    const wash = cells.filter((c) => c.op === 'fill' && c.style === `${DARK.axis}0d`)
    expect(wash, 'the touched wash is gone').toHaveLength(3)
  })

  it('the wash is the muted token at 0.05, unchanged', async () => {
    await compose('wide')
    const wash = cellShapes('wide').find((c) => c.op === 'fill' && c.style.startsWith(DARK.axis))!
    expect(wash.style).toBe(`${DARK.axis}0d`)
    expect(parseInt(wash.style.slice(-2), 16) / 255).toBeCloseTo(0.05, 2)
  })

  it('and it still says which kind of touched it was', async () => {
    await compose('wide')
    for (const label of ['sat out', 'journaled', 'MARKET CLOSED']) {
      expect(rec.texts, `no touched day rendered "${label}"`).toContain(label)
    }
  })
})

describe('D3 an in-month TRADED day keeps its stroke and its heat fill', () => {
  it('five traded days, five heat fills, five distinct alphas', async () => {
    await compose('wide')
    const heat = cellShapes('wide').filter(
      (c) => c.op === 'fill' && (c.style.startsWith(DARK.win) || c.style.startsWith(DARK.loss)),
    )
    expect(heat).toHaveLength(5)
    expect(new Set(heat.map((h) => h.style)).size, 'the heat ramp collapsed').toBe(5)
  })

  it('both tones, with HEAT_MAX pinned to the month’s biggest day', async () => {
    await compose('wide')
    const heat = cellShapes('wide').filter((c) => c.op === 'fill')
    expect(heat.some((h) => h.style === `${DARK.win}66`), 'HEAT_MAX unexercised').toBe(true)
    expect(heat.some((h) => h.style.startsWith(DARK.loss)), 'no loss tone drawn').toBe(true)
  })

  it('and EVERY traded day is outlined — asserted per cell, not by floor', async () => {
    // REWRITTEN in beat 11b. It was `strokes.length` toBeGreaterThanOrEqual(5),
    // and the actual is 8 — three of slack, because the touched days' strokes
    // counted toward a bound meant for the traded ones. Planted, one traded day
    // lost its stroke and this said nothing: 7 >= 5. A floor over a mixed
    // population cannot see a hole in one part of it.
    //
    // Now every traded cell must have a stroke AT ITS OWN BOX, so one missing
    // outline names the day it belongs to.
    await compose('wide')
    const px = (n: number) => Math.round(n * 1.6)
    const region = cardRegions('wide', true).find((r) => r.name === 'grid')!
    const rows = visibleRows(buildCells(2026, 8))
    const boxes = gridCellBoxes(region, rows, px)
    const cells = buildCells(2026, 8).slice(0, rows * 7)
    const strokes = cellShapes('wide').filter((c) => c.op === 'stroke' && c.style === DARK.border)
    const tradedDates = new Set(states().traded.map((c) => c.date))
    const missing = cells
      .map((c, i) => ({ c, b: boxes[i] }))
      .filter((x) => tradedDates.has(x.c.date))
      .filter(
        (x) => !strokes.some((s) => Math.abs(s.x - x.b.x) < 2 && Math.abs(s.y - x.b.y) < 2),
      )
      .map((x) => x.c.date)
    expect(missing, `traded days with no outline: ${missing.join(' ')}`).toEqual([])
    expect(tradedDates.size, 'the fixture lost its traded days').toBe(5)
  })
})

describe('D4 an OUT-OF-MONTH day is unchanged — it never had chrome', () => {
  it('eleven of them, and not one box between them', async () => {
    await compose('wide')
    expect(states().outOfMonth).toHaveLength(11)
    // Every painted cell box belongs to a traded or touched IN-MONTH day.
    const cells = cellShapes('wide')
    expect(cells).toHaveLength((5 + 3) * 2) // one stroke + one fill each
  })

  it('but its numeral is still drawn, as context', async () => {
    await compose('wide')
    // Aug 2026 leads with Jul 26-31 and trails with Sep 1-5.
    const nums = rec.texts.filter((t) => /^\d{1,2}$/.test(t))
    for (const d of ['26', '27', '28', '29', '30']) {
      expect(nums, `the grid lost out-of-month ${d}`).toContain(d)
    }
  })
})

describe('D5 the numeral is still drawn for untouched days', () => {
  it('all thirty-one August numerals reach the canvas', async () => {
    await compose('wide')
    const nums = rec.texts.filter((t) => /^\d{1,2}$/.test(t))
    for (let i = 1; i <= 31; i++) {
      expect(nums, `August ${i} is missing`).toContain(String(i))
    }
  })

  it('an untouched day draws a numeral and NOTHING else in its cell', async () => {
    await compose('wide')
    const box = cellBox('wide')
    const px = (n: number) => Math.round(n * 1.6)
    const rows = visibleRows(buildCells(2026, 8))
    const grid = cardRegions('wide', true).find((r) => r.name === 'grid')!
    const boxes = gridCellBoxes(grid, rows, px)
    const cells = buildCells(2026, 8).slice(0, rows * 7)
    // Aug 10 is untouched in the fixture.
    const i = cells.findIndex((c) => c.date === '2026-08-10')
    const b = boxes[i]
    const inside = rec.textPoints.filter(
      (t) => t.x >= b.x && t.x <= b.x + b.w && t.y >= b.y && t.y <= b.y + b.h,
    )
    expect(inside.map((t) => t.text)).toEqual(['10'])
    void box
  })
})

describe('D6 untouched and out-of-month numerals stay DISTINGUISHABLE', () => {
  // With the box gone this is the only thing separating them.
  it('the two fills differ', async () => {
    await compose('wide')
    const untouched = rec.textPoints.find((t) => t.text === '10')!
    const outOfMonth = rec.textPoints.find((t) => t.text === '27')!
    expect(untouched.style).not.toBe(outOfMonth.style)
  })

  it('and in-month untouched is the BRIGHTER of the two', async () => {
    await compose('wide')
    const alpha = (s: string) => (s.length > 7 ? parseInt(s.slice(-2), 16) / 255 : 1)
    const untouched = rec.textPoints.find((t) => t.text === '10')!
    const outOfMonth = rec.textPoints.find((t) => t.text === '27')!
    expect(untouched.style.slice(0, 7)).toBe(DARK.axis)
    expect(outOfMonth.style.slice(0, 7)).toBe(DARK.axis)
    expect(alpha(untouched.style)).toBeGreaterThan(alpha(outOfMonth.style))
    expect(alpha(untouched.style)).toBeCloseTo(0.45, 2)
    expect(alpha(outOfMonth.style)).toBeCloseTo(0.3, 2)
  })

  it('a TOUCHED numeral is brighter still — three tiers, not two', async () => {
    await compose('wide')
    const alpha = (s: string) => (s.length > 7 ? parseInt(s.slice(-2), 16) / 255 : 1)
    const touched = rec.textPoints.find((t) => t.text === '3')!
    const untouched = rec.textPoints.find((t) => t.text === '10')!
    expect(alpha(touched.style)).toBeGreaterThan(alpha(untouched.style))
  })
})
