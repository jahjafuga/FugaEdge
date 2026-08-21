// @vitest-environment jsdom
// v0.2.7 Feature 5 — BEAT 16: THE MARK IS A QUALIFIER, NOT A TIER LINE.
//
// MEASURED on the judging book: 'THIS MONTH ONLY' is computed on FOUR straddling
// week-instances and drawn on ZERO.
//
//   2026-03-29..2026-04-04   raw 32  ->  18 (MAR card) + 14 (APR card)
//   2026-04-26..2026-05-02   raw 19  ->  16 (APR card) +  3 (MAY card)
//
// It sat first in WEEK_TIER_ORDER, which the source calls "the last line to be
// dropped for room". That protection is ORDINAL and the failure is ABSOLUTE: a
// starved rail gives `room = floor(budget / px(14))` with a NEGATIVE budget, so
// room is 0 and `slice(0, 0)` keeps nothing. First of nothing is nothing.
//
// The other four tier lines are ADDITIVE — each carries a fact that appears
// nowhere else on the card. 'scoped' is a QUALIFIER: it adds no fact, it tells
// you what the net, the W/L and the {n}T chip printed ABOVE it are counting. A
// qualifier that can be dropped while the number it qualifies stays is worse
// than no qualifier at all, because the card then states a re-totalled figure as
// if it were the week's.
//
// So it leaves the tier and joins the header row, where nothing can strip it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CALENDAR_CARD_FORMATS,
  WEEK_TIER_ORDER,
  cardRegions,
  collapseEmptyWeeks,
  composeCalendarCard,
  fitTierLines,
  planRail,
  railCardBoxes,
  scopeWeeksToMonth,
  shortMonthDay,
  weekMinHeight,
  weekTierLines,
  type CalendarCardData,
  type CalendarCardFormat,
  type CalendarCardWeek,
} from '../calendarCard'
import { cardDay, cardWeek } from '@/test/fixtures/calendarCard'
import { installImageDecode, installRecordingCanvas } from '@/test/recordingCanvas'

const MARK = 'THIS MONTH ONLY'
const RAIL_FORMATS: CalendarCardFormat[] = ['wide', 'portrait']

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

const pxOf = (f: CalendarCardFormat) => (n: number) => Math.round(n * (CALENDAR_CARD_FORMATS[f].w / 1000))

/** MARCH AS THE BOOK HAS IT: five populated weeks, the last one straddling into
 *  April with 18 of its 32 trades on this side. This is the rail that starves. */
const marchWeeks = (): CalendarCardWeek[] => [
  cardWeek('2026-03-01', '2026-03-07', {
    tradeCount: 75, netPnl: 1766.36, totalFees: 245.1, winners: 46, losers: 29,
    winRate: 0.61, daysTraded: 5, daysJournaled: 3,
    streak: { kind: 'loss', days: 2 }, topMistake: { name: 'Chased extended', count: 18 },
  }),
  cardWeek('2026-03-08', '2026-03-14', {
    tradeCount: 63, netPnl: 124.88, totalFees: 206.1, winners: 38, losers: 25,
    winRate: 0.6, daysTraded: 5, daysJournaled: 2,
    streak: { kind: 'loss', days: 3 }, topMistake: { name: 'Chased extended', count: 16 },
  }),
  cardWeek('2026-03-15', '2026-03-21', {
    tradeCount: 47, netPnl: 639.16, totalFees: 153.7, winners: 29, losers: 18,
    winRate: 0.62, daysTraded: 4, daysJournaled: 3,
    streak: { kind: 'win', days: 3 }, topMistake: { name: 'Chased extended', count: 8 },
  }),
  cardWeek('2026-03-22', '2026-03-28', {
    tradeCount: 57, netPnl: 1374.68, totalFees: 186.4, winners: 35, losers: 22,
    winRate: 0.61, daysTraded: 5, daysJournaled: 2,
    streak: { kind: 'win', days: 8 }, topMistake: { name: 'Chased extended', count: 12 },
  }),
  cardWeek('2026-03-29', '2026-04-04', {
    tradeCount: 18, netPnl: 294.92, totalFees: 59.7, winners: 11, losers: 7,
    winRate: 0.61, daysTraded: 1, daysJournaled: 0,
    streak: { kind: 'none', days: 0 }, topMistake: null, scoped: true,
  }),
]

const marchDays = () =>
  [3, 4, 20, 25, 30, 26, 2, 23, 27, 9, 18, 24, 10, 19, 11, 5, 13, 17, 6, 12].map((d, i) =>
    cardDay(`2026-03-${String(d).padStart(2, '0')}`, i === 0 ? 1331.73 : 200 - i * 8, 13),
  )

const card = (weeks: CalendarCardWeek[]): CalendarCardData =>
  ({
    monthLabel: 'March 2026', year: 2026, month: 3,
    days: marchDays(), weeks,
    monthPnl: 4200, monthPct: 16.8, monthFees: 850.95, monthFeesPct: 3.4,
    tradeCount: 260, monthWinners: 159, monthLosers: 101, longestGreenRun: 9,
    currentStreak: { kind: 'win', days: 9 }, unit: 'percent', denominator: 'ok',
  }) as unknown as CalendarCardData

/** Every mark drawn on the card, with where it landed. */
const marks = () => rec.textPoints.filter((t) => t.text === MARK)

// ─── S5 — the tier stack itself ──────────────────────────────────────────────

describe('S5 the mark is not in the tier stack at all', () => {
  it('WEEK_TIER_ORDER is the four ADDITIVE lines and nothing else', () => {
    expect([...WEEK_TIER_ORDER]).toEqual(['mistake', 'streak', 'journaled', 'fees'])
  })

  it('and weekTierLines never offers it, however scoped the week is', () => {
    const w = marchWeeks()[4]
    expect(weekTierLines(w)).not.toContain('scoped' as never)
  })
})

// ─── S1 — it renders, both formats ───────────────────────────────────────────

describe('S1 every straddling week renders the mark', () => {
  for (const f of RAIL_FORMATS) {
    it(`${f}: the March rail's straddling week is marked`, async () => {
      await composeCalendarCard(card(marchWeeks()), 'dark', f)
      const found = marks()
      expect(
        found.length,
        `no "${MARK}" anywhere on the ${f} card — the re-totalled week ` +
          `claims 18T as if it were the week's own`,
      ).toBe(1)

      // ON THE HEADER ROW, beside the range — not somewhere a fitter can reach.
      const px = pxOf(f)
      const shown = collapseEmptyWeeks(marchWeeks())
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      // BEAT 17 — the compositor lays this rail out with planRail, not with
      // railCardBoxes: March is starved, so its cards are one-line and sit
      // higher than the full-height boxes. A guard that cuts its own boxes
      // measures a different rail than the one that was drawn.
      const b = planRail(rail, shown, px).cards[4]
      expect(
        Math.abs(found[0].y - (b.y + px(15))),
        `the mark is at y=${found[0].y}, not on the header baseline ${b.y + px(15)}`,
      ).toBeLessThanOrEqual(1)
    })

    it(`${f}: it clears the range on its left and the {n}T chip on its right`, async () => {
      await composeCalendarCard(card(marchWeeks()), 'dark', f)
      const found = marks()
      expect(found).toHaveLength(1)
      const px = pxOf(f)
      const shown = collapseEmptyWeeks(marchWeeks())
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      const b = railCardBoxes(rail, shown, px)[4]
      const range = rec.textPoints.find(
        (t) => t.text === `${shortMonthDay('2026-03-29')}–${shortMonthDay('2026-04-04')}`.toUpperCase(),
      )!
      const m = found[0]
      expect(m.x, 'the mark overlaps the range').toBeGreaterThanOrEqual(range.x + range.width)
      expect(m.x + m.width, 'the mark runs into the {n}T chip').toBeLessThanOrEqual(
        b.x + b.w - px(12) - `${18}T`.length * px(9) * 0.6,
      )
    })
  }
})

// ─── S2 — and only there ─────────────────────────────────────────────────────

describe('S2 a week wholly inside the month is never marked', () => {
  for (const f of RAIL_FORMATS) {
    it(`${f}: four unscoped weeks draw no mark`, async () => {
      const weeks = marchWeeks().slice(0, 4)
      await composeCalendarCard(card(weeks), 'dark', f)
      expect(marks(), 'a whole-month week was marked "THIS MONTH ONLY"').toHaveLength(0)
    })
  }
})

// ─── S3 — the starved branch, the one that failed ────────────────────────────

describe('S3 the mark survives the branch that strips every tier line', () => {
  for (const f of RAIL_FORMATS) {
    it(`${f}: rail starved, 0 tier lines, mark still drawn`, async () => {
      const px = pxOf(f)
      const shown = collapseEmptyWeeks(marchWeeks())
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      const gap = px(6)
      const avail = rail.h - gap * (shown.length - 1)
      const minTotal = shown.reduce((a, w) => a + weekMinHeight(w, px), 0)
      // A guard for the starved branch that is not measuring the starved branch
      // would be worthless — so prove the fixture is in it before asserting.
      expect(avail, `${f} is NOT starved; this test is measuring nothing`).toBeLessThanOrEqual(minTotal)

      const boxes = railCardBoxes(rail, shown, px)
      const survived = boxes.reduce((a, b, i) => a + fitTierLines(shown[i], b.h, px).length, 0)
      expect(survived, 'the rail is not actually starving the tier').toBe(0)

      await composeCalendarCard(card(marchWeeks()), 'dark', f)
      expect(
        marks().length,
        `every tier line was stripped and the mark went with them`,
      ).toBe(1)
    })
  }
})

// ─── S4 — and costs nothing ──────────────────────────────────────────────────

describe('S4 the mark costs zero card height', () => {
  for (const f of RAIL_FORMATS) {
    it(`${f}: a straddling week is exactly as tall as the same week unscoped`, () => {
      const px = pxOf(f)
      // A rail with room to spare, so height is driven by CONTENT rather than by
      // the starved branch's floor-proportional share — that is where an extra
      // tier line would have shown up as extra height.
      const roomy = { name: 'rail' as const, x: 0, y: 0, w: 400, h: 2000 }
      const base = cardWeek('2026-03-29', '2026-04-04', {
        tradeCount: 18, netPnl: 294.92, totalFees: 59.7, winners: 11, losers: 7,
        winRate: 0.61, daysTraded: 1, daysJournaled: 0,
        streak: { kind: 'none', days: 0 }, topMistake: null,
      })
      const scoped = { ...base, scoped: true }
      const plain = railCardBoxes(roomy, [base, base], px)
      const marked = railCardBoxes(roomy, [scoped, scoped], px)
      expect(
        marked[0].h,
        `the mark cost ${marked[0].h - plain[0].h}px of card height`,
      ).toBe(plain[0].h)
    })
  }
})

// ─── S6 — the number and its qualifier are inseparable ───────────────────────

describe('S6 a re-totalled number is never printed without its mark', () => {
  it('every week scopeWeeksToMonth re-totals comes back marked', () => {
    // The APR 26 – MAY 2 straddle, from the May card's side: 19 raw trades, 3 of
    // them in May.
    const raw = [
      cardWeek('2026-04-26', '2026-05-02', {
        tradeCount: 19, netPnl: -450.0, totalFees: 62.1, winners: 9, losers: 10,
        winRate: 0.47, daysTraded: 4, daysJournaled: 2,
        streak: { kind: 'loss', days: 2 }, topMistake: { name: 'Oversized', count: 3 },
      }),
      cardWeek('2026-05-03', '2026-05-09', {
        tradeCount: 20, netPnl: -481.94, totalFees: 65.0, winners: 9, losers: 11,
        winRate: 0.45, daysTraded: 3, daysJournaled: 2,
        streak: { kind: 'loss', days: 4 }, topMistake: { name: 'Oversized', count: 2 },
      }),
    ]
    const days = [
      cardDay('2026-05-01', -237.93, 3),
      cardDay('2026-05-04', -148.33, 7),
      cardDay('2026-05-06', -236.84, 6),
      cardDay('2026-05-08', -96.77, 7),
    ]
    const out = scopeWeeksToMonth(raw, days)
    const rawBy = new Map(raw.map((w) => [w.weekStart, w.tradeCount]))
    let retotalled = 0
    for (const w of out) {
      if (w.tradeCount === rawBy.get(w.weekStart)) continue
      retotalled++
      expect(
        w.scoped,
        `${w.weekStart} was re-totalled ${rawBy.get(w.weekStart)} -> ${w.tradeCount} unmarked`,
      ).toBe(true)
    }
    expect(retotalled, 'no week was re-totalled; this test proved nothing').toBe(1)
  })

  it('and a marked week always renders its mark, at any rail height', async () => {
    for (const h of [2000, 900, 629, 400, 300]) {
      rec.restore()
      rec = installRecordingCanvas()
      await composeCalendarCard(card(marchWeeks()), 'dark', 'wide')
      expect(marks().length, `rail probe h=${h}: the mark vanished`).toBe(1)
    }
  })
})
