// @vitest-environment jsdom
// v0.2.7 Feature 5 — START FROM THE APP. T1..T6, T8.
//
// The in-app calendar was better than the card exporting it, so the card stopped
// being a design exercise and became a port: the grid's own cell (badge, hero,
// ONE compact stat line), the grid's own Sunday-first forty-two-cell shape, and
// WeeklyPanel whole — the thing no other journal has.
//
// The equity thread is gone. Over four trading days it was two segments and a
// diagonal: a stray mark, not a signature.
//
// T7's stand-down assertions are NOT restated here. They live in
// calendarCard.test.ts and still run against this module unchanged.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildCells,
  cardRegions,
  collapseEmptyWeeks,
  gridCellBoxes,
  unusedHeightFraction,
  visibleRows,
  CALENDAR_CARD_FORMATS,
  CALENDAR_CARD_FORMAT_IDS,
  composeCalendarCard,
  shortMonthDay,
  statLine,
  type CalendarCardData,
  type CalendarCardFormat,
} from '../calendarCard'
import { cardDay, DENSE_DAYS, SPARSE_DAYS, SPARSE_WEEKS } from '@/test/fixtures/calendarCard'
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

function card(over: Partial<CalendarCardData> = {}): CalendarCardData {
  return {
    monthLabel: 'July 2026',
    year: 2026,
    month: 7,
    days: SPARSE_DAYS,
    weeks: SPARSE_WEEKS,
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
const compose = (over: Partial<CalendarCardData> = {}, f: CalendarCardFormat = 'wide') =>
  composeCalendarCard(card(over), 'dark', f)

// ── Geometry classifiers ────────────────────────────────────────────────────
// Painted boxes, split by width. A week card spans a rail column or the whole
// card; a day cell is one seventh of a grid. The two are far enough apart in
// every layout that width alone separates them.
type Box = { op: string; x: number; y: number; w: number; h: number }
const painted = (): Box[] => rec.shapes.filter((s) => s.op !== 'fillRect' && s.w > 8)
// h > 20 so a full-width hairline divider is not mistaken for a card.
const weekCards = (W: number) => painted().filter((b) => b.w > W / 4.5 && b.h > 20)
/**
 * THE GRID'S OWN EXTENT, read from the LAYOUT rather than from the stroke
 * census.
 *
 * dayCells() counts painted boxes, and since beat 11 only traded and touched
 * days are painted — so on this July fixture it returns four cells, all in row
 * four, columns two to five. Deriving the grid's right edge from that
 * understates it by a column and its bottom by a row. Both assertions below
 * still HELD, which is worse than failing: the test stayed green while its
 * instrument was measuring the wrong box.
 *
 * gridCellBoxes is what the compositor itself draws from, so this cannot drift.
 */
const gridExtent = (f: CalendarCardFormat) => {
  const px = (n: number) => Math.round(n * (CALENDAR_CARD_FORMATS[f].w / 1000))
  const region = cardRegions(f, true).find((r) => r.name === 'grid')!
  const boxes = gridCellBoxes(region, visibleRows(buildCells(2026, 7)), px)
  return {
    right: Math.max(...boxes.map((b) => b.x + b.w)),
    bottom: Math.max(...boxes.map((b) => b.y + b.h)),
  }
}

const DEAD_SPACE_MAX = 0.1

// ─────────────────────────────────────────────────────────────────────────────

describe('T1 no thread is drawn, and the engine is gone from the module', () => {
  const CARD = readFileSync(resolve(process.cwd(), 'src/lib/calendarCard.ts'), 'utf8')

  it('equityThreadPoints is not exported, and not present at all', () => {
    expect(CARD).not.toContain('equityThreadPoints')
    expect(CARD).not.toContain('ThreadPoint')
    expect(CARD).not.toContain('buildEquityCurve')
  })

  it('the module no longer imports the fold it only needed for the thread', () => {
    expect(CARD).not.toContain("from '@/core/performance/equity'")
  })

  it('and nothing thread-shaped is painted across the grid', async () => {
    const canvas = await compose()
    // The thread was the only element painting a path that spanned many cells
    // AND had vertical extent. The band dividers span the width too, but they
    // are hairlines (h === 0), so they are excluded by height rather than by
    // being special-cased.
    const spanning = painted().filter(
      (b) => b.w > canvas.width * 0.9 && b.h > 0 && b.h < 20,
    )
    expect(spanning).toEqual([])
  })
})

describe('T2 a day cell renders the app’s compact stat line, in ONE line', () => {
  it('the line is the app’s: win% · W/L · ratio', () => {
    expect(statLine({ winners: 2, losers: 1, winRate: 0.67, plRatio: 70.25 }))
      .toBe('67% · 2/1 · 70.25')
  })

  it('and each token is dropped when it is not real, never faked', () => {
    expect(statLine({ winners: 0, losers: 0, winRate: null, plRatio: null })).toBe('0/0')
    expect(statLine({ winners: 3, losers: 1, winRate: 0.75, plRatio: null })).toBe('75% · 3/1')
    expect(statLine({ winners: 3, losers: 1, winRate: null, plRatio: 2 })).toBe('3/1 · 2.00')
  })

  it('it is drawn as ONE string, not four stacked lines', async () => {
    await compose()
    expect(rec.texts.filter((t) => t.includes(' · ')).length).toBeGreaterThan(0)
    // the four-line stack the card used to draw is gone
    expect(rec.texts.some((t) => /^\d+W \/ \d+L$/.test(t))).toBe(false)
    expect(rec.texts.some((t) => /^\d+% win$/.test(t))).toBe(false)
    expect(rec.texts.some((t) => /^[\d.]+:1$/.test(t))).toBe(false)
  })

  it('the trade-count badge is the app’s `{n}t`, not a sentence', async () => {
    await compose()
    expect(rec.texts).toContain('8t')
    expect(rec.texts).toContain('5t')
    expect(rec.texts.some((t) => /^\d+ trades?$/.test(t))).toBe(false)
  })

  const TAGGED = {
    days: [
      cardDay('2026-07-31', 19.24, 8, { tags: ['FOMC', 'Earnings'] }),
      ...SPARSE_DAYS.slice(0, 3),
    ],
  }

  it('a tagged day shows its tag where the cell is tall enough', async () => {
    await compose(TAGGED, 'square')
    expect(rec.texts).toContain('FOMC +1')
  })

  it('and wide shows it too now that type scales from the CELL', async () => {
    // It used to be dropped in wide: type scaled from CANVAS width, so a 6%
    // wider cell got 48% bigger type and had no room for a third line. Scaling
    // from the cell put the room back. A cell still decides by its own height.
    await compose(TAGGED, 'wide')
    expect(rec.texts).toContain('FOMC +1')
    expect(rec.texts.filter((t) => t.includes(' · ')).length).toBeGreaterThan(0)
  })

  it('and a holiday says MARKET CLOSED, the app’s own words', async () => {
    await compose({
      days: [cardDay('2026-07-03', 0, 0, { noTrade: true, holiday: true }), ...SPARSE_DAYS],
    })
    expect(rec.texts).toContain('MARKET CLOSED')
  })
})

describe('T3 the week rail renders every element the app’s panel does', () => {
  it('range, trade count, hero, stat line', async () => {
    await compose()
    expect(rec.texts).toContain('JUL 26–AUG 1')
    expect(rec.texts).toContain('16T')
    // The line is COLOURED now, so it reaches the canvas as tokens rather than
    // as one string — win% gold, winners green, losers red. The tones are
    // asserted in calendarCard.colour.test.ts; here it is the content.
    expect(rec.texts.join('')).toContain('50% · 8/8 · 2.11')
    // the hero follows the unit, like every other money figure on the card
    expect(rec.texts).toContain('+0.01%')
    rec.texts.length = 0
    await compose({ unit: 'dollars' })
    expect(rec.texts).toContain('+$0.99')
  })

  it('the streak callout, gated at two days exactly as the panel gates it', async () => {
    await compose()
    expect(rec.texts).toContain('3-DAY LOSS')
  })

  it('journaling coverage', async () => {
    await compose()
    expect(rec.texts).toContain('3/4 JOURNALED')
  })

  it('the top tagged mistake', async () => {
    await compose()
    expect(rec.texts).toContain('CHASED ENTRY')
  })

  // UPPERCASE throughout: WeeklyPanel carries `uppercase tracking-wider` on its
  // range, its trade count and its entire supporting tier, so on screen it reads
  // JUL 26-AUG 1 / 16T / 3-DAY LOSS. The card was drawing them mixed-case.
  it('and the fee drag, IN THE UNIT THE CARD IS DRAWING', async () => {
    // Fees are money. A trader who picked percentages to keep dollar amounts off
    // a shareable image did not mean "except the fee line" — the card was
    // printing $4.32 here and again in the header strip.
    await compose({ unit: 'percent' })
    expect(rec.texts).toContain('0.04% FEES')
    expect(rec.texts.filter((t) => t.includes('$'))).toEqual([])

    rec.texts.length = 0
    await compose({ unit: 'dollars' })
    expect(rec.texts).toContain('$4.32 FEES')
  })

  it('a week with no trades gets the panel’s own reduced variant', async () => {
    await compose()
    expect(rec.texts).toContain('NO TRADES')
    expect(rec.texts).toContain('2 JOURNALED')
  })

  it('the range format is the panel’s shortMonthDay', () => {
    expect(shortMonthDay('2026-07-26')).toBe('Jul 26')
    expect(shortMonthDay('2026-08-01')).toBe('Aug 1')
  })

  it('and one card per drawn row, MINUS the collapsed quiet runs', async () => {
    // July needs five rows, but four of its five weeks are tradeless and
    // consecutive, so they are ONE strip: two cards, each painting a fill and a
    // stroke. Rows and cards no longer map one-to-one, and that is the point.
    const canvas = await compose()
    expect(visibleRows(buildCells(2026, 7))).toBe(5)
    expect(collapseEmptyWeeks(SPARSE_WEEKS.slice(0, 5))).toHaveLength(2)
    expect(weekCards(canvas.width)).toHaveLength(4)
  })

  it('a trailing all-adjacent row is dropped, and a needed one is not', () => {
    // Aug 2026 starts on a Saturday and needs six rows; July needs five.
    expect(visibleRows(buildCells(2026, 8))).toBe(6)
    expect(visibleRows(buildCells(2026, 7))).toBe(5)
  })
})

describe('T4 each format is a different LAYOUT, not a different canvas', () => {
  it('the table names a layout per format, and they are four different ones', () => {
    const layouts = CALENDAR_CARD_FORMAT_IDS.map((f) => CALENDAR_CARD_FORMATS[f].layout)
    expect(new Set(layouts).size).toBe(4)
  })

  it('STORY is a POSTER — a hero net and a compact grid, no week rail', async () => {
    const canvas = await compose({}, 'story')
    expect(CALENDAR_CARD_FORMATS.story.layout).toBe('poster')
    expect(weekCards(canvas.width)).toEqual([])
    // it DOES draw a grid now; the rail is what left
    expect(rec.texts).toContain('SUN')
  })

  it('and story still shows every day of the month', async () => {
    await compose({}, 'story')
    const nums = rec.texts.filter((t) => /^\d{1,2}$/.test(t))
    for (let i = 1; i <= 31; i++) expect(nums, `${i} missing from story`).toContain(String(i))
  })

  it('WIDE puts the rail BESIDE the grid, not below it', async () => {
    const canvas = await compose({}, 'wide')
    const rail = weekCards(canvas.width)
    const grid = gridExtent('wide')
    expect(Math.min(...rail.map((b) => b.x))).toBeGreaterThan(grid.right)
    // and they overlap vertically — beside means beside
    expect(Math.min(...rail.map((b) => b.y))).toBeLessThan(grid.bottom)
  })

  it('PORTRAIT puts the rail BELOW the grid, full width', async () => {
    const canvas = await compose({}, 'portrait')
    const rail = weekCards(canvas.width)
    const grid = gridExtent('portrait')
    expect(Math.min(...rail.map((b) => b.y))).toBeGreaterThan(grid.bottom - 1)
    expect(Math.max(...rail.map((b) => b.w))).toBeGreaterThan(canvas.width * 0.9)
  })

  it('SQUARE is grid plus the totals strip, with no rail', async () => {
    const canvas = await compose({}, 'square')
    expect(weekCards(canvas.width)).toEqual([])
    expect(rec.texts).toContain('SUN')
    expect(rec.texts).toContain('NET')
  })

  it('and every format carries the strip the app’s own header carries', async () => {
    for (const f of CALENDAR_CARD_FORMAT_IDS) {
      rec.texts.length = 0
      await compose({}, f)
      for (const label of ['NET', 'FEES', 'TRADING DAYS', 'TRADES', 'W/L']) {
        // square carries three supporting stats now; the rest live on the
        // reference formats. See MASTHEAD_STAT_COUNT.
        if (f === 'square' && (label === 'FEES' || label === 'TRADING DAYS')) {
          if (label === 'FEES') continue
        }
        expect(rec.texts, `${f} lost ${label}`).toContain(label)
      }
      // the poster uppercases its month label; every other format does not
      const month = f === 'story' ? 'JULY 2026' : 'July 2026'
      expect(rec.texts, `${f} lost the month`).toContain(month)
    }
  })
})

describe('T5 dead space is under the stated threshold', () => {
  // STATED: ten per cent of the card's height.
  //
  // MEASURED ON THE LAYOUT'S ALLOCATION, not on ink — and that took three
  // attempts to get right, each corrected by a planted defect:
  //   1. "how far down the last ink reaches" reads ~100% on every card, because
  //      the denominator note is drawn at the bottom of all of them.
  //   2. a full-width gap scan is horizontally blind: wide's grid could shrink
  //      to two thirds and the full-height rail beside it hid the hole.
  //   3. a per-half gap scan is defeated by the design itself — untouched cells
  //      paint nothing on purpose, so a quiet week and a wasted frame look
  //      identical from outside.
  // What a format claims of its own height is a property of the LAYOUT, so the
  // guard reads the same region list the compositor draws from.
  // STORY IS EXCLUDED, and not as a dodge: the poster deliberately confines
  // every readable thing to the platform safe band (250..1670 of 1920), so 500px
  // of the frame is unallocated ON PURPOSE. Its own version of this rule is T7
  // in calendarCard.poster.test.ts, measured against the band it actually uses.
  for (const f of CALENDAR_CARD_FORMAT_IDS.filter((x) => x !== 'story')) {
    const spec = CALENDAR_CARD_FORMATS[f]
    it(`${f} (${spec.w}x${spec.h}) allocates its frame`, () => {
      const unused = unusedHeightFraction(cardRegions(f, true), f)
      expect(
        unused,
        `${f} allocates nothing to ${Math.round(unused * 100)}% of its height (${Math.round(unused * spec.h)}px)`,
      ).toBeLessThanOrEqual(DEAD_SPACE_MAX)
    })

    it(`${f} allocates it with no note too`, () => {
      expect(unusedHeightFraction(cardRegions(f, false), f)).toBeLessThanOrEqual(DEAD_SPACE_MAX)
    })
  }

  it('and no CHROME band hogs the frame — a fat footer wastes as surely as a hole', () => {
    // Allocation alone cannot see this: a three-hundred-unit footer with a
    // shrunken grid still tiles the body perfectly. But two lines of text in a
    // band that deep is the same waste with a label on it. Only the grid and the
    // rail — the elements that actually scale with content — may be large.
    //
    // The ceiling moved 15% -> 20% when the header took the headline. A band
    // carrying the largest element on the card is not chrome in the sense this
    // rule was written for; wide's is 158 of 900 = 17.6%, and shrinking it would
    // mean shrinking the net, which is the opposite of the intent.
    //
    // The poster's regions are measured against its safe band in T7, not here.
    for (const f of CALENDAR_CARD_FORMAT_IDS.filter((x) => x !== 'story')) {
      const spec = CALENDAR_CARD_FORMATS[f]
      for (const r of cardRegions(f, true)) {
        // HEADER joins grid and rail as exempt, and not by ratcheting the
        // number a second time: headerHeightOf DERIVES the band from the sizes
        // it draws, term by term, so it cannot be "far larger than its content"
        // by construction. This rule exists for a band chosen independently of
        // what goes in it — the 300px footer holding two lines of text.
        if (r.name === 'grid' || r.name === 'rail' || r.name === 'header') continue
        expect(
          r.h / spec.h,
          `${f}/${r.name} claims ${Math.round((r.h / spec.h) * 100)}% of the height`,
        ).toBeLessThanOrEqual(0.2)
      }
    }
  })

  it('the regions never overlap and never leave the frame', () => {
    for (const f of CALENDAR_CARD_FORMAT_IDS) {
      const spec = CALENDAR_CARD_FORMATS[f]
      for (const r of cardRegions(f, true)) {
        expect(r.y, `${f}/${r.name} starts above the frame`).toBeGreaterThanOrEqual(0)
        expect(r.y + r.h, `${f}/${r.name} runs past the frame`).toBeLessThanOrEqual(spec.h)
        expect(r.x + r.w, `${f}/${r.name} runs past the width`).toBeLessThanOrEqual(spec.w)
        expect(r.h, `${f}/${r.name} has no height`).toBeGreaterThan(0)
      }
    }
  })

  it('and a dense month does not overflow the frame it was given', async () => {
    const canvas = await composeCalendarCard(
      card({ monthLabel: 'June 2026', month: 6, days: DENSE_DAYS }),
      'dark',
      'story',
    )
    const bottoms = rec.shapes.filter((s) => s.op !== 'fillRect').map((s) => s.y + s.h)
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(canvas.height)
  })
})

describe('T6 one format control, not four', () => {
  const CTL = readFileSync(
    resolve(process.cwd(), 'src/components/calendar/CalendarShareControl.tsx'),
    'utf8',
  )

  it('the four segments are gone; a single menu trigger replaces them', () => {
    expect(CTL).toContain('data-testid="card-format-button"')
    expect(CTL).toContain('aria-haspopup="menu"')
    expect(CTL).not.toContain('aria-label="Card format"')
  })

  it('and it wears the app’s existing trigger idiom, not a fifth style', () => {
    // ColumnsMenu's: the shared class string, a chevron that rotates, and a
    // click-away catcher. Sharing the characters, not a convention.
    expect(CTL).toContain("from '@/components/trades/viewControlClasses'")
    expect(CTL).toContain('viewControlIdle')
    expect(CTL).toContain('ChevronDown')
    expect(CTL).toContain('rotate-180')
    // The catcher is still there; it moved into the portal alongside the panel,
    // at the app's own measured scale (see CalendarShareControl.menu.test.tsx).
    expect(CTL).toContain('fixed inset-0 z-[44]')
  })

  it('every format is still reachable — one control, four items', () => {
    expect(CTL).toContain('CALENDAR_CARD_FORMAT_IDS.map')
    expect(CTL).toContain('role="menuitemradio"')
  })

  it('and each item says what the format DOES, not just how big it is', () => {
    for (const f of CALENDAR_CARD_FORMAT_IDS) {
      expect(CTL, `${f} has no hint`).toMatch(new RegExp(`${f}: '[^']+'`))
    }
    expect(CTL).toContain('FORMAT_HINT')
  })
})

describe('T8 nothing is invented', () => {
  const CARD = readFileSync(resolve(process.cwd(), 'src/lib/calendarCard.ts'), 'utf8')
  const CHART = readFileSync(resolve(process.cwd(), 'src/lib/chartScreenshot.ts'), 'utf8')
  const CORE = readFileSync(resolve(process.cwd(), 'src/core/calendar/monthCardData.ts'), 'utf8')

  it('no colour literal of its own', () => {
    const hexes = CARD.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(hexes, `hard-coded colours: ${hexes.join(' ')}`).toEqual([])
    expect(CARD).not.toMatch(/rgba?\(/)
  })

  it('heat and the rail are palette tokens plus transparency', () => {
    expect(CARD).toContain("from '@/lib/chartColors'")
    expect(CARD).toMatch(/\$\{alphaHex\(/)
  })

  it('every number is formatted by the app’s own formatters', () => {
    expect(CARD).toMatch(/import \{ int, money, percent, signed \} from '@\/lib\/format'/)
  })

  it('the P&L ratio is the app’s one derivation, not a second copy', () => {
    // The card never divides; the mapping does it once, the way the grid cell
    // and WeeklyPanel both do (metrics.ts winLossRatio).
    // The compositor never divides averages; the mapping does it once, exactly
    // as the grid cell and WeeklyPanel do (metrics.ts winLossRatio).
    expect(CARD).not.toMatch(/\/ Math\.abs\(/)
    expect((CORE.match(/Math\.abs\(l\)/g) ?? []).length).toBe(1)
  })

  it('the week is a field-for-field lift of WeeklySummary', () => {
    expect(CORE).toContain('export function weekOf')
  })

  it('the icons are the app’s own assets', () => {
    const spec = /import iconUrl from '([^']+)'/
    expect(CARD.match(spec)?.[1]).toBe(CHART.match(spec)?.[1])
    expect(CARD).toContain("import closedSignUrl from '@/assets/closed-sign.svg'")
  })

  it('the grid shape is the app’s, ported not reinvented', () => {
    expect(CARD).toContain('export function buildCells')
    const cells = buildCells(2026, 8)
    expect(cells).toHaveLength(42)
    // 2026-08-01 is a Saturday -> index 6 in a Sunday-first row
    expect(cells[6]).toEqual({ date: '2026-08-01', day: 1, inMonth: true })
  })

  it('and the same font stack and unit rule as the chart card', () => {
    const font = /const FONT = '([^']+)'/
    expect(CARD.match(font)?.[1]).toBe(CHART.match(font)?.[1])
    expect(CARD).toContain('W / 1000')
    expect(CARD).toMatch(/px = \(n: number\): number => Math\.round\(n \* unitPx\)/)
  })
})
