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
  type CalendarCardDay,
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
/** THE FOLD IS FOUND BY GEOMETRY, NOT BY WORDING.
 *
 *  Five times in this arc a detector that enumerated phrasings went blind the
 *  moment a phrasing changed. Beat 28 ends the argument: a wrapped entry's rows
 *  are a user-authored mistake name split at word boundaries, and no regex can
 *  recognise those. The fold is whatever is drawn inside the fold's own box. */
let lastCompose: { data: CalendarCardData; f: CalendarCardFormat } | null = null
async function compose(data: CalendarCardData, f: CalendarCardFormat) {
  lastCompose = { data, f }
  return composeCalendarCard(data, 'dark', f)
}
const foldBox = () => {
  if (!lastCompose) return null
  const { data, f } = lastCompose
  const rail = cardRegions(f, true).find((r) => r.name === 'rail')
  if (!rail) return null
  const rows = visibleRows(buildCells(data.year, data.month))
  const weeks = collapseEmptyWeeks((data.weeks as CalendarCardWeek[]).slice(0, rows))
  return (CC as never as { planRail: typeof CC.planRail }).planRail(rail, weeks, pxOf(f)).fold
}

/** Kept only for the few assertions that still name a phrasing directly. */
// Matched on the marker each kind keeps in EVERY rendering, not on a list of
// phrasings — beat 27 made all of them shrinkable and a vocabulary detector
// goes blind the moment one shortens.
const foldPoints = () => {
  const box = foldBox()
  if (!box) return []
  return rec.textPoints.filter(
    (t) => t.y >= box.y - 1 && t.y <= box.y + box.h + 1 && t.x >= box.x - 1 && t.x <= box.x + box.w + 1,
  )
}
const foldTexts = () => foldPoints().map((t) => t.text)

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

      await compose(card(), f)
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

      await compose(june(), f)
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
      await compose(card(), f)
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
      await compose(card({ weeks: WEAK() }), f)
      const mistakeLines = rec.texts.filter((t) => / · \d+x/.test(t))
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
    await compose(card({ weeks: MODERATE() }), 'wide')
    const line = rec.texts.find((t) => / · \d+x/.test(t))
    expect(line, 'the dominant mistake was not drawn').toBeDefined()
    // 17 + 15 = 32 for the dominant. The other three total 24 and must not appear.
    expect(line).toContain('32')
    expect(line).toContain('CHASED EXTENDED')
    // '2 OF 5 WEEKS' full, '2/5 WEEKS' shortened — the evidence, either way.
    expect(line).toMatch(/2\s*(OF|\/)\s*5\s*WEEKS/)
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
      await compose(card(), f)
      expect(
        rec.texts.filter((t) => /ACROSS \d+ OF \d+ WEEKS|^JOURNALED \d+ OF \d+ DAYS$|OF NET$/.test(t)),
        `${f} drew a fold line`,
      ).toEqual([])
    })
  }

  it('the poster still draws its own closing line, untouched', async () => {
    await compose(card(), 'story')
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
      await compose(may(), f)
      const crowned = rec.texts.filter((t) => / · \d+x/.test(t))
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
      await compose(card(), f)
      expect(
        rec.texts.some((t) => t.startsWith('CHASED EXTENDED · 54x')),
        `March's mistake line lost its evidence: ${JSON.stringify(foldTexts())}`,
      ).toBe(true)
    })
  }
})

describe('G3 a losing month is not told what share of its net the fees were', () => {
  for (const f of RAIL) {
    it(`${f}: the fee line names the amount, not a share of a net that is not there`, async () => {
      await compose(may(), f)
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
      await compose(card(), f)
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
  await compose(data, f)
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

// ═══ BEAT 26 ═══════════════════════════════════════════════════════════════
//
// MEASURED: 2026-05 lost $1,650 and its fold read journaling coverage, a green
// streak and fees. 2026-05-20 alone was -$946.79 — 46.7% of the month's gross
// loss and 57.4% of its net — and the card never mentioned it. There is a BEST
// DAY line and there was no counterpart.
//
// CONCENTRATION IS MEASURED AGAINST GROSS LOSS, NOT NET. A green month with one
// ugly day is exactly the case worth catching, and net hides it: 2026-03 nets
// +$4,200 and still lost $721 across six days.
//
// AND THE SMALL-N TRAP IS THE SAME ONE BEAT 18 FELL INTO. Concentration alone
// is highest where there is least to concentrate:
//
//        losers   gross loss   worst        share    vs runner-up
//   03      6      $721.17     -$151.14     21.0%       1.01x
//   04      5     $1082.92     -$277.02     25.6%       1.01x
//   05      7     $2026.07     -$946.79     46.7%       3.79x   <- the case
//   06      2      $299.31     -$193.95     64.8%       1.84x
//   real-07 3       $18.25      -$12.00     65.8%       2.72x
//
// A bare share gate tuned to catch 46.7% also crowns a $12 loss on a month that
// netted a dollar. So three gates, the same shape as the mistake floor.

// The stable part: the date and the share. The trailing words shrink.
const CONC_RE = /^WORST DAY .+ · \d+%/

/** A GREEN month carrying one concentrated loss day. This is the case that
 *  proves the line is about concentration and not about sign. */
const GREEN_WITH_UGLY_DAY = (): CalendarCardDay[] => [
  cardDay('2026-03-02', 900, 12), cardDay('2026-03-03', 850, 11),
  cardDay('2026-03-04', 700, 10), cardDay('2026-03-05', 640, 9),
  cardDay('2026-03-06', 610, 8),
  cardDay('2026-03-09', -900, 14), // the ugly day: 74.4% of gross loss, 9.0x the next
  cardDay('2026-03-10', -100, 6), cardDay('2026-03-11', -80, 5),
  cardDay('2026-03-12', -70, 5), cardDay('2026-03-13', -60, 4),
]

/** Five losing days within 8% of each other — a bad month, not a bad DAY. */
const EVEN_LOSSES = (): CalendarCardDay[] => [
  cardDay('2026-03-02', 300, 8),
  cardDay('2026-03-03', -200, 9), cardDay('2026-03-04', -195, 8),
  cardDay('2026-03-05', -190, 8), cardDay('2026-03-06', -188, 7),
  cardDay('2026-03-09', -185, 7),
]

/** No losing day at all. */
const ALL_GREEN = (): CalendarCardDay[] =>
  [420, 380, 310, 260, 240].map((v, i) => cardDay(`2026-03-0${i + 2}`, v, 9))

describe('W1 a month with one dominating loss day says so', () => {
  for (const f of RAIL) {
    it(`${f}: 2026-05 names 2026-05-20 and its concentration`, async () => {
      await compose(may(), f)
      const line = rec.texts.find((t) => CONC_RE.test(t))
      expect(
        line,
        `${f}: -$946.79 on 2026-05-20 was 46.7% of the month's losses and the ` +
          `card said nothing about it`,
      ).toBeDefined()
      expect(line).toContain('MAY 20')
      expect(line, 'the line carries no evidence').toMatch(/\d+%/)
    })
  }
})

describe('W2 a month whose losses are spread draws no such line', () => {
  for (const f of RAIL) {
    it(`${f}: five losing days within 8% of each other`, async () => {
      await compose(card({ days: EVEN_LOSSES(), monthPnl: -658 }), f)
      const hits = rec.texts.filter((t) => CONC_RE.test(t))
      expect(hits, `${f}: a bad month was reported as a bad day: ${JSON.stringify(hits)}`).toEqual([])
      // nothing drawn in its place, and the fold DID run
      expect(rec.texts.filter((t) => /^WORST DAY/.test(t))).toEqual([])
      expect(foldTexts().length, `${f}: no fold at all; W2 proves nothing`).toBeGreaterThan(0)
    })
  }
})

describe('W3 a GREEN month with one ugly day still says so', () => {
  for (const f of RAIL) {
    it(`${f}: the line is about concentration, not sign`, async () => {
      await compose(card({ days: GREEN_WITH_UGLY_DAY(), monthPnl: 2490 }), f)
      const line = rec.texts.find((t) => CONC_RE.test(t))
      expect(
        line,
        `${f}: a month that netted +$2,490 lost $900 in one day and the card ` +
          `only mentions it if the MONTH is red`,
      ).toBeDefined()
      expect(line).toContain('MAR 9')
    })
  }
})

describe('W4 and never on a month with no losing day at all', () => {
  for (const f of RAIL) {
    it(`${f}: five green days, no worst-day line`, async () => {
      await compose(card({ days: ALL_GREEN(), monthPnl: 1610 }), f)
      expect(rec.texts.filter((t) => /^WORST DAY/.test(t))).toEqual([])
    })
  }
})

describe('W5 it sits below the mistake and above journaling', () => {
  it('FOLD_TIER_ORDER states the position explicitly', () => {
    expect([...CC.FOLD_TIER_ORDER]).toEqual(['mistake', 'worst', 'journaled', 'flex', 'fees'])
  })

  it('and foldLines emits in that same order', () => {
    const data = card({ days: GREEN_WITH_UGLY_DAY(), monthPnl: 2490 })
    const kinds = (CC as never as { foldLines: typeof CC.foldLines })
      .foldLines(data, collapseEmptyWeeks(MARCH_WEEKS())).map((l) => l.kind)
    const rank = (k: string) => [...CC.FOLD_TIER_ORDER].indexOf(k as never)
    for (let i = 1; i < kinds.length; i++) {
      expect(
        rank(kinds[i]),
        `foldLines emitted ${kinds[i]} after ${kinds[i - 1]}, against FOLD_TIER_ORDER`,
      ).toBeGreaterThanOrEqual(rank(kinds[i - 1]))
    }
    expect(kinds).toContain('worst')
  })
})

describe('W6 BEST DAY and the worst-day line can both appear', () => {
  it('neither suppresses the other', async () => {
    // A standout winner AND a concentrated loser in one month.
    const days: CalendarCardDay[] = [
      cardDay('2026-03-02', 3000, 20), // standsOut: 3.5x the next, 60% of green
      cardDay('2026-03-03', 850, 11), cardDay('2026-03-04', 700, 10),
      cardDay('2026-03-05', 460, 9),
      cardDay('2026-03-09', -900, 14),
      cardDay('2026-03-10', -100, 6), cardDay('2026-03-11', -80, 5),
      cardDay('2026-03-12', -70, 5), cardDay('2026-03-13', -60, 4),
    ]
    await compose(card({ days, monthPnl: 3800 }), 'wide')
    const best = rec.texts.find((t) => /^BEST DAY /.test(t))
    const worst = rec.texts.find((t) => CONC_RE.test(t))
    expect(best, 'the best-day line vanished').toBeDefined()
    expect(worst, 'the worst-day line vanished').toBeDefined()
    // and the worst line comes FIRST — it is higher in FOLD_TIER_ORDER
    const yOf = (t: string) => rec.textPoints.find((p) => p.text === t)!.y
    expect(yOf(worst!), 'the worst line drew below the best line').toBeLessThan(yOf(best!))
  })
})

describe('W7 2026-06 is untouched', () => {
  for (const f of RAIL) {
    it(`${f}: not starved, no fold, cards byte-identical`, () => {
      const px = pxOf(f)
      const shown = collapseEmptyWeeks(JUNE_WEEKS())
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      const plan = (CC as never as { planRail: typeof CC.planRail }).planRail(rail, shown, px)
      expect(plan.starved, `${f}: June should not be starved`).toBe(false)
      expect(JSON.stringify(plan.cards)).toBe(JSON.stringify(railCardBoxes(rail, shown, px)))
    })
  }
})

// ═══ BEAT 27 ═══════════════════════════════════════════════════════════════
//
// THE FOLD HAS NEVER MEASURED A LINE AGAINST ITS REGION. Four line kinds have
// shipped and drawFold calls fillText with no measureText anywhere near it.
//
// SEEN: May wide's worst-day line clipped its final S. MEASURED, and it is not
// the only one, nor the first:
//
//        wide usable 361px (37 chars at px(10) mono)
//   2026-03  "CHASED EXTENDED · 54x ACROSS 4 OF 5 WEEKS"      394px   +33  CLIPPED
//   2026-05  "WORST DAY MAY 20 · 47% OF THE MONTH'S LOSSES"   422px   +61  CLIPPED
//
// The March line has been clipped since the fold shipped. And the app's own
// seeded vocabulary is worse than either: ALL 21 default mistake names overflow
// wide, the longest by 273px --
//   "HIGH-VOLUME PULLBACK (WANTED LOW VOLUME) · 54x ACROSS 4 OF 5 WEEKS"
//
// PORTRAIT IS NOT THE BINDING CASE. Its rail is the full card width (usable
// 1010px, 153 chars) because it sits BELOW the grid; wide's is a column beside
// it. Wide is binding by 2.8x, and nothing in either book overflows portrait.

/** The card's own inset convention: px(12) each side, as drawWeekCard uses for
 *  its range and its right-aligned chip. */
const foldUsable = (w: number, px: (n: number) => number) => w - px(12) * 2
const widthOf = (t: string, px: (n: number) => number) => t.length * px(10) * 0.6

/** Every fold line the given card draws, with its region, for every rail format. */
function foldLinesOf(f: CalendarCardFormat, data: CalendarCardData) {
  const px = pxOf(f)
  const rows = visibleRows(buildCells(data.year, data.month))
  const weeks = collapseEmptyWeeks((data.weeks as CalendarCardWeek[]).slice(0, rows))
  const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
  const plan = (CC as never as { planRail: typeof CC.planRail }).planRail(rail, weeks, px)
  if (!plan.fold) return null
  const all = (CC as never as { foldLines: typeof CC.foldLines }).foldLines(data, weeks)
  const fit = (CC as never as { fitFoldLines: typeof CC.fitFoldLines })
    .fitFoldLines(all, plan.fold.h, px)
  return { px, fold: plan.fold, lines: fit }
}

const BOOK_MONTHS: [string, () => CalendarCardData][] = [
  ['2026-03', () => card()],
  ['2026-05', () => may()],
]

describe('O1 every fold line fits inside its region', () => {
  for (const f of RAIL) {
    for (const [ym, mk] of BOOK_MONTHS) {
      it(`${f}: ${ym} draws nothing wider than the fold`, async () => {
        const gm = foldLinesOf(f, mk())
        expect(gm, `${f} ${ym}: no fold`).not.toBeNull()
        await compose(mk(), f)
        const drawn = foldPoints()
        expect(drawn.length, `${f} ${ym}: nothing drawn`).toBeGreaterThan(0)
        const usable = foldUsable(gm!.fold.w, gm!.px)
        for (const t of drawn) {
          const w = widthOf(t.text, gm!.px)
          expect(
            Math.round(w),
            `${f} ${ym}: "${t.text}" is ${Math.round(w)}px in a ${Math.round(usable)}px ` +
              `fold — ${Math.round(w - usable)}px of it is off the card`,
          ).toBeLessThanOrEqual(Math.round(usable))
        }
      })
    }
  }
})

/** The longest name in the app's OWN seeded vocabulary (migrate-mistakes-taxonomy). */
const LONGEST_SEEDED = 'High-volume pullback (wanted low volume)'

describe('O2 and the app\'s own default vocabulary fits too', () => {
  for (const f of RAIL) {
    it(`${f}: the longest seeded mistake name`, async () => {
      const weeks = MARCH_WEEKS().map((w) =>
        w.topMistake ? { ...w, topMistake: { name: LONGEST_SEEDED, count: w.topMistake.count } } : w,
      )
      const data = card({ weeks })
      const gm = foldLinesOf(f, data)
      expect(gm).not.toBeNull()
      await compose(data, f)
      const usable = foldUsable(gm!.fold.w, gm!.px)
      for (const t of foldPoints()) {
        const w = widthOf(t.text, gm!.px)
        expect(
          Math.round(w),
          `${f}: "${t.text}" is ${Math.round(w)}px in ${Math.round(usable)}px`,
        ).toBeLessThanOrEqual(Math.round(usable))
      }
    })
  }
})

describe('O3 and a name nobody would ever type still fits', () => {
  for (const f of RAIL) {
    it(`${f}: an 80-character mistake name`, async () => {
      const absurd = 'A'.repeat(80)
      const weeks = MARCH_WEEKS().map((w) =>
        w.topMistake ? { ...w, topMistake: { name: absurd, count: w.topMistake.count } } : w,
      )
      const data = card({ weeks })
      const gm = foldLinesOf(f, data)
      expect(gm).not.toBeNull()
      await compose(data, f)
      const usable = foldUsable(gm!.fold.w, gm!.px)
      for (const t of foldPoints()) {
        expect(
          Math.round(widthOf(t.text, gm!.px)),
          `${f}: "${t.text}" overflowed`,
        ).toBeLessThanOrEqual(Math.round(usable))
      }
    })
  }
})

describe('O4 nothing is shortened that did not need to be', () => {
  it('portrait: all five of March\'s lines are drawn byte-identical', async () => {
    // Portrait's fold is 1010px usable — 153 chars. Nothing in either book comes
    // close, so every string must survive untouched.
    const gm = foldLinesOf('portrait', card())!
    await compose(card(), 'portrait')
    const drawn = foldPoints().map((t) => t.text)
    expect(drawn).toEqual(gm.lines.map((l) => l.text))
    expect(drawn).toHaveLength(5)
  })

  it('wide: only the line that overflows changes', async () => {
    const gm = foldLinesOf('wide', card())!
    const usable = foldUsable(gm.fold.w, gm.px)
    await compose(card(), 'wide')
    const drawn = foldPoints().map((t) => t.text)
    expect(drawn).toHaveLength(gm.lines.length)
    gm.lines.forEach((l, i) => {
      if (widthOf(l.text, gm.px) <= usable) {
        expect(drawn[i], `a line that fitted was shortened anyway`).toBe(l.text)
      }
    })
    // and the one that did not fit is different, and still carries its evidence
    const changed = gm.lines.filter((l, i) => drawn[i] !== l.text)
    expect(changed, 'March wide has exactly one overflowing line').toHaveLength(1)
    expect(changed[0].kind).toBe('mistake')
  })
})

// ═══ BEAT 28 ═══════════════════════════════════════════════════════════════
//
// Beat 27 stopped the clipping and introduced a worse reading. Wide's fold
// budget is 37 characters; the app's own longest seeded mistake name is 40, so
// the ladder ran out and the elision produced
//
//   "HIGH-VOLUME PULLBACK (WANTED L… · 54x"
//
// — the name cut mid-word and the weeks gone. RULED: wrap to two lines, full
// name on one and full evidence on the next, as the LAST rung after the whole
// ladder. Short names keep their compact single line.
//
// ONLY THE MISTAKE LINE WRAPS. Measured, every other kind is bounded by a
// format string and its ladder resolves inside the narrowest real budget:
// worst 44ch (ladder rung 2 is 32), fees 37ch, streak 27ch, journaled 23ch,
// best-day 14ch. The mistake name is user-authored and therefore unbounded —
// it is the only one that can outrun a ladder.
//
// THE CARD HAS NO INDENT CONVENTION. Checked all four places a subordinate
// line exists: the week card draws its range, hero, stat line and every tier
// line at the same lx; the masthead puts label and value at the same x; the
// day cell and the poster centre everything. Subordination is carried by SIZE
// and ALPHA, never by position. So an indent here is a first, and it is
// chosen deliberately — see the cure's own note.

const LONGEST_SEEDED_NAME = 'High-volume pullback (wanted low volume)'

const withMistake = (name: string, over: Partial<CalendarCardData> = {}) =>
  card({
    weeks: MARCH_WEEKS().map((w) =>
      w.topMistake ? { ...w, topMistake: { name, count: w.topMistake.count } } : w,
    ),
    ...over,
  })

/** Every string drawn inside the fold, top to bottom. */
const foldDrawn = () => foldPoints().sort((a, b) => a.y - b.y).map((t) => t.text)

describe('R1a the longest seeded name keeps its whole name AND its whole evidence', () => {
  it('wide: it wraps to two lines rather than eliding', async () => {
    await compose(withMistake(LONGEST_SEEDED_NAME), 'wide')
    const drawn = foldDrawn()
    const head = drawn.find((t) => t.startsWith('HIGH-VOLUME'))
    expect(head, `no mistake line at all: ${JSON.stringify(drawn)}`).toBeDefined()
    // The whole name survives across however many rows it needs — wide's budget
    // is 37 chars and this name is 40, so two rows is not reachable and it takes
    // three. What must NOT happen is a word cut in half.
    const i = drawn.indexOf(head!)
    const evidence = drawn.indexOf('54x ACROSS 4 OF 5 WEEKS')
    expect(evidence, 'the evidence line is missing entirely').toBeGreaterThan(i)
    const nameRows = drawn.slice(i, evidence)
    expect(
      nameRows.join(' '),
      `the name was cut mid-word instead of wrapping: ${JSON.stringify(nameRows)}`,
    ).toBe(LONGEST_SEEDED_NAME.toUpperCase())
    for (const r of nameRows) expect(r, `"${r}" was elided`).not.toContain('…')
    expect(drawn[evidence]).not.toContain('…')
  })
})

describe('R2a a short name still draws on one line, unchanged', () => {
  it('wide: March is byte-identical to beat 27', async () => {
    await compose(card(), 'wide')
    const drawn = foldDrawn()
    expect(drawn).toContain('CHASED EXTENDED · 54x IN 4/5 WEEKS')
    expect(drawn.filter((t) => t === 'CHASED EXTENDED')).toEqual([])
  })
})

describe('R3a every line of a wrapped entry fits its region', () => {
  for (const f of RAIL) {
    it(`${f}: the longest seeded name, both halves`, async () => {
      const data = withMistake(LONGEST_SEEDED_NAME)
      const gm = foldLinesOf(f, data)!
      await compose(data, f)
      const usable = foldUsable(gm.fold.w, gm.px)
      for (const t of foldDrawn()) {
        expect(
          Math.round(widthOf(t, gm.px)),
          `${f}: "${t}" overflows`,
        ).toBeLessThanOrEqual(Math.round(usable))
      }
    })
  }
})

describe('R4a a wrapped entry counts as two lines', () => {
  it('wide: the clamp and the centring both see the extra line', async () => {
    const data = withMistake(LONGEST_SEEDED_NAME)
    const gm = foldLinesOf('wide', data)!
    await compose(data, 'wide')
    const ys = foldPoints().map((t) => t.y).sort((a, b) => a - b)
    // 5 entries, one of which wraps -> 6 drawn lines
    // 4 other entries + a 3-row mistake entry = 7 drawn lines.
    expect(ys.length, 'the wrap did not add lines').toBe(7)
    const px = gm.px
    const want = Math.min(px(26), Math.max(px(14), Math.floor((gm.fold.h - px(16) - px(10)) / 6)))
    expect(ys[1] - ys[0], 'the leading ignored the wrapped line').toBe(want)
    const above = ys[0] - gm.fold.y
    const below = gm.fold.y + gm.fold.h - ys[ys.length - 1]
    expect(Math.abs(above - below), 'the block is not centred over 6 lines').toBeLessThanOrEqual(1)
  })
})

describe('R5a wrapping is the last resort', () => {
  it('a name that fits at a later ladder rung does not wrap', async () => {
    // "Chased extended" fails rung 1 (41ch) and fits rung 2 (34ch) in wide.
    await compose(card(), 'wide')
    const drawn = foldDrawn()
    expect(drawn, 'it wrapped when a rung would have done').not.toContain('CHASED EXTENDED')
    expect(drawn).toContain('CHASED EXTENDED · 54x IN 4/5 WEEKS')
  })
})

describe('R6a wrapping does not remove the floor', () => {
  it('an 80-character name still elides rather than clipping', async () => {
    const absurd = 'A'.repeat(80)
    const data = withMistake(absurd)
    const gm = foldLinesOf('wide', data)!
    await compose(data, 'wide')
    const usable = foldUsable(gm.fold.w, gm.px)
    const drawn = foldDrawn()
    for (const t of drawn) {
      expect(Math.round(widthOf(t, gm.px)), `"${t}" overflows`).toBeLessThanOrEqual(Math.round(usable))
    }
    // it could not wrap (the head alone does not fit), so it elided
    expect(drawn.some((t) => t.includes('…')), 'nothing elided; what was drawn?').toBe(true)
  })
})

describe('R7a portrait is untouched', () => {
  for (const [ym, mk] of BOOK_MONTHS) {
    it(`portrait: ${ym} strings are byte-identical to foldLines`, async () => {
      const gm = foldLinesOf('portrait', mk())!
      await compose(mk(), 'portrait')
      expect(foldDrawn()).toEqual(gm.lines.map((l) => l.text))
    })
  }

  it('portrait: even the longest seeded name stays on one line', async () => {
    const data = withMistake(LONGEST_SEEDED_NAME)
    await compose(data, 'portrait')
    expect(foldDrawn()).toContain(
      `${LONGEST_SEEDED_NAME.toUpperCase()} · 54x ACROSS 4 OF 5 WEEKS`,
    )
  })
})
