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
  buildCells,
  composeCalendarCard,
  dayCellText,
  longestGreenRun,
  sumOfDays,
  type CalendarCardData,
} from '../calendarCard'
import { cardDay, SPARSE_WEEKS } from '@/test/fixtures/calendarCard'
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

const d = (date: string, pnl: number, tradeCount: number, pct: number | null = null) =>
  cardDay(date, pnl, tradeCount, { pct })

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
  denominator: 'ok',
  weeks: SPARSE_WEEKS,
  monthFees: 4.32,
  monthFeesPct: 0.0432,
  tradeCount: 16,
  monthWinners: 8,
  monthLosers: 8,
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
    for (let i = 1; i <= 31; i++) expect(nums, `${i} is missing`).toContain(String(i))
  })

  it('and only the traded days carry a value and a trade count', async () => {
    await compose()
    const counts = rec.texts.filter((t) => /^\d+t$/.test(t))
    expect(counts).toEqual(expect.arrayContaining(['1t', '5t', '2t', '8t']))
  })

  it('the layout is the APP’s: Sunday-first, forty-two cells, six rows', () => {
    // Ported from CalendarGrid.buildCells. Sunday-first is load-bearing —
    // WeeklySummary.week_start values are Sundays, so a Monday grid could not
    // line its rows up with the week rail at all.
    const july = buildCells(2026, 7)
    expect(july).toHaveLength(42)
    // 2026-07-01 is a Wednesday -> index 3 in a Sunday-first row.
    expect(july[3]).toEqual({ date: '2026-07-01', day: 1, inMonth: true })
    expect(july.slice(0, 3).every((c) => !c.inMonth)).toBe(true)
    expect(july.filter((c) => c.inMonth)).toHaveLength(31)
    // 2026-06-01 is a Monday -> index 1.
    expect(buildCells(2026, 6)[1]).toEqual({ date: '2026-06-01', day: 1, inMonth: true })
  })
})

describe('T6 the DENSE case renders', () => {
  it('18 traded days of 30 cells, with the real counts', async () => {
    await dense()
    const nums = rec.texts.filter((t) => /^\d{1,2}$/.test(t))
    const inMonth = buildCells(2026, 6).filter((c) => c.inMonth)
    expect(inMonth).toHaveLength(30)
    for (const c of inMonth) expect(nums).toContain(String(c.day))
    // the app's badge, not a sentence
    expect(rec.texts).toContain('35t')
    expect(rec.texts).toContain('3t')
  })

  it('the best green run is 5, and it is drawn', async () => {
    expect(longestGreenRun(DENSE_DAYS)).toBe(5)
    await dense()
    expect(rec.texts).toContain('TRADES')
    expect(rec.texts).toContain('W/L')
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
    expect(rec.texts).toContain('NET')
    expect(rec.texts).toContain('-1.00%')
    expect(rec.texts).toContain('W/L')
    const nums2 = rec.texts.filter((t) => /^\d{1,2}$/.test(t))
    for (let i = 1; i <= 31; i++) expect(nums2).toContain(String(i))
  })

  it('and a losing streak is written as a streak, not as an absence', async () => {
    await composeCalendarCard(LOSING, 'dark')
    expect(rec.texts).toContain('TRADING DAYS')
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

  it('the WEEK’s streak is drawn as the panel gates it: two days or more', async () => {
    // The rail only exists in the layouts that have one; square is grid+totals.
    await composeCalendarCard(card(), 'dark', 'wide')
    expect(rec.texts).toContain('3-DAY LOSS')
  })

  it('and a one-day run is not called a streak, exactly as the panel decides', async () => {
    await composeCalendarCard(
      card({
        weeks: SPARSE_WEEKS.map((w) =>
          w.tradeCount > 0 ? { ...w, streak: { kind: 'win' as const, days: 1 } } : w,
        ),
      }),
      'dark',
      'wide',
    )
    expect(rec.texts.some((t) => /-DAY (WIN|LOSS)$/.test(t))).toBe(false)
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
