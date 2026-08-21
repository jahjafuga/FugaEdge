// @vitest-environment jsdom
// v0.2.7 Feature 5 — NOTHING DRAWS OUTSIDE ITS BOX. T1..T4.
//
// MEASURED from Lao's exports: portrait and wide piled the week rail's
// supporting tier onto the next card (−81px and −109px of room), wide's day cell
// collided "70.25" with "89%" across a cell boundary (60px over), and story gave
// four empty weeks 292px each.
//
// EVERY ONE of those is an element painting outside the box it was given, and
// the dead-space metric could not see any of them — it measures what the layout
// ALLOCATES, and all three defects were allocation-correct and content-wrong.
//
// So this is the invariant that belongs underneath the whole card: a fillText
// lands inside the box that drew it. Vertically always; horizontally by the
// monospace width estimate, which is faithful for JetBrains Mono to within a
// pixel and is exactly the metric the compositor fits against.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CALENDAR_CARD_FORMATS,
  CALENDAR_CARD_FORMAT_IDS,
  buildCells,
  cardRegions,
  collapseEmptyWeeks,
  composeCalendarCard,
  denominatorNote,
  gridCellBoxes,
  railCardBoxes,
  visibleRows,
  weekContentHeight,
  RAIL_GROW_CAP,
  RAIL_ONLY_GROW_CAP,
  type CalendarCardData,
  type CalendarCardFormat,
} from '../calendarCard'
import { cardWeek, DENSE_DAYS, SPARSE_DAYS } from '@/test/fixtures/calendarCard'
import { installImageDecode, installRecordingCanvas } from '@/test/recordingCanvas'
import { readStreamerMode } from '../streamerMode'
import { chartColors } from '../chartColors'

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

/** A full-content week: streak, journaling, a tagged mistake and fees. */
const FULL_WEEKS = [
  cardWeek('2026-07-26', '2026-08-01', {
    tradeCount: 16, netPnl: 0.99, netPct: 0.0099, totalFees: 4.32, feesPct: 0.0432,
    winners: 8, losers: 8, winRate: 0.5, plRatio: 2.11, daysTraded: 4, daysJournaled: 3,
    streak: { kind: 'loss', days: 3 }, topMistake: { name: 'Chased entry', count: 4 },
  }),
  cardWeek('2026-08-02', '2026-08-08', {
    tradeCount: 35, netPnl: -118.31, netPct: -1.18, totalFees: 12.4, feesPct: 0.124,
    winners: 12, losers: 23, winRate: 0.34, plRatio: 0.88, daysTraded: 5, daysJournaled: 5,
    streak: { kind: 'win', days: 4 }, topMistake: { name: 'Held through the fade', count: 7 },
  }),
  cardWeek('2026-08-09', '2026-08-15'),
  cardWeek('2026-08-16', '2026-08-22', { daysJournaled: 2 }),
  cardWeek('2026-08-23', '2026-08-29', {
    tradeCount: 35, netPnl: 39.91, netPct: 0.39, totalFees: 9.1, feesPct: 0.091,
    winners: 30, losers: 5, winRate: 0.86, plRatio: 70.25, daysTraded: 5, daysJournaled: 1,
    streak: { kind: 'win', days: 5 }, topMistake: { name: 'Size too large', count: 2 },
  }),
  cardWeek('2026-08-30', '2026-09-05', { inMonth: false }),
]

/** The widest day a real book produces: 35 trades, every token present. */
const WIDEST_DAY = {
  date: '2026-08-26', pnl: 39.91, pct: 0.39, tradeCount: 35,
  winners: 35, losers: 35, winRate: 1, plRatio: 70.25,
  noTrade: false, holiday: false, hasJournal: false, tags: [] as string[], fees: 9.45,
}

function card(over: Partial<CalendarCardData> = {}): CalendarCardData {
  return {
    monthLabel: 'August 2026',
    year: 2026,
    month: 8,
    days: [...SPARSE_DAYS, WIDEST_DAY],
    weeks: FULL_WEEKS,
    monthPnl: 0.99,
    monthPct: 0.0099,
    monthFees: 4.32,
    monthFeesPct: 0.0432,
    tradeCount: 16,
    monthWinners: 8,
    monthLosers: 8,
    longestGreenRun: 1,
    currentStreak: { kind: 'win', days: 1 },
    unit: 'percent',
    denominator: 'ok',
    ...over,
  }
}

/** Every box a piece of text is allowed to live in, for one composed card. */
function boxesFor(data: CalendarCardData, f: CalendarCardFormat) {
  const spec = CALENDAR_CARD_FORMATS[f]
  const u = spec.w / 1000
  const px = (n: number) => Math.round(n * u)
  const rows = visibleRows(buildCells(data.year, data.month))
  // The note's PRESENCE moves every region below it, and a dollars card has no
  // note. Asking cardRegions for the wrong one shifts the whole box set and
  // reports the card as broken when the guard is.
  const hasNote =
    denominatorNote(data.unit, data.denominator, readStreamerMode()) != null
  const regions = cardRegions(f, hasNote)
  // GRID and RAIL are CONTAINERS, not leaves. Including them let a stat line
  // that spilled its cell pass because it still landed inside the grid — which
  // is exactly the "70.25 over 89%" collision, accepted by the guard meant to
  // catch it. Only the leaf regions are somewhere text may live directly.
  const out: { name: string; x: number; y: number; w: number; h: number }[] = regions
    .filter((r) => r.name !== 'grid' && r.name !== 'rail')
    .map((r) => ({ name: r.name, x: r.x, y: r.y, w: r.w, h: r.h }))
  const grid = regions.find((r) => r.name === 'grid')
  if (grid) {
    for (const [i, b] of gridCellBoxes(grid, rows, px).entries()) {
      out.push({ name: `cell-${i}`, ...b })
    }
    // the weekday strip is the grid's own header row, above the first cell
    out.push({
      name: 'weekdays',
      x: grid.x,
      y: grid.y,
      w: grid.w,
      h: gridCellBoxes(grid, rows, px)[0].y - grid.y,
    })
  }
  const rail = regions.find((r) => r.name === 'rail')
  if (rail) {
    // The rail draws COLLAPSED weeks — consecutive quiet ones are one strip —
    // so the guard must cut the same boxes or it measures a different rail.
    const weeks = collapseEmptyWeeks(data.weeks.slice(0, rows))
    // story's weeks carry their days inline, so their cards reserve a chip row —
    // and lift the growth cap, because there the card IS the layout. Both must
    // match what the compositor passes or the guard measures a different rail.
    const railOnly = false // no format uses a chip-row rail any more
    const cap = railOnly ? RAIL_ONLY_GROW_CAP : RAIL_GROW_CAP
    for (const [i, b] of railCardBoxes(rail, weeks, px, railOnly, cap).entries()) {
      out.push({ name: `week-${i}`, ...b })
    }
  }
  return out
}

/** The estimated ink box of one drawn string. */
function inkBox(t: { x: number; y: number; width: number; size: number; align: string }) {
  const x0 = t.align === 'center' ? t.x - t.width / 2 : t.align === 'right' ? t.x - t.width : t.x
  // textBaseline is 'middle' throughout the card, so the line box straddles y.
  return { x0, x1: x0 + t.width, y0: t.y - t.size / 2, y1: t.y + t.size / 2 }
}

const EPS = 1 // a pixel of rounding slack, not a licence

/** Report every string that paints outside every box it could belong to. */
function overflows(data: CalendarCardData, f: CalendarCardFormat) {
  const boxes = boxesFor(data, f)
  const bad: string[] = []
  for (const t of rec.textPoints) {
    if (t.text.trim() === '') continue
    const k = inkBox(t)
    const fits = boxes.some(
      (b) =>
        k.x0 >= b.x - EPS &&
        k.x1 <= b.x + b.w + EPS &&
        k.y0 >= b.y - EPS &&
        k.y1 <= b.y + b.h + EPS,
    )
    if (!fits) {
      bad.push(
        `"${t.text}" @ ${Math.round(k.x0)},${Math.round(k.y0)}` +
          ` ${Math.round(k.x1 - k.x0)}x${Math.round(k.y1 - k.y0)}`,
      )
    }
  }
  return bad
}

/**
 * Every pair of drawn strings that overlaps.
 *
 * THE CONTAINMENT GUARD MISSED THIS. Both the range and "No trades" sat inside
 * the week card, so "is it in its box" said yes to two lines printed through
 * each other. Containment and collision are different questions and each needs
 * asking.
 *
 * Tokens drawn end to end by drawTokens share an edge exactly, so the test is
 * STRICT overlap with a pixel of slack — touching is how a line is built.
 */
function collisions() {
  const boxes = rec.textPoints
    .filter((t) => t.text.trim() !== '')
    .map((t) => ({ t, k: inkBox(t) }))
  const hits: string[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const xOver = Math.min(a.k.x1, b.k.x1) - Math.max(a.k.x0, b.k.x0)
      const yOver = Math.min(a.k.y1, b.k.y1) - Math.max(a.k.y0, b.k.y0)
      if (xOver > EPS && yOver > EPS) {
        hits.push(
          `"${a.t.text}" @ ${Math.round(a.k.x0)},${Math.round(a.k.y0)}` +
            ` x "${b.t.text}" @ ${Math.round(b.k.x0)},${Math.round(b.k.y0)}` +
            ` (${Math.round(xOver)}x${Math.round(yOver)})`,
        )
      }
    }
  }
  return hits
}

// ─────────────────────────────────────────────────────────────────────────────

describe('T1b NO TWO TEXTS OVERLAP — the guard containment could not be', () => {
  const MONTHS2 = [
    { label: 'August 2026', over: {} },
    { label: 'June 2026 (dense)', over: { monthLabel: 'June 2026', month: 6, days: DENSE_DAYS } },
  ]
  for (const f of CALENDAR_CARD_FORMAT_IDS) {
    for (const m of MONTHS2) {
      for (const unit of ['percent', 'dollars'] as const) {
        it(`${f} · ${m.label} · ${unit}`, async () => {
          await composeCalendarCard(card({ ...m.over, unit }), 'dark', f)
          const hits = collisions()
          expect(hits, `${hits.length} overlapping pair(s): ${hits.join(' | ')}`).toEqual([])
        })
      }
    }
  }

  it('T2 the empty-week card renders BOTH its lines, legibly', async () => {
    await composeCalendarCard(card(), 'dark', 'wide')
    // Uppercase now, so a single quiet week and a collapsed multi-week strip
    // read as the same kind of thing.
    expect(rec.texts, 'the no-trade line is gone').toContain('NO TRADES')
    // Aug 9-15 and Aug 16-22 are consecutive tradeless weeks, so they are ONE
    // strip naming the span rather than two identical bars.
    expect(rec.texts, 'the collapsed span is gone').toContain('AUG 9–AUG 22')
    expect(collisions()).toEqual([])
  })

  it('and the guard is not vacuous — it can see an overlap when there is one', () => {
    // Two strings deliberately stacked: the check must report them.
    rec.textPoints.length = 0
    rec.textPoints.push(
      { text: 'AAAA', x: 10, y: 20, style: '', font: '600 10px m', align: 'left', size: 10, width: 24 },
      { text: 'BBBB', x: 12, y: 22, style: '', font: '600 10px m', align: 'left', size: 10, width: 24 },
    )
    expect(collisions().length).toBe(1)
  })
})

describe('T1 THE OVERFLOW INVARIANT — no text outside the box that drew it', () => {
  const MONTHS = [
    { label: 'August 2026 (sparse + one 35-trade day)', over: {} },
    {
      label: 'June 2026 (dense, twenty-two trading days)',
      over: { monthLabel: 'June 2026', month: 6, days: DENSE_DAYS },
    },
  ]

  for (const f of CALENDAR_CARD_FORMAT_IDS) {
    for (const m of MONTHS) {
      for (const unit of ['percent', 'dollars'] as const) {
        it(`${f} · ${m.label} · ${unit}`, async () => {
          const data = card({ ...m.over, unit })
          await composeCalendarCard(data, 'dark', f)
          const bad = overflows(data, f)
          expect(bad, `${bad.length} string(s) painted outside their box:\n  ${bad.join('\n  ')}`)
            .toEqual([])
        })
      }
    }
  }

  it('and nothing paints outside the CARD itself, in any format', async () => {
    for (const f of CALENDAR_CARD_FORMAT_IDS) {
      const spec = CALENDAR_CARD_FORMATS[f]
      rec.textPoints.length = 0
      await composeCalendarCard(card(), 'dark', f)
      for (const t of rec.textPoints) {
        const k = inkBox(t)
        expect(k.x0, `${f}: "${t.text}" starts left of the frame`).toBeGreaterThanOrEqual(-EPS)
        expect(k.x1, `${f}: "${t.text}" runs past the width`).toBeLessThanOrEqual(spec.w + EPS)
        expect(k.y0, `${f}: "${t.text}" starts above the frame`).toBeGreaterThanOrEqual(-EPS)
        expect(k.y1, `${f}: "${t.text}" runs past the height`).toBeLessThanOrEqual(spec.h + EPS)
      }
    }
  })

  it('the guard can actually see width — it is not vacuous', async () => {
    await composeCalendarCard(card(), 'dark', 'wide')
    const sized = rec.textPoints.filter((t) => t.size > 0 && t.width > 0)
    expect(sized.length, 'no text carried a font size').toBeGreaterThan(20)
    // a 20-character string at 16px must estimate near 192px, not near zero
    const est = 20 * 16 * 0.6
    expect(est).toBeCloseTo(192, 5)
  })
})

describe('T2 a no-trade week is materially shorter than a full one', () => {
  it('the content height reflects the content, not an equal split', () => {
    const px = (n: number) => Math.round(n * 1.08)
    const empty = weekContentHeight(cardWeek('2026-08-09', '2026-08-15'), px)
    const full = weekContentHeight(FULL_WEEKS[0], px)
    expect(full / empty, 'a full week needs at least twice an empty one').toBeGreaterThan(2)
  })

  it('and the rail gives it that, rather than six equal cards', () => {
    for (const f of ['portrait', 'wide'] as const) {
      const spec = CALENDAR_CARD_FORMATS[f]
      const px = (n: number) => Math.round(n * (spec.w / 1000))
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      const boxes = railCardBoxes(rail, FULL_WEEKS, px)
      const emptyBox = boxes[2] // 2026-08-09, no trades
      const fullBox = boxes[0]
      expect(
        fullBox.h / emptyBox.h,
        `${f}: empty ${Math.round(emptyBox.h)} vs full ${Math.round(fullBox.h)}`,
      ).toBeGreaterThan(1.6)
    }
  })

  it('a journal-only week sits between the two', () => {
    const px = (n: number) => Math.round(n * 1.08)
    const empty = weekContentHeight(cardWeek('a', 'b'), px)
    const journaled = weekContentHeight(cardWeek('a', 'b', { daysJournaled: 2 }), px)
    expect(journaled).toBeGreaterThan(empty)
    expect(journaled).toBeLessThan(weekContentHeight(FULL_WEEKS[0], px))
  })
})

describe('T3 the rail formats fill their frame without bloating any one region', () => {
  it('no week card exceeds its format’s growth cap', () => {
    const px = (n: number) => Math.round(n * 1.08)
    // A rail SHARING the frame with a grid keeps the tight cap; rail-only lifts
    // it, because there the card is the layout and the surplus buys bigger day
    // chips rather than air.
    const cases = [
      { f: 'portrait' as const, chips: false, cap: RAIL_GROW_CAP },
      { f: 'wide' as const, chips: false, cap: RAIL_GROW_CAP },
    ]
    for (const c of cases) {
      const scale = CALENDAR_CARD_FORMATS[c.f].w / 1000
      const pxf = (n: number) => Math.round(n * scale)
      const rail = cardRegions(c.f, true).find((r) => r.name === 'rail')!
      for (const [i, b] of railCardBoxes(rail, FULL_WEEKS, pxf, c.chips, c.cap).entries()) {
        const need = weekContentHeight(FULL_WEEKS[i], pxf, c.chips)
        expect(
          b.h / need,
          `${c.f} week ${i} got ${Math.round(b.h)} for ${Math.round(need)} of content`,
        ).toBeLessThanOrEqual(c.cap)
      }
    }
    void px
  })

  it('and a rail still uses its frame — the slack goes somewhere useful', () => {
    for (const f of ['portrait', 'wide'] as const) {
      const scale = CALENDAR_CARD_FORMATS[f].w / 1000
      const px = (n: number) => Math.round(n * scale)
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      const boxes = railCardBoxes(rail, FULL_WEEKS, px)
      const last = boxes[boxes.length - 1]
      const used = last.y + last.h - rail.y
      expect(used / rail.h, `${f} left more than a tenth of its rail empty`)
        .toBeGreaterThan(0.9)
    }
  })

  it('every box stays inside the rail it was cut from', () => {
    for (const f of ['portrait', 'wide'] as const) {
      const spec = CALENDAR_CARD_FORMATS[f]
      const px = (n: number) => Math.round(n * (spec.w / 1000))
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      for (const b of railCardBoxes(rail, FULL_WEEKS, px)) {
        expect(b.y, `${f}: a card starts above the rail`).toBeGreaterThanOrEqual(rail.y - EPS)
        expect(b.y + b.h, `${f}: a card runs past the rail`).toBeLessThanOrEqual(
          rail.y + rail.h + EPS,
        )
      }
    }
  })
})

describe('T4 the day stat line fits its cell at every format', () => {
  it('the widest realistic line fits, or is trimmed until it does', async () => {
    for (const f of CALENDAR_CARD_FORMAT_IDS) {
      if (!cardRegions(f, true).some((r) => r.name === 'grid')) continue
      rec.textPoints.length = 0
      const data = card({ days: [WIDEST_DAY] })
      await composeCalendarCard(data, 'dark', f)
      const bad = overflows(data, f)
      expect(bad, `${f}: ${bad.join(' | ')}`).toEqual([])
    }
  })

  it('and the trim keeps W/L, the irreducible fact', async () => {
    const data = card({ days: [WIDEST_DAY] })
    await composeCalendarCard(data, 'dark', 'wide')
    expect(rec.texts).toContain('35')
    expect(rec.texts).toContain('/')
  })
})

describe('T6 square draws a hairline at its band boundary', () => {
  it('ONE divider now — under the masthead. The footer band is gone.', async () => {
    const canvas = await composeCalendarCard(card(), 'dark', 'square')
    const rules = rec.shapes.filter(
      (s) => s.op === 'stroke' && s.h === 0 && s.w >= canvas.width - 1,
    )
    expect(rules, 'expected exactly the masthead boundary').toHaveLength(1)
  })

  it('at the app’s border token, the weight the cells already use', async () => {
    const canvas = await composeCalendarCard(card(), 'dark', 'square')
    const rules = rec.shapes.filter(
      (s) => s.op === 'stroke' && s.h === 0 && s.w >= canvas.width - 1,
    )
    for (const r of rules) expect(r.style).toBe(chartColors('dark').border)
  })

  it('and it sits at the masthead boundary, not floating in the grid', async () => {
    const canvas = await composeCalendarCard(card(), 'dark', 'square')
    const header = cardRegions('square', true).find((r) => r.name === 'header')!
    const ys = rec.shapes
      .filter((s) => s.op === 'stroke' && s.h === 0 && s.w >= canvas.width - 1)
      .map((s) => Math.round(s.y))
    expect(ys[0]).toBeCloseTo(header.y + header.h, -1)
  })

  it('square has no footer region at all', () => {
    expect(cardRegions('square', true).map((r) => r.name)).not.toContain('footer')
  })
})
