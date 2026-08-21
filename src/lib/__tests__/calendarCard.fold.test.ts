// @vitest-environment jsdom
// v0.2.7 Feature 5 — BEAT 17: THE ADAPTIVE RAIL AND THE MONTH FOLD.
//
// MEASURED across the judging book: on 2026-03/04/05 the rail is starved in both
// rail formats — wide short by 51px against its own floors, portrait by 43px —
// and every one of the five week cards is cut below the floor. Zero of
// seventeen tier lines survive. The rail spends 629px saying five times what it
// cannot finish saying once.
//
// RULED, option A: when the rail is starved the cards drop to ONE content line
// and the space that frees carries a MONTH-level fold. When it is not starved
// nothing changes at all. One rule — the fold gets the leftover.
//
// A note on the not-starved case, measured before this was built: today's rail
// fills itself to 99.8-100% (2026-06 leaves 0px in both formats), so "the fold
// gets the leftover" gives the fold nothing there. That is the ruling working,
// not the ruling failing: a rail with room for its tiers keeps them.
//
// SCOPE IS THE TWO RAIL FORMATS. Square is grid-footer and story is a poster;
// neither has a rail, neither may gain a fold. F8 holds that line.
//
// The new API is reached through the namespace so this file LOADS before the
// cure exists — a guard that dies on an import error tells you nothing about
// the thing it was written to measure.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as CC from '../calendarCard'
import {
  CALENDAR_CARD_FORMATS,
  cardRegions,
  collapseEmptyWeeks,
  composeCalendarCard,
  gridCellBoxes,
  railCardBoxes,
  visibleRows,
  buildCells,
  weekMinHeight,
  type CalendarCardData,
  type CalendarCardFormat,
  type CalendarCardWeek,
} from '../calendarCard'
import { cardDay, cardWeek } from '@/test/fixtures/calendarCard'
import { installImageDecode, installRecordingCanvas } from '@/test/recordingCanvas'

const RAIL: CalendarCardFormat[] = ['wide', 'portrait']
const NO_RAIL: CalendarCardFormat[] = ['square', 'story']
const pxOf = (f: CalendarCardFormat) => (n: number) => Math.round(n * (CALENDAR_CARD_FORMATS[f].w / 1000))

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

// ── MARCH, as the book has it: five populated weeks, the rail starves ────────
const MARCH_WEEKS = (): CalendarCardWeek[] => [
  cardWeek('2026-03-01', '2026-03-07', {
    tradeCount: 75, netPnl: 1766.36, netPct: 7.07, totalFees: 245.1, feesPct: 0.98,
    winners: 46, losers: 29, winRate: 0.61, plRatio: 1.8, daysTraded: 5, daysJournaled: 3,
    streak: { kind: 'loss', days: 2 }, topMistake: { name: 'Chased extended', count: 18 },
  }),
  cardWeek('2026-03-08', '2026-03-14', {
    tradeCount: 63, netPnl: 124.88, netPct: 0.5, totalFees: 206.1, feesPct: 0.82,
    winners: 38, losers: 25, winRate: 0.6, plRatio: 1.1, daysTraded: 5, daysJournaled: 2,
    streak: { kind: 'loss', days: 3 }, topMistake: { name: 'Chased extended', count: 16 },
  }),
  cardWeek('2026-03-15', '2026-03-21', {
    tradeCount: 47, netPnl: 639.16, netPct: 2.56, totalFees: 153.7, feesPct: 0.61,
    winners: 29, losers: 18, winRate: 0.62, plRatio: 1.6, daysTraded: 4, daysJournaled: 3,
    streak: { kind: 'win', days: 3 }, topMistake: { name: 'Chased extended', count: 8 },
  }),
  cardWeek('2026-03-22', '2026-03-28', {
    tradeCount: 57, netPnl: 1374.68, netPct: 5.5, totalFees: 186.4, feesPct: 0.75,
    winners: 35, losers: 22, winRate: 0.61, plRatio: 2.1, daysTraded: 5, daysJournaled: 2,
    streak: { kind: 'win', days: 8 }, topMistake: { name: 'Chased extended', count: 12 },
  }),
  cardWeek('2026-03-29', '2026-04-04', {
    tradeCount: 18, netPnl: 294.92, netPct: 1.18, totalFees: 59.7, feesPct: 0.24,
    winners: 11, losers: 7, winRate: 0.61, plRatio: 1.4, daysTraded: 1, daysJournaled: 0,
    streak: { kind: 'none', days: 0 }, topMistake: null, scoped: true,
  }),
]

// ── JUNE: three traded days, five weeks, the rail is NOT starved ─────────────
const JUNE_WEEKS = (): CalendarCardWeek[] => [
  cardWeek('2026-05-31', '2026-06-06', {
    tradeCount: 4, netPnl: -105.36, netPct: -0.42, totalFees: 32.1, feesPct: 0.13,
    winners: 1, losers: 3, winRate: 0.25, plRatio: 0.6, daysTraded: 1, daysJournaled: 0,
    streak: { kind: 'loss', days: 1 }, topMistake: { name: 'Oversized', count: 1 },
  }),
  cardWeek('2026-06-07', '2026-06-13', {
    tradeCount: 5, netPnl: -193.95, netPct: -0.78, totalFees: 40.2, feesPct: 0.16,
    winners: 2, losers: 3, winRate: 0.4, plRatio: 0.7, daysTraded: 1, daysJournaled: 1,
    streak: { kind: 'loss', days: 2 }, topMistake: { name: 'FOMO entry', count: 1 },
  }),
  cardWeek('2026-06-14', '2026-06-20', {
    daysJournaled: 1, streak: { kind: 'loss', days: 2 },
  }),
  cardWeek('2026-06-21', '2026-06-27', {
    tradeCount: 5, netPnl: 339.31, netPct: 1.36, totalFees: 42.3, feesPct: 0.17,
    winners: 3, losers: 2, winRate: 0.6, plRatio: 1.9, daysTraded: 1, daysJournaled: 0,
    streak: { kind: 'win', days: 1 }, topMistake: null,
  }),
  cardWeek('2026-06-28', '2026-07-04', { streak: { kind: 'win', days: 1 } }),
]

const MARCH_DAYS = () =>
  [3, 4, 20, 25, 30, 26, 2, 23, 27, 9, 18, 24, 10, 19, 11, 5, 13, 17, 6, 12].map((d, i) =>
    cardDay(`2026-03-${String(d).padStart(2, '0')}`, i === 0 ? 1331.73 : 300 - i * 12, 13),
  )

const card = (over: Partial<CalendarCardData> = {}): CalendarCardData =>
  ({
    monthLabel: 'March 2026', year: 2026, month: 3,
    days: MARCH_DAYS(), weeks: MARCH_WEEKS(),
    monthPnl: 4200, monthPct: 16.8, monthFees: 850.95, monthFeesPct: 3.4,
    tradeCount: 260, monthWinners: 159, monthLosers: 101, longestGreenRun: 9,
    currentStreak: { kind: 'win', days: 9 }, unit: 'percent', denominator: 'ok',
    ...over,
  }) as unknown as CalendarCardData

const june = () =>
  card({
    monthLabel: 'June 2026', year: 2026, month: 6,
    days: [
      cardDay('2026-06-01', -105.36, 4), cardDay('2026-06-10', -193.95, 5),
      cardDay('2026-06-22', 339.31, 5), cardDay('2026-06-16', 0, 0, { noTrade: true }),
    ],
    weeks: JUNE_WEEKS(),
    monthPnl: 40, monthPct: 0.16, monthFees: 114.64, monthFeesPct: 0.46,
    tradeCount: 14, monthWinners: 6, monthLosers: 8, longestGreenRun: 1,
    currentStreak: { kind: 'win', days: 1 },
  })

/** Tier lines are found by GEOMETRY, not by wording. A mistake tier line is an
 *  uppercased vocabulary name — no regex can tell it from a masthead label, and
 *  a guard that tried scored June at 0 when it drew 1. The tier is whatever a
 *  week card draws at or below its first tier baseline, b.y + px(78). */
const tierTexts = (f: CalendarCardFormat, weeks: CalendarCardWeek[]) => {
  const px = pxOf(f)
  const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
  const boxes = railCardBoxes(rail, collapseEmptyWeeks(weeks), px)
  return rec.textPoints.filter((t) =>
    boxes.some(
      (b) =>
        t.x >= b.x - 1 && t.x <= b.x + b.w + 1 &&
        t.y >= b.y + px(78) - 1 && t.y <= b.y + b.h + 1,
    ),
  )
}
/** The fold's own lines, identified by the vocabulary only the fold uses. */
const FOLD_RE = /(ACROSS \d+ OF \d+ WEEKS)|(^JOURNALED \d+ OF \d+ DAYS$)|(^BEST DAY )|(INTO NEXT MONTH$)|(^BEST GREEN RUN )|(^FEES )/
const foldTexts = () => rec.texts.filter((t) => FOLD_RE.test(t))
const foldPoints = () => rec.textPoints.filter((t) => FOLD_RE.test(t.text))

// ─── F1 — the starved rail folds ─────────────────────────────────────────────

describe('F1 a starved rail drops its cards to one line and folds the month', () => {
  for (const f of RAIL) {
    it(`${f}: 2026-03 draws no tier line and does draw a fold`, async () => {
      const px = pxOf(f)
      const shown = collapseEmptyWeeks(MARCH_WEEKS())
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      const avail = rail.h - px(6) * (shown.length - 1)
      const minTotal = shown.reduce((a, w) => a + weekMinHeight(w, px), 0)
      expect(avail, `${f} is not starved; this test measures nothing`).toBeLessThanOrEqual(minTotal)

      await composeCalendarCard(card(), 'dark', f)
      expect(
        tierTexts(f, MARCH_WEEKS()).map((t) => t.text),
        `${f}: a week card still drew a tier line`,
      ).toEqual([])
      expect(
        foldTexts().length,
        `${f}: the rail starved its five cards and put NOTHING in the space it took back`,
      ).toBeGreaterThan(0)
    })

    it(`${f}: the fold region exists and has height`, () => {
      const px = pxOf(f)
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      const plan = (CC as never as { planRail: typeof CC.planRail }).planRail(
        rail, collapseEmptyWeeks(MARCH_WEEKS()), px,
      )
      expect(plan.starved, `${f} should be planned as starved`).toBe(true)
      expect(plan.fold, `${f}: no fold region was carved`).not.toBeNull()
      expect(plan.fold!.h, `${f}: the fold region has no height`).toBeGreaterThan(0)
    })
  }
})

// ─── F2 — and a rail with room is untouched ──────────────────────────────────

describe('F2 a rail that is NOT starved keeps every tier line it has today', () => {
  for (const f of RAIL) {
    it(`${f}: 2026-06 surviving tier count is unchanged`, async () => {
      const px = pxOf(f)
      const shown = collapseEmptyWeeks(JUNE_WEEKS())
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      const avail = rail.h - px(6) * (shown.length - 1)
      const minTotal = shown.reduce((a, w) => a + weekMinHeight(w, px), 0)
      expect(avail, `${f}: June is starved; this test measures nothing`).toBeGreaterThan(minTotal)

      const boxes = railCardBoxes(rail, shown, px)
      const expected = boxes.reduce((a, b, i) => a + CC.fitTierLines(shown[i], b.h, px).length, 0)
      expect(expected, 'June should have tier lines to keep').toBeGreaterThan(0)

      await composeCalendarCard(june(), 'dark', f)
      const drawn = tierTexts(f, JUNE_WEEKS())
      expect(
        drawn.length,
        `${f}: June drew ${JSON.stringify(drawn.map((t) => t.text))}, not the ` +
          `${expected} tier lines it has room for`,
      ).toBe(expected)
    })
  }
})

// ─── F3 — the fold never lands on a card ─────────────────────────────────────

describe('F3 the fold is below the last week card, never on top of it', () => {
  for (const f of RAIL) {
    it(`${f}: geometric separation from the last card's bottom edge`, async () => {
      const px = pxOf(f)
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      const plan = (CC as never as { planRail: typeof CC.planRail }).planRail(
        rail, collapseEmptyWeeks(MARCH_WEEKS()), px,
      )
      const last = plan.cards[plan.cards.length - 1]
      expect(plan.fold).not.toBeNull()
      expect(
        plan.fold!.y,
        `${f}: the fold starts at ${plan.fold!.y}, inside a card ending at ${last.y + last.h}`,
      ).toBeGreaterThanOrEqual(last.y + last.h)
      expect(
        plan.fold!.y + plan.fold!.h,
        `${f}: the fold runs past the bottom of the rail`,
      ).toBeLessThanOrEqual(rail.y + rail.h + 0.5)

      // and the INK agrees with the geometry
      await composeCalendarCard(card(), 'dark', f)
      for (const t of foldPoints()) {
        expect(t.y, `${f}: fold line "${t.text}" drew above the fold region`).toBeGreaterThanOrEqual(
          plan.fold!.y,
        )
      }
    })
  }
})

// ─── F4 — and it degrades in its own order ───────────────────────────────────

describe('F4 the fold drops its lowest-value line first, the mistake last', () => {
  it('shrinking the fold sheds lines from the bottom of its own order', () => {
    const px = pxOf('wide')
    const weeks = MARCH_WEEKS()
    const data = card()
    const seen: string[][] = []
    for (const h of [400, 120, 90, 60, 40, 20, 8]) {
      const lines = (CC as never as { foldLines: typeof CC.foldLines }).foldLines(data, weeks)
      const fit = (CC as never as { fitFoldLines: typeof CC.fitFoldLines }).fitFoldLines(
        lines, h, px,
      )
      seen.push(fit.map((l) => l.kind))
    }
    // monotonic: every shorter fold is a prefix of the taller one
    for (let i = 1; i < seen.length; i++) {
      expect(
        seen[i].length,
        `a shorter fold grew: ${JSON.stringify(seen[i - 1])} -> ${JSON.stringify(seen[i])}`,
      ).toBeLessThanOrEqual(seen[i - 1].length)
      expect(seen[i - 1].slice(0, seen[i].length), 'the fold reordered as it shrank').toEqual(seen[i])
    }
    const nonEmpty = seen.filter((s) => s.length > 0)
    expect(nonEmpty[nonEmpty.length - 1], 'the mistake line was not the last to survive').toEqual([
      'mistake',
    ])
  })
})

// ─── F5 / F6 — dominance ─────────────────────────────────────────────────────

/** R6's WEAK distribution: five names, top one at 22% of counted occurrences,
 *  topping ONE week of five, only 1.10x the runner-up. */
const WEAK = (): CalendarCardWeek[] =>
  (
    [
      ['Chased extended', 11], ['Oversized', 10], ['No confirmation', 10],
      ['FOMO entry', 9], ['Held the fade', 9],
    ] as [string, number][]
  ).map(([name, count], i) =>
    cardWeek(`2026-03-${String(1 + i * 7).padStart(2, '0')}`, `2026-03-${String(7 + i * 7).padStart(2, '0')}`, {
      tradeCount: 40, netPnl: 100, daysTraded: 5, daysJournaled: 2,
      topMistake: { name, count },
    }),
  )

/** R6's MODERATE: four names, the top one topping two weeks at 3.56x the next. */
const MODERATE = (): CalendarCardWeek[] =>
  (
    [
      ['Chased extended', 17], ['Chased extended', 15], ['Oversized', 9],
      ['No confirmation', 8], ['FOMO entry', 7],
    ] as [string, number][]
  ).map(([name, count], i) =>
    cardWeek(`2026-03-${String(1 + i * 7).padStart(2, '0')}`, `2026-03-${String(7 + i * 7).padStart(2, '0')}`, {
      tradeCount: 40, netPnl: 100, daysTraded: 5, daysJournaled: 2,
      topMistake: { name, count },
    }),
  )

describe('F5 a month with no dominant mistake says nothing about mistakes', () => {
  for (const f of RAIL) {
    it(`${f}: no line, not an empty one and not a dash`, async () => {
      await composeCalendarCard(card({ weeks: WEAK() }), 'dark', f)
      const mistakeLines = rec.texts.filter((t) => /ACROSS \d+ OF \d+ WEEKS/.test(t))
      expect(
        mistakeLines,
        `${f}: five names within 4% of each other were crowned: ${JSON.stringify(mistakeLines)}`,
      ).toEqual([])
      // ...and the fold DID run — it simply had nothing worth saying about
      // mistakes. Without this the test passes just as well on a card with no
      // fold at all, which is the opposite of what it is for.
      expect(
        foldTexts().length,
        `${f}: no fold at all, so the missing mistake line proves nothing`,
      ).toBeGreaterThan(0)
    })
  }
})

describe('F6 a month with one dominant name among four draws it with its evidence', () => {
  it('the count is the dominant name only, not the month total', async () => {
    await composeCalendarCard(card({ weeks: MODERATE() }), 'dark', 'wide')
    const line = rec.texts.find((t) => /ACROSS \d+ OF \d+ WEEKS/.test(t))
    expect(line, 'the dominant mistake was not drawn').toBeDefined()
    // 17 + 15 = 32 for the dominant. The other three total 24 and must not appear.
    expect(line).toContain('32')
    expect(line).toContain('CHASED EXTENDED')
    expect(line).toContain('2 OF 5 WEEKS')
    expect(line, 'the line summed every name, not the dominant one').not.toContain('56')
  })
})

// ─── F7 — the grid pays nothing ──────────────────────────────────────────────

describe('F7 the fold is carved from the rail, never from the grid', () => {
  for (const f of RAIL) {
    it(`${f}: grid geometry is identical with and without a fold`, () => {
      const px = pxOf(f)
      const grid = cardRegions(f, true).find((r) => r.name === 'grid')!
      // The grid a starved month gets and the grid a roomy month gets are the
      // same grid — cardRegions must not have learned about the rail's problem.
      expect({ x: grid.x, y: grid.y, w: grid.w, h: grid.h }).toEqual(
        FROZEN_GRID[f],
      )
      const rows = visibleRows(buildCells(2026, 3))
      const cells = gridCellBoxes(grid, rows, px)
      expect(cells[0]).toEqual(FROZEN_CELL[f])
    })
  }
})

/** Measured on HEAD before this beat. If these move, the grid paid for the fold. */
const FROZEN_GRID: Record<string, { x: number; y: number; w: number; h: number }> = {
  wide: { x: 32, y: 239, w: 1115, h: 587 },
  portrait: { x: 22, y: 169.5, w: 1036, h: 701 },
}
const FROZEN_CELL: Record<string, { x: number; y: number; w: number; h: number }> = {
  wide: { x: 32, y: 268, w: 150.71428571428572, h: 103.6 },
  portrait: { x: 22, y: 189, w: 142.85714285714286, h: 131.6 },
}

// ─── F8 — the poster and the square are out of scope ─────────────────────────

describe('F8 square and story have no rail and gain no fold', () => {
  for (const f of NO_RAIL) {
    it(`${f}: no rail region, no fold region`, () => {
      const names = cardRegions(f, true).map((r) => r.name)
      expect(names, `${f} grew a rail`).not.toContain('rail')
      expect(names, `${f} grew a fold`).not.toContain('fold')
    })

    it(`${f}: draws not one fold line`, async () => {
      await composeCalendarCard(card(), 'dark', f)
      expect(
        rec.texts.filter((t) => /ACROSS \d+ OF \d+ WEEKS|^JOURNALED \d+ OF \d+ DAYS$|OF NET$/.test(t)),
        `${f} drew a fold line`,
      ).toEqual([])
    })
  }

  it('the poster still draws its own closing line, untouched', async () => {
    await composeCalendarCard(card(), 'dark', 'story')
    // standsOut is true for 1331.73 against this month, so the poster's own
    // BEST DAY line is present — that is the POSTER's footer, not the fold.
    expect(rec.texts.some((t) => t.startsWith('BEST DAY '))).toBe(true)
  })
})

// ═══ BEAT 18 ═══════════════════════════════════════════════════════════════
//
// D1 THE FOLD CROWNED NOISE. Measured on the book: May headlined "OVERSIZED ·
// 3x ACROSS 2 OF 5 WEEKS" with the same weight as March's 54x. Every gate was
// RELATIVE — share is computed against the sum of weekly-winner counts, which
// in May is FOUR, so 3 of 4 reads as 75% and 3.00x the runner-up. Nothing was
// ever measured against the size of the month. Per traded day the two are
// 2.70 and 0.25 — a 10.8x difference, drawn identically.
//
// D2 THE FEE LINE MISQUOTED A LOSS. feeShareOfNet divided by Math.abs(net), so
// a month that lost $1,650 reported "FEES 25.1% OF NET". There is no net to
// take a share of; the fees were added to the loss.
//
// D3 (taste, pre-authorised) the fold was top-packed, leaving 47-69% of its
// region as air at the bottom.

const MAY_WEEKS = (): CalendarCardWeek[] => [
  cardWeek('2026-04-26', '2026-05-02', {
    tradeCount: 3, netPnl: -237.93, netPct: -0.95, totalFees: 12.1, feesPct: 0.05,
    winners: 1, losers: 2, winRate: 0.33, plRatio: 0.5, daysTraded: 1, daysJournaled: 0,
    streak: { kind: 'none', days: 0 }, topMistake: null, scoped: true,
  }),
  cardWeek('2026-05-03', '2026-05-09', {
    tradeCount: 20, netPnl: -481.94, netPct: -1.93, totalFees: 118.2, feesPct: 0.47,
    winners: 9, losers: 11, winRate: 0.45, plRatio: 0.8, daysTraded: 3, daysJournaled: 2,
    streak: { kind: 'loss', days: 4 }, topMistake: { name: 'Oversized', count: 2 },
  }),
  cardWeek('2026-05-10', '2026-05-16', {
    tradeCount: 15, netPnl: -130.32, netPct: -0.52, totalFees: 88.6, feesPct: 0.35,
    winners: 7, losers: 8, winRate: 0.47, plRatio: 0.9, daysTraded: 3, daysJournaled: 1,
    streak: { kind: 'win', days: 2 }, topMistake: { name: 'Oversized', count: 1 },
  }),
  cardWeek('2026-05-17', '2026-05-23', {
    tradeCount: 20, netPnl: -931.11, netPct: -3.72, totalFees: 121.4, feesPct: 0.49,
    winners: 8, losers: 12, winRate: 0.4, plRatio: 0.6, daysTraded: 3, daysJournaled: 3,
    streak: { kind: 'loss', days: 2 }, topMistake: { name: 'No confirmation', count: 1 },
  }),
  cardWeek('2026-05-24', '2026-05-30', {
    tradeCount: 12, netPnl: 131.3, netPct: 0.53, totalFees: 73.35, feesPct: 0.29,
    winners: 7, losers: 5, winRate: 0.58, plRatio: 1.3, daysTraded: 2, daysJournaled: 1,
    streak: { kind: 'win', days: 2 }, topMistake: null,
  }),
]

/** May's card: net is NEGATIVE, which is the whole point of G3. */
const may = (over: Partial<CalendarCardData> = {}) =>
  card({
    monthLabel: 'May 2026', year: 2026, month: 5,
    days: [
      cardDay('2026-05-20', -946.79, 8), cardDay('2026-05-11', -249.51, 6),
      cardDay('2026-05-01', -237.93, 3), cardDay('2026-05-06', -236.84, 6),
      cardDay('2026-05-04', -148.33, 7), cardDay('2026-05-18', 125.58, 5),
      cardDay('2026-05-15', 116.1, 5), cardDay('2026-05-22', -109.9, 6),
      cardDay('2026-05-28', 97.94, 5), cardDay('2026-05-08', -96.77, 7),
      cardDay('2026-05-26', 33.36, 6), cardDay('2026-05-13', 3.09, 6),
    ],
    weeks: MAY_WEEKS(),
    monthPnl: -1650, monthPct: -6.6, monthFees: 413.65, monthFeesPct: 1.65,
    tradeCount: 70, monthWinners: 32, monthLosers: 38, longestGreenRun: 2,
    currentStreak: { kind: 'win', days: 2 },
    ...over,
  })

describe('G1 a mistake with too few occurrences is not a month-level pattern', () => {
  for (const f of RAIL) {
    it(`${f}: May's real 3x across 2 of 5 weeks draws no mistake line`, async () => {
      await composeCalendarCard(may(), 'dark', f)
      const crowned = rec.texts.filter((t) => /ACROSS \d+ OF \d+ WEEKS/.test(t))
      expect(
        crowned,
        `${f}: 3 occurrences over 70 trades and 12 traded days — 0.25 a day — were ` +
          `headlined with the same weight as March's 54x (2.70 a day): ${JSON.stringify(crowned)}`,
      ).toEqual([])
      // and the fold still ran, so the silence is a choice and not an absence
      expect(foldTexts().length, `${f}: no fold at all; G1 proves nothing`).toBeGreaterThan(0)
    })
  }
})

describe('G2 and the floor does not eat the signal it was built to carry', () => {
  for (const f of RAIL) {
    it(`${f}: March's 54x across 4 of 5 still draws`, async () => {
      await composeCalendarCard(card(), 'dark', f)
      expect(rec.texts).toContain('CHASED EXTENDED · 54x ACROSS 4 OF 5 WEEKS')
    })
  }
})

describe('G3 a losing month is not told what share of its net the fees were', () => {
  for (const f of RAIL) {
    it(`${f}: the fee line names the amount, not a share of a net that is not there`, async () => {
      await composeCalendarCard(may(), 'dark', f)
      const fee = rec.texts.find((t) => t.startsWith('FEES '))
      expect(fee, `${f}: no fee line drawn at all`).toBeDefined()
      expect(fee).toBe('FEES $413.65 ON TOP OF THE LOSS')
      expect(fee, 'a loss was given a share of net').not.toContain('OF NET')
      expect(fee, 'a loss was given a percentage').not.toContain('%')
    })
  }
})

describe('G4 and a winning month says exactly what it said before', () => {
  for (const f of RAIL) {
    it(`${f}: March still reads as a share of net`, async () => {
      await composeCalendarCard(card(), 'dark', f)
      expect(rec.texts).toContain('FEES 20.3% OF NET')
    })
  }
})

// ═══ BEAT 20 ═══════════════════════════════════════════════════════════════
//
// G5 WAS TWO PROPERTIES WEARING ONE ASSERTION, and the weaker of them hid a
// blind spot in the stronger.
//
// The beat-18 defect was TWO faults at once: the fold used the MINIMUM leading
// AND packed the block at the top. A single symmetry assertion tested only the
// second, with a tolerance of one whole leading — and on one real geometry it
// cannot test even that:
//
//   2026-03 portrait   fold h=146, five lines at 28  ->  leftover 34
//                      centred puts the block 17 down; px(16) IS 17
//                      -> top-packed and centred are the SAME GEOMETRY.
//
// No tolerance discriminates there, because there is nothing to discriminate.
// So the guard splits. G5a tests the LEADING, which is decisive in every case
// including that one (22->42 wide, 15->28 portrait). G5b tests the CENTRING,
// and states the geometry in which it is capable of testing anything at all.

/** Compose, and read the fold's geometry back off the INK. */
async function foldGeom(f: CalendarCardFormat, data: CalendarCardData) {
  const px = pxOf(f)
  const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
  // THE SAME SLICE THE COMPOSITOR TAKES. It does `data.weeks.slice(0, rows)`
  // with rows from the month's own grid, so a guard that plans over every week
  // it was handed measures a rail the card never drew.
  const rows = visibleRows(buildCells(data.year, data.month))
  const weeks = collapseEmptyWeeks((data.weeks as CalendarCardWeek[]).slice(0, rows))
  const plan = (CC as never as { planRail: typeof CC.planRail }).planRail(rail, weeks, px)
  expect(plan.fold, `${f}: no fold to measure`).not.toBeNull()
  await composeCalendarCard(data, 'dark', f)
  const ys = foldPoints().map((t) => t.y).sort((a, b) => a - b)
  const fold = plan.fold!
  return {
    px,
    fold,
    n: ys.length,
    leading: ys.length > 1 ? ys[1] - ys[0] : 0,
    block: ys.length > 1 ? ys[ys.length - 1] - ys[0] : 0,
    above: ys[0] - fold.y,
    below: fold.y + fold.h - ys[ys.length - 1],
    leftover: fold.h - (ys.length > 1 ? ys[ys.length - 1] - ys[0] : 0),
  }
}

/** drawFold's clamp, RESTATED in scale units rather than imported, so a change
 *  to the source's own formula shows up here as a disagreement. */
const clampLeading = (h: number, n: number, px: (v: number) => number) =>
  n > 1 ? Math.min(px(26), Math.max(px(14), Math.floor((h - px(16) - px(10)) / (n - 1)))) : 0

/** SIX populated weeks on a six-row month. March's grid has five rows, so a
 *  sixth week there is sliced away before it is ever drawn; May 2026 has six.
 *  This is the only shape in reach that exercises the clamp's MIDDLE branch —
 *  every month in the book sits at the cap. */
const SIX_WEEK_MAY = (): CalendarCardWeek[] =>
  [0, 1, 2, 3, 4, 5].map((i) =>
    cardWeek(`2026-0${i < 1 ? 4 : 5}-${String(i < 1 ? 26 : (i - 1) * 7 + 3).padStart(2, '0')}`,
      `2026-05-${String(Math.min(31, i * 7 + 2)).padStart(2, '0')}`, {
      tradeCount: 14, netPnl: -120.5, netPct: -0.48, totalFees: 40.1, feesPct: 0.16,
      winners: 6, losers: 8, winRate: 0.43, plRatio: 0.8, daysTraded: 3, daysJournaled: 2,
      streak: { kind: 'loss', days: 2 }, topMistake: { name: 'Oversized', count: 4 },
    }),
  )

const CASES: [string, CalendarCardFormat, () => CalendarCardData][] = [
  ['2026-03', 'wide', () => card()],
  ['2026-05', 'wide', () => may()],
  ['2026-03', 'portrait', () => card()],
  ['2026-05', 'portrait', () => may()],
  ['six-week May', 'wide', () => may({ weeks: SIX_WEEK_MAY() })],
  ['six-week May', 'portrait', () => may({ weeks: SIX_WEEK_MAY() })],
]

// ─── G5a — THE LEADING. No blind spot; this is the beat-18 disease. ──────────

describe('G5a the fold distributes its leading, and never falls back to the minimum', () => {
  for (const [label, f, mk] of CASES) {
    it(`${f}: ${label} — the measured leading is the clamp's, not the floor`, async () => {
      const gm = await foldGeom(f, mk())
      expect(gm.n, `${f} ${label}: expected a multi-line fold`).toBeGreaterThan(1)

      const want = clampLeading(gm.fold.h, gm.n, gm.px)
      expect(
        gm.leading,
        `${f} ${label}: h=${Math.round(gm.fold.h)} n=${gm.n} drew ${gm.leading}px between ` +
          `baselines; the clamp says ${want}px`,
      ).toBe(want)

      // THE DISCRIMINATING PROPERTY. The beat-18 defect was the minimum leading
      // everywhere; every case in reach distributes strictly wider than it, so
      // this fires on all of them — 2026-03 portrait included, where the
      // centring assertion cannot fire at all.
      expect(
        gm.leading,
        `${f} ${label}: the fold fell back to the px(14) minimum (${gm.px(14)}px)`,
      ).toBeGreaterThan(gm.px(14))
      expect(gm.leading, `${f} ${label}: the leading broke its cap`).toBeLessThanOrEqual(gm.px(26))
    })
  }

  it('and the clamp has a MIDDLE branch, which only the six-week month reaches', async () => {
    // Every month in the book sits at the cap: wide 42 and portrait 28, from
    // folds of 229 and 146. Without this case the middle branch of the clamp is
    // dead code as far as every guard and every export is concerned.
    const atCap: string[] = []
    const mid: string[] = []
    for (const [label, f, mk] of CASES) {
      const gm = await foldGeom(f, mk())
      const raw = Math.floor((gm.fold.h - gm.px(16) - gm.px(10)) / (gm.n - 1))
      ;(raw >= gm.px(26) ? atCap : mid).push(`${label} ${f}`)
    }
    expect(mid, 'no case exercises the clamp between its floor and its cap').not.toEqual([])
    expect(atCap.length, 'no case exercises the cap either').toBeGreaterThan(0)
  })
})

// ─── G5b — THE CENTRING, and the geometry in which it can be tested. ─────────

/** THE LIMIT OF THIS ASSERTION, stated rather than implied.
 *
 *  drawFold centres its block, so the air above equals the air below. A
 *  TOP-PACKED block instead puts px(16) above and the remainder below — which
 *  differs from centred by 2 x |leftover/2 - px(16)|. When the block nearly
 *  fills its region that difference collapses to nothing, and on 2026-03
 *  portrait it collapses to EXACTLY nothing: leftover is 34, half of it is 17,
 *  and px(16) is 17. Centred and top-packed put every baseline in the same
 *  place. No tolerance can separate them because there is nothing between them.
 *
 *  So G5b runs where it can discriminate and says so. G5a covers the rest. */
const discriminates = (leftover: number, px: (v: number) => number) => leftover / 2 !== px(16)

describe('G5b the block is centred — where centred and top-packed differ at all', () => {
  for (const [label, f, mk] of CASES) {
    it(`${f}: ${label} — the air is shared above and below`, async () => {
      const gm = await foldGeom(f, mk())
      if (!discriminates(gm.leftover, gm.px)) {
        // Not a skip for convenience: on this geometry the two layouts ARE the
        // same layout, so asserting symmetry would pass on the defect.
        expect(
          gm.px(16),
          `${label} ${f} was expected to be the blind geometry, but leftover/2 is ` +
            `${gm.leftover / 2} and px(16) is ${gm.px(16)} — it discriminates now, ` +
            `so it must be asserted rather than excused`,
        ).toBe(gm.leftover / 2)
        return
      }
      expect(
        Math.abs(gm.above - gm.below),
        `${f} ${label}: ${gm.above.toFixed(1)}px above the first line and ` +
          `${gm.below.toFixed(1)}px below the last — the block is packed, not placed`,
      ).toBeLessThanOrEqual(1)
    })
  }

  it('and 2026-03 portrait is the one geometry it cannot test, by arithmetic', async () => {
    const gm = await foldGeom('portrait', card())
    expect(gm.leftover, 'the blind case moved').toBe(34)
    expect(gm.px(16)).toBe(17)
    expect(
      gm.leftover / 2,
      'top-packed and centred no longer coincide here — G5b now covers this case ' +
        'and this exclusion should be deleted',
    ).toBe(gm.px(16))
  })
})
