// @vitest-environment jsdom
// v0.2.7 Feature 5 — THE MASTHEAD, THE COLLAPSE, THE CELL SCALE. T1..T12.
//
// Three defects, one shape: a card that spent its room on the wrong things.
//   - square gave a whole band at the bottom to three facts that qualify the
//     net, while the net itself sat level with the fees
//   - four identical NO TRADES bars ate the room the traded weeks needed, which
//     is why the fee line has never once appeared in any format
//   - the day cell's type scaled from CANVAS width, so wide's cell was 6% wider
//     with 48% bigger type: the largest card showed the least per cell

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CALENDAR_CARD_FORMATS,
  CALENDAR_CARD_FORMAT_IDS,
  buildCells,
  cardRegions,
  cellPx,
  collapseEmptyWeeks,
  composeCalendarCard,
  gridCellBoxes,
  HEADER_NET_SIZE,
  MASTHEAD_PRIMARY_SIZE_BY_FORMAT,
  MASTHEAD_STAT_COUNT,
  MASTHEAD_TIERS,
  railCardBoxes,
  visibleRows,
  weekTierLines,
  type CalendarCardData,
  type CalendarCardFormat,
} from '../calendarCard'
import { cardDay, cardWeek } from '@/test/fixtures/calendarCard'

/** AUGUST days — the card under test is August, and July-dated fixtures would
 *  simply not be drawn, which makes every day-cell assertion vacuous. */
const AUG_DAYS = [
  cardDay('2026-08-03', -1.84, 1),
  cardDay('2026-08-04', -12.0, 5),
  cardDay('2026-08-05', -4.41, 2),
  cardDay('2026-08-31', 19.24, 8),
]
/** The widest realistic line, in each month the tests use. */
const widestOn = (date: string) =>
  cardDay(date, 39.91, 35, { winners: 35, losers: 35, winRate: 1, plRatio: 70.25 })
const JUN_DAYS = [
  cardDay('2026-06-01', 3.1, 12),
  cardDay('2026-06-15', 9.66, 17),
  cardDay('2026-06-29', -3.2, 4),
]
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

const FULL = (start: string, end: string, over = {}) =>
  cardWeek(start, end, {
    tradeCount: 16, netPnl: 20.5, netPct: 0.2, totalFees: 4.32, feesPct: 0.0432,
    winners: 10, losers: 6, winRate: 0.62, plRatio: 2.11, daysTraded: 4, daysJournaled: 3,
    streak: { kind: 'win', days: 3 }, topMistake: { name: 'Chased entry', count: 4 },
    ...over,
  })

/** August: one traded week, four consecutive quiet ones, one traded. */
const RUN_WEEKS = [
  FULL('2026-07-26', '2026-08-01'),
  cardWeek('2026-08-02', '2026-08-08'),
  cardWeek('2026-08-09', '2026-08-15'),
  cardWeek('2026-08-16', '2026-08-22'),
  cardWeek('2026-08-23', '2026-08-29'),
  FULL('2026-08-30', '2026-09-05'),
]
/** The same, but with a traded week WEDGED between two quiet ones. */
const GAP_WEEKS = [
  cardWeek('2026-07-26', '2026-08-01'),
  cardWeek('2026-08-02', '2026-08-08'),
  FULL('2026-08-09', '2026-08-15'),
  cardWeek('2026-08-16', '2026-08-22'),
  cardWeek('2026-08-23', '2026-08-29'),
  FULL('2026-08-30', '2026-09-05'),
]

function card(over: Partial<CalendarCardData> = {}): CalendarCardData {
  return {
    monthLabel: 'August 2026',
    year: 2026,
    month: 8,
    days: AUG_DAYS,
    weeks: RUN_WEEKS,
    monthPnl: 41.0,
    monthPct: 0.41,
    monthFees: 8.64,
    monthFeesPct: 0.0864,
    tradeCount: 32,
    monthWinners: 20,
    monthLosers: 12,
    longestGreenRun: 3,
    currentStreak: { kind: 'win', days: 2 },
    unit: 'percent',
    denominator: 'ok',
    ...over,
  }
}
const compose = (over: Partial<CalendarCardData> = {}, f: CalendarCardFormat = 'square') =>
  composeCalendarCard(card(over), 'dark', f)

const px = (f: CalendarCardFormat) => (n: number) =>
  Math.round(n * (CALENDAR_CARD_FORMATS[f].w / 1000))

// ─────────────────────────────────────────────────────────────────────────────

describe('T1 square draws no footer band', () => {
  it('there is no footer region to draw into', () => {
    expect(cardRegions('square', true).map((r) => r.name)).not.toContain('footer')
  })

  it('and no second full-width band is painted', async () => {
    const canvas = await compose()
    void canvas
    const bands = rec.shapes.filter(
      (s) => s.op === 'fillRect' && s.w === canvas.width && s.y > 0,
    )
    expect(bands, 'a band is still being painted below the grid').toEqual([])
  })
})

describe('T5/T7 square carries the net plus THREE, and nothing vanishes silently', () => {
  it('the three that make the net believable, and only those', async () => {
    await compose()
    const header = cardRegions('square', true).find((r) => r.name === 'header')!
    const labels = rec.textPoints
      .filter((t) => t.y < header.y + header.h && /^[A-Z][A-Z /]*$/.test(t.text))
      .map((t) => t.text)
    expect(labels).toEqual(['FUGAEDGE', 'NET', 'TRADING DAYS', 'TRADES', 'W/L'])
  })

  it('fees, green days, best green run and ending streak come OFF square', async () => {
    await compose()
    for (const gone of ['FEES', 'GREEN DAYS', 'BEST GREEN RUN', 'ENDING STREAK']) {
      expect(rec.texts, `${gone} is still on square`).not.toContain(gone)
    }
  })

  it('but they are STILL on portrait and wide — the reference formats', async () => {
    for (const f of ['portrait', 'wide'] as const) {
      rec.texts.length = 0
      await compose({}, f)
      expect(rec.texts, `${f} lost FEES`).toContain('FEES')
    }
  })

  it('one tier everywhere now — the second was the spec-sheet half', () => {
    expect(MASTHEAD_TIERS.square).toBe(1)
    expect(MASTHEAD_STAT_COUNT.square).toBe(3)
    expect(MASTHEAD_STAT_COUNT.portrait).toBe(4)
  })
})

describe('T6 square’s survivors are materially bigger', () => {
  it('30 units against the 17 that shipped — a 1.7x step', () => {
    expect(MASTHEAD_PRIMARY_SIZE_BY_FORMAT.square).toBe(30)
    expect(MASTHEAD_PRIMARY_SIZE_BY_FORMAT.square / 17).toBeGreaterThan(1.7)
  })

  it('and the canvas draws them at that size', async () => {
    await compose()
    const want = Math.round(30 * 1.08)
    const drawn = rec.textPoints.find((t) => t.text === '32')! // trades
    expect(drawn.size).toBe(want)
  })

  it('while still sitting well under the net', async () => {
    await compose()
    const net = rec.textPoints.find((t) => t.text === '+0.41%')!
    const stat = rec.textPoints.find((t) => t.text === '32')!
    expect(stat.size).toBeLessThan(net.size)
    expect(net.size / stat.size).toBeGreaterThan(1.4)
  })
})

describe('T3 the net is the largest text, by a wider margin than before', () => {
  it('square: the net out-sizes everything else on the card', async () => {
    await compose()
    const net = rec.textPoints.find((t) => t.text === '+0.41%')!
    expect(net).toBeTruthy()
    for (const t of rec.textPoints) {
      if (t === net) continue
      expect(t.size, `"${t.text}" matches or beats the headline`).toBeLessThan(net.size)
    }
  })

  it('and by more than it used to — 46 units against the old 26', () => {
    expect(HEADER_NET_SIZE.square).toBe(46)
    expect(HEADER_NET_SIZE.square / 13).toBeGreaterThan(3)
  })
})

describe('T4 the grid gains the height the footer released', () => {
  it('the grid region now runs to the note, with nothing between', () => {
    const rs = cardRegions('square', true)
    const grid = rs.find((r) => r.name === 'grid')!
    const note = rs.find((r) => r.name === 'note')!
    const gap = note.y - (grid.y + grid.h)
    expect(gap, `${Math.round(gap)}px of nothing under the grid`).toBeLessThanOrEqual(
      px('square')(24),
    )
    expect(gap).toBeGreaterThanOrEqual(0)
  })

  it('and its cells are taller than the old footer layout allowed', () => {
    // The old square capped the grid at bodyH - px(72) - px(16) for the band.
    const p = px('square')
    const grid = cardRegions('square', true).find((r) => r.name === 'grid')!
    const rows = visibleRows(buildCells(2026, 8))
    const cell = gridCellBoxes(grid, rows, p)[0]
    const oldGridH = grid.h - p(72) - p(16)
    const oldCellH = (oldGridH - p(18) - p(6) * (rows - 1)) / rows
    expect(cell.h, 'the grid did not grow').toBeGreaterThan(oldCellH)
  })
})

describe('T5 consecutive empty weeks render as one strip naming the span', () => {
  it('four quiet weeks in a row become one entry', () => {
    const out = collapseEmptyWeeks(RUN_WEEKS)
    expect(out).toHaveLength(3)
    expect(out[1].weekStart).toBe('2026-08-02')
    expect(out[1].weekEnd).toBe('2026-08-29')
    expect(out[1].spanned).toBe(4)
  })

  it('and the strip names the span on the card', async () => {
    await compose({}, 'wide')
    expect(rec.texts).toContain('AUG 2–AUG 29')
    expect(rec.texts).toContain('NO TRADES')
  })

  it('a single quiet week is left exactly as it was', () => {
    const one = [FULL('a', 'b'), cardWeek('2026-08-02', '2026-08-08'), FULL('c', 'd')]
    const out = collapseEmptyWeeks(one)
    expect(out).toHaveLength(3)
    expect(out[1].spanned).toBe(1)
    expect(out[1].weekEnd).toBe('2026-08-08')
  })

  it('and the run carries its OWN totals, not one week’s', () => {
    const runs = [
      cardWeek('2026-08-02', '2026-08-08', { totalFees: 1, daysJournaled: 1 }),
      cardWeek('2026-08-09', '2026-08-15', { totalFees: 2, daysJournaled: 3 }),
    ]
    const out = collapseEmptyWeeks(runs)
    expect(out).toHaveLength(1)
    expect(out[0].totalFees).toBe(3)
    expect(out[0].daysJournaled).toBe(4)
  })
})

describe('T6 a gap between empty weeks keeps them separate', () => {
  it('a traded week wedged between two quiet ones ends the run', () => {
    const out = collapseEmptyWeeks(GAP_WEEKS)
    // [quiet, quiet] · traded · [quiet, quiet] · traded
    expect(out).toHaveLength(4)
    expect(out[0].spanned).toBe(2)
    expect(out[0].weekEnd).toBe('2026-08-08')
    expect(out[2].spanned).toBe(2)
    expect(out[2].weekStart).toBe('2026-08-16')
  })

  it('so the card never claims a span that had trades in it', async () => {
    await compose({ weeks: GAP_WEEKS }, 'wide')
    expect(rec.texts).toContain('JUL 26–AUG 8')
    expect(rec.texts).toContain('AUG 16–AUG 29')
    // the lie the naive version would tell
    expect(rec.texts).not.toContain('JUL 26–AUG 29')
  })
})

describe('T7 a populated week draws its FULL tier, including fees', () => {
  for (const f of ['wide', 'portrait'] as const) {
    it(`${f}: streak, journaling, mistake AND fees`, async () => {
      await compose({}, f)
      expect(rec.texts).toContain('3-DAY WIN')
      expect(rec.texts).toContain('3/4 JOURNALED')
      expect(rec.texts).toContain('CHASED ENTRY')
      expect(rec.texts.some((t) => /FEES$/.test(t)), `${f} still drops fees`).toBe(true)
    })
  }

  it('the tier it wants is four lines, and it gets four', () => {
    expect(weekTierLines(RUN_WEEKS[0])).toEqual(['streak', 'journaled', 'mistake', 'fees'])
  })

  it('and the freed room is measurable', () => {
    for (const f of ['wide', 'portrait'] as const) {
      const p = px(f)
      const rail = cardRegions(f, true).find((r) => r.name === 'rail')!
      const before = railCardBoxes(rail, RUN_WEEKS, p)[0].h
      const after = railCardBoxes(rail, collapseEmptyWeeks(RUN_WEEKS), p)[0].h
      expect(after, `${f}: collapsing bought nothing`).toBeGreaterThan(before * 1.5)
    }
  })
})

describe('T8 the collapsed strip has no trades and says so', () => {
  it('trade_count stays 0 through the collapse', () => {
    for (const w of collapseEmptyWeeks(RUN_WEEKS)) {
      if (w.spanned > 1) expect(w.tradeCount).toBe(0)
    }
  })

  it('and the card prints 0T beside the span', async () => {
    await compose({}, 'wide')
    expect(rec.texts).toContain('0T')
  })
})

describe('T9 the day stat line renders untrimmed in every format', () => {
  const MONTHS = [
    { label: 'August 2026', over: { days: [widestOn('2026-08-26'), ...AUG_DAYS] } },
    {
      label: 'June 2026',
      over: {
        monthLabel: 'June 2026',
        month: 6,
        days: [widestOn('2026-06-26'), ...JUN_DAYS],
      },
    },
  ]
  for (const f of CALENDAR_CARD_FORMAT_IDS) {
    for (const m of MONTHS) {
      it(`${f} · ${m.label}`, async () => {
        if (!cardRegions(f, true).some((r) => r.name === 'grid')) return
        rec.texts.length = 0
        await compose(m.over, f)
        // the full line, all three tokens: 100% · 35/35 · 70.25
        expect(rec.texts, `${f} trimmed the ratio`).toContain('70.25')
        expect(rec.texts).toContain('100%')
      })
    }
  }
})

describe('T10 the cell’s type is proportional to cell WIDTH, not canvas width', () => {
  it('the scale comes from the cell', () => {
    expect(cellPx(150)(10)).toBe(10)
    expect(cellPx(300)(10)).toBe(20)
    expect(cellPx(75)(10)).toBe(5)
  })

  it('two formats with near-identical cells get near-identical type', async () => {
    const sizeIn = async (f: CalendarCardFormat) => {
      rec.textPoints.length = 0
      await compose({}, f)
      const grid = cardRegions(f, true).find((r) => r.name === 'grid')!
      const rows = visibleRows(buildCells(2026, 8))
      const cw = gridCellBoxes(grid, rows, px(f))[0].w
      const day = rec.textPoints.find((t) => /^[+-][\d.]+%$/.test(t.text) && t.y > grid.y)!
      return { cw, size: day.size }
    }
    const sq = await sizeIn('square')
    const wd = await sizeIn('wide')
    // wide's cell is ~6% wider than square's; its type must be ~6% bigger, NOT
    // ~48% bigger, which is what canvas-based scaling produced.
    const cellRatio = wd.cw / sq.cw
    const typeRatio = wd.size / sq.size
    expect(typeRatio / cellRatio, `cells ${cellRatio.toFixed(2)}x, type ${typeRatio.toFixed(2)}x`)
      .toBeGreaterThan(0.9)
    expect(typeRatio / cellRatio).toBeLessThan(1.15)
  })
})

describe('T12 portrait gets the masthead too', () => {
  it('its net is the largest text on its card', async () => {
    await compose({}, 'portrait')
    const net = rec.textPoints.find((t) => t.text === '+0.41%')!
    expect(net).toBeTruthy()
    for (const t of rec.textPoints) {
      if (t === net) continue
      expect(t.size, `portrait: "${t.text}" matches the headline`).toBeLessThan(net.size)
    }
  })

  it('and it is a real headline, not the old inline stat', () => {
    expect(HEADER_NET_SIZE.portrait).toBeGreaterThan(26)
  })

  it('every non-poster format now leads with its net', async () => {
    for (const f of ['square', 'portrait', 'wide'] as const) {
      rec.textPoints.length = 0
      await compose({}, f)
      const sizes = rec.textPoints.map((t) => t.size)
      const net = rec.textPoints.find((t) => t.text === '+0.41%')!
      expect(net.size, `${f}`).toBe(Math.max(...sizes))
    }
  })
})
