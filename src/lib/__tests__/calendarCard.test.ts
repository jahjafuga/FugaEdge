// @vitest-environment jsdom
// v0.2.7 — the branded P&L calendar card.
//
// The two months that actually exist, measured off both books:
//   LIVE   2026-07 — 4 trading days in 31 cells, 1 green, best run 1, 1..8 trades
//   PRESET 2026-06 — 18 trading days in 30 cells, 12 green, best run 5, 3..35
// The sparse one is the hard case, and it is the one the app produces today.
//
// Asserted on what is DRAWN, through the recording canvas, because a card is an
// image: what it was handed is not evidence of what it says.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  composeCalendarCard,
  dayCellText,
  longestGreenRun,
  monthLayout,
  sumOfDays,
  type CalendarCardData,
  type CalendarCardDay,
} from '../calendarCard'
import { STREAMER_STORAGE_KEY } from '../streamerMode'
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

const d = (
  date: string,
  pnl: number,
  tradeCount: number,
  pct: number | null = null,
): CalendarCardDay => ({ date, pnl, pct, tradeCount })

/** LIVE, 2026-07 — the real numbers. */
const SPARSE_DAYS = [
  d('2026-07-28', -1.84, 1, -0.02),
  d('2026-07-29', -12.0, 5, -0.12),
  d('2026-07-30', -4.41, 2, -0.04),
  d('2026-07-31', 19.24, 8, 0.19),
]
/** PRESET, 2026-06 — the real numbers. */
const DENSE_DAYS = [
  d('2026-06-01', 3.1, 12, 0.03), d('2026-06-02', 20.7, 5, 0.21),
  d('2026-06-03', -6.24, 7, -0.06), d('2026-06-04', 8.03, 16, 0.08),
  d('2026-06-05', 2.73, 3, 0.03), d('2026-06-08', -118.31, 17, -1.18),
  d('2026-06-09', 28.71, 35, 0.29), d('2026-06-10', 18.5, 3, 0.19),
  d('2026-06-11', 6.3, 9, 0.06), d('2026-06-12', 13.56, 9, 0.14),
  d('2026-06-15', 9.66, 17, 0.1), d('2026-06-16', -33.35, 20, -0.33),
  d('2026-06-17', 39.91, 18, 0.4), d('2026-06-22', 36.09, 11, 0.36),
  d('2026-06-23', 35.12, 4, 0.35), d('2026-06-24', -6.83, 15, -0.07),
  d('2026-06-25', -58.31, 35, -0.58), d('2026-06-26', -41.71, 35, -0.42),
]

const card = (over: Partial<CalendarCardData> = {}): CalendarCardData => ({
  monthLabel: 'July 2026',
  year: 2026,
  month: 7,
  days: SPARSE_DAYS,
  monthPnl: sumOfDays(SPARSE_DAYS),
  monthPct: 0.01,
  longestGreenRun: longestGreenRun(SPARSE_DAYS),
  currentStreak: { kind: 'win', days: 1 },
  unit: 'percent',
  ...over,
})
const compose = (over: Partial<CalendarCardData> = {}) =>
  composeCalendarCard(card(over), 'dark')
const dense = (over: Partial<CalendarCardData> = {}) =>
  composeCalendarCard(
    card({
      monthLabel: 'June 2026', year: 2026, month: 6, days: DENSE_DAYS,
      monthPnl: sumOfDays(DENSE_DAYS), longestGreenRun: longestGreenRun(DENSE_DAYS),
      currentStreak: { kind: 'loss', days: 3 }, ...over,
    }),
    'dark',
  )

describe('T5 the SPARSE case renders deliberately', () => {
  it('every calendar cell in the month is drawn, traded or not', async () => {
    await compose()
    // 31 day numbers, not 4. An empty day is a quiet cell, never a missing one.
    const nums = rec.texts.filter((t) => /^\d{1,2}$/.test(t))
    expect(new Set(nums).size).toBe(31)
    for (let i = 1; i <= 31; i++) expect(nums).toContain(String(i))
  })

  it('and only the traded days carry a value and a trade count', async () => {
    await compose()
    const counts = rec.texts.filter((t) => /^\d+ trades?$/.test(t))
    expect(counts).toEqual(['1 trade', '5 trades', '2 trades', '8 trades'])
  })

  it('the layout puts the 1st in the right column', () => {
    // 2026-07-01 is a Wednesday -> Monday-based column 2.
    expect(monthLayout(2026, 7)).toEqual({ days: 31, firstCol: 2 })
    // 2026-06-01 is a Monday -> column 0.
    expect(monthLayout(2026, 6)).toEqual({ days: 30, firstCol: 0 })
  })
})

describe('T6 the DENSE case renders', () => {
  it('18 traded days of 30 cells, with the real counts', async () => {
    await dense()
    const nums = rec.texts.filter((t) => /^\d{1,2}$/.test(t))
    expect(new Set(nums).size).toBe(30)
    const counts = rec.texts.filter((t) => /^\d+ trades?$/.test(t))
    expect(counts).toHaveLength(18)
    expect(rec.texts).toContain('35 trades')
    expect(rec.texts).toContain('3 trades')
  })

  it('the best green run is 5, and it is drawn', async () => {
    expect(longestGreenRun(DENSE_DAYS)).toBe(5)
    await dense()
    expect(rec.texts).toContain('BEST GREEN RUN')
    expect(rec.texts).toContain('5')
  })
})

describe('T7 a LOSING month renders every element a winning one does', () => {
  const LOSING = card({ monthPnl: -100, monthPct: -1.0,
                        currentStreak: { kind: 'loss', days: 3 } })
  const WINNING = card({ monthPnl: 100, monthPct: 1.0,
                         currentStreak: { kind: 'win', days: 3 } })
  const labels = () => rec.texts.filter((t) => /^[A-Z][A-Z &]+$/.test(t))

  it('the same labels are drawn either way', async () => {
    await composeCalendarCard(WINNING, 'dark')
    const win = labels()
    rec.texts.length = 0
    await composeCalendarCard(LOSING, 'dark')
    expect(labels()).toEqual(win)
  })

  it('the losing month still prints a total, a streak and every cell', async () => {
    await composeCalendarCard(LOSING, 'dark')
    expect(rec.texts).toContain('MONTH')
    expect(rec.texts).toContain('-1.00%')
    expect(rec.texts).toContain('3 red')
    expect(new Set(rec.texts.filter((t) => /^\d{1,2}$/.test(t))).size).toBe(31)
  })

  it('and a losing streak is written as a streak, not as an absence', async () => {
    await composeCalendarCard(LOSING, 'dark')
    expect(rec.texts).toContain('ENDING STREAK')
    expect(rec.texts).not.toContain('—')
  })
})

describe('T8 percentage is the default; dollars require an explicit choice', () => {
  it('percent renders a percentage and no dollar sign', async () => {
    await compose()
    expect(rec.texts).toContain('+0.19%')
    expect(rec.texts.filter((t) => t.includes('$'))).toEqual([])
  })

  it('dollars render only when asked for', async () => {
    await compose({ unit: 'dollars' })
    expect(rec.texts.some((t) => t.includes('$'))).toBe(true)
  })

  it('the unit is honoured in ONE place, so it cannot drift', () => {
    expect(dayCellText({ pnl: 19.24, pct: 0.19 }, 'percent', false)).toBe('+0.19%')
    expect(dayCellText({ pnl: 19.24, pct: 0.19 }, 'dollars', false)).toContain('$')
  })
})

describe('T9 streamer mode forces percentage even when dollars were chosen', () => {
  it('no dollar figure is drawn', async () => {
    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    await compose({ unit: 'dollars' })
    expect(rec.texts.filter((t) => t.includes('$'))).toEqual([])
    expect(rec.texts).toContain('+0.19%')
  })

  it('and where a percentage cannot be computed it MASKS rather than falling back', () => {
    // A privacy setting that degrades to the thing it hides is not one.
    expect(dayCellText({ pnl: 19.24, pct: null }, 'dollars', true)).toBe('••••••')
    expect(dayCellText({ pnl: 19.24, pct: null }, 'percent', false)).toBe('—')
  })

  it('the month total is masked too, not just the days', async () => {
    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    await compose({ unit: 'dollars', monthPct: null })
    expect(rec.texts).toContain('••••••')
    expect(rec.texts.filter((t) => t.includes('$'))).toEqual([])
  })
})

describe('T10 the card carries no account name, in any mode', () => {
  it('nothing account-shaped is drawn', async () => {
    for (const unit of ['percent', 'dollars'] as const) {
      for (const streamer of [false, true]) {
        localStorage.clear()
        if (streamer) localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
        rec.texts.length = 0
        await compose({ unit })
        const drawn = rec.texts.join(' ')
        expect(drawn).not.toMatch(/account/i)
        expect(drawn).not.toMatch(/\bMAIN\b/)
      }
    }
  })

  it('and the type carries no field to put one in', () => {
    const keys = Object.keys(card())
    expect(keys).not.toContain('accountName')
    expect(keys).not.toContain('account')
  })
})

describe('T11 the month total equals the sum of the days drawn', () => {
  it('the visible-sum rule, on both books', () => {
    expect(sumOfDays(SPARSE_DAYS)).toBeCloseTo(-1.84 - 12.0 - 4.41 + 19.24, 10)
    expect(sumOfDays(DENSE_DAYS)).toBeCloseTo(
      DENSE_DAYS.reduce((a, x) => a + x.pnl, 0),
      10,
    )
  })

  it('the printed month value IS that sum, formatted the same way a day is', async () => {
    await compose({ unit: 'dollars', monthPnl: sumOfDays(SPARSE_DAYS) })
    expect(rec.texts).toContain(
      dayCellText({ pnl: sumOfDays(SPARSE_DAYS), pct: 0.01 }, 'dollars', false),
    )
  })
})

describe('T12 the streak drawn is the streak the app computes', () => {
  it('longestGreenRun folds the same per-day map computeStreak walks', () => {
    expect(longestGreenRun(SPARSE_DAYS)).toBe(1)
    expect(longestGreenRun(DENSE_DAYS)).toBe(5)
    expect(longestGreenRun([])).toBe(0)
  })

  it('a run is CONSECUTIVE traded days, and a red day breaks it', () => {
    expect(longestGreenRun([d('a', 1, 1), d('b', 1, 1), d('c', -1, 1), d('d', 1, 1)])).toBe(2)
  })

  it('the current streak is drawn as given, not recomputed', async () => {
    await compose({ currentStreak: { kind: 'win', days: 4 } })
    expect(rec.texts).toContain('4 green')
  })

  it('a none-streak is an em dash, honest for a month with no run', async () => {
    await compose({ currentStreak: { kind: 'none', days: 0 } })
    expect(rec.texts).toContain('—')
  })
})

describe('T13 the same brand vocabulary as the chart card, by import not by copy', () => {
  // A SOURCE guard. Two compositors is already one more than ideal; two brand
  // vocabularies would be the actual defect — a card that is gold here and a
  // different gold there, drifting apart one commit at a time. The only way to
  // assert "there is no second copy" is to read the source.
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')
  const CARD = read('calendarCard.ts')
  const CHART = read('chartScreenshot.ts')

  it('the icon comes from the same asset, by the same specifier', () => {
    const spec = /import iconUrl from '([^']+)'/
    expect(CARD.match(spec)?.[1]).toBe(CHART.match(spec)?.[1])
  })

  it('every colour comes from chartColors — no hex of its own', () => {
    expect(CARD).toContain("from '@/lib/chartColors'")
    const hexes = CARD.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(hexes, `hard-coded colours: ${hexes.join(' ')}`).toEqual([])
  })

  it('the same unit/px rule, so the two are one object at two aspect ratios', () => {
    expect(CARD).toContain('W / 1000')
    expect(CHART).toContain('W / 1000')
    // and the rounding is the same one, not a second convention
    expect(CARD).toMatch(/px = \(n: number\): number => Math\.round\(n \* unitPx\)/)
  })

  it('the mask glyph is imported, never restated', () => {
    expect(CARD).toContain("import { MASKED_AMOUNT } from '@/lib/chartScreenshot'")
    expect(CARD).not.toMatch(/MASKED_AMOUNT\s*=/)
    expect(CARD).not.toContain('••••')
  })

  it('the same font stack, declared once each and identical', () => {
    const font = /const FONT = '([^']+)'/
    expect(CARD.match(font)?.[1]).toBe(CHART.match(font)?.[1])
  })

  it('and the streamer read is the shared one', () => {
    expect(CARD).toContain("import { readStreamerMode } from '@/lib/streamerMode'")
    expect(CARD).not.toMatch(/localStorage/)
  })
})
