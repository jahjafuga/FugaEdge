// @vitest-environment jsdom
// v0.2.7 Feature 5 — THE COLOUR THE PORT DROPPED, AND THE STRUCTURE. T5..T11.
//
// The app's stat line is coloured — win% gold, winners green, losers red, the
// ratio gold — and the first port flattened it to one grey fillText. That threw
// away the thing the eye actually reads: green over red, before any digit.
//
// Asserted on the FILL IN FORCE at each drawn token, because a card is an image
// and "the right string reached the canvas" says nothing about its colour.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CALENDAR_CARD_FORMATS,
  CALENDAR_CARD_FORMAT_IDS,
  buildCells,
  cardRegions,
  gridCellBoxes,
  visibleRows,
  composeCalendarCard,
  statLine,
  statTokens,
  type CalendarCardData,
  type CalendarCardFormat,
} from '../calendarCard'
import { chartColors } from '../chartColors'
import { cardDay, SPARSE_DAYS, SPARSE_WEEKS } from '@/test/fixtures/calendarCard'
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
const compose = (over: Partial<CalendarCardData> = {}, f: CalendarCardFormat = 'square') =>
  composeCalendarCard(card(over), 'dark', f)

/** Every fill a given string was drawn in. */
const fillsOf = (text: string) =>
  rec.textPoints.filter((t) => t.text === text).map((t) => t.style)

// ─────────────────────────────────────────────────────────────────────────────

describe('T5 the day cell’s stat line is COLOURED, token by token', () => {
  it('the tokens carry the app’s own assignment', () => {
    expect(
      statTokens({ winners: 2, losers: 1, winRate: 0.67, plRatio: 70.25 }).map((t) => [
        t.text,
        t.tone,
      ]),
    ).toEqual([
      ['67%', 'gold'],
      [' · ', 'muted'],
      ['2', 'win'],
      ['/', 'muted'],
      ['1', 'loss'],
      [' · ', 'muted'],
      ['70.25', 'gold'],
    ])
  })

  it('and the plain string is still exactly what the tokens say', () => {
    expect(statLine({ winners: 2, losers: 1, winRate: 0.67, plRatio: 70.25 })).toBe(
      '67% · 2/1 · 70.25',
    )
  })

  it('each token reaches the canvas with its own fill', async () => {
    // The fixture's 31st: 8 trades, all winners -> 100% · 8/0 · 1.50
    await compose()
    expect(fillsOf('100%'), 'win rate is not gold').toContain(DARK.sideA)
    expect(fillsOf('8'), 'winners are not green').toContain(DARK.win)
    expect(fillsOf('/'), 'the slash is not muted').toContain(DARK.axis)
    expect(fillsOf('1.50'), 'the ratio is not gold').toContain(DARK.sideA)
  })

  it('losers draw in the loss tone, not in grey', async () => {
    await compose({
      days: [cardDay('2026-07-30', -4.41, 6, { winners: 2, losers: 4, winRate: 0.33 })],
    })
    expect(fillsOf('4')).toContain(DARK.loss)
  })

  it('and every win-rate token on the card is gold, not just the first', async () => {
    await compose()
    const pct = rec.textPoints.filter((t) => /^\d+%$/.test(t.text))
    expect(pct.length).toBeGreaterThan(0)
    expect(pct.every((t) => t.style === DARK.sideA)).toBe(true)
  })

  it('the tones are the palette’s, resolved not restated', () => {
    const CARD = readFileSync(resolve(process.cwd(), 'src/lib/calendarCard.ts'), 'utf8')
    expect(CARD).toMatch(/tone === 'gold' \? p\.GOLD/)
    expect(CARD).toMatch(/tone === 'win' \? p\.WIN/)
    expect(CARD).toMatch(/tone === 'loss' \? p\.LOSS/)
  })
})

describe('T6 the week rail’s line does the same', () => {
  it('win rate gold, winners green, ratio gold', async () => {
    await compose({}, 'wide')
    expect(fillsOf('50%')).toContain(DARK.sideA)
    expect(fillsOf('8')).toContain(DARK.win)
    expect(fillsOf('2.11')).toContain(DARK.sideA)
  })

  it('and the rail uses the SAME tokeniser as the cell, not a second one', () => {
    // WeeklyPanel and the day cell share one definition in the app; they share
    // one here too, so the two lines cannot drift apart.
    expect(
      statTokens({ winners: 8, losers: 8, winRate: 0.5, plRatio: 2.11 }).map((t) => t.tone),
    ).toEqual(
      statTokens({ winners: 2, losers: 1, winRate: 0.67, plRatio: 70.25 }).map((t) => t.tone),
    )
  })

  it('the rail’s losers are red too', async () => {
    await compose(
      {
        weeks: SPARSE_WEEKS.map((w) =>
          w.tradeCount > 0 ? { ...w, winners: 3, losers: 13 } : w,
        ),
      },
      'wide',
    )
    expect(fillsOf('13')).toContain(DARK.loss)
    expect(fillsOf('3')).toContain(DARK.win)
  })
})

describe('T7 the header W/L is green over red', () => {
  it('the winners and losers carry their own tones', async () => {
    await compose({ monthWinners: 3, monthLosers: 1 })
    expect(rec.texts).toContain('W/L')
    expect(fillsOf('3')).toContain(DARK.win)
    expect(fillsOf('1')).toContain(DARK.loss)
  })

  it('in every format', async () => {
    for (const f of CALENDAR_CARD_FORMAT_IDS) {
      rec.texts.length = 0
      rec.textPoints.length = 0
      await compose({ monthWinners: 3, monthLosers: 1 }, f)
      expect(rec.texts, `${f} lost W/L`).toContain('W/L')
      expect(fillsOf('3'), `${f} drew the winners grey`).toContain(DARK.win)
      expect(fillsOf('1'), `${f} drew the losers grey`).toContain(DARK.loss)
    }
  })

  it('and the label itself stays quiet, like the app’s', async () => {
    await compose()
    expect(fillsOf('W/L')).toEqual([DARK.axis])
  })
})

describe('T8 no new colour literals', () => {
  const CARD = readFileSync(resolve(process.cwd(), 'src/lib/calendarCard.ts'), 'utf8')

  it('not one hex or rgb value of its own', () => {
    const hexes = CARD.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(hexes, `hard-coded colours: ${hexes.join(' ')}`).toEqual([])
    expect(CARD).not.toMatch(/rgba?\(/)
  })

  it('the new border tone is a palette key, not a value', () => {
    expect(CARD).toContain('BORDER: palette.border')
    expect(CARD).not.toMatch(/BORDER:\s*'#/)
  })

  it('and the band wash is the muted token plus alpha', () => {
    expect(CARD).toMatch(/const BAND = `\$\{p\.MUTED\}\$\{alphaHex\(/)
  })
})

describe('T9 the header and footer bands are a surface distinct from the ground', () => {
  const ground = () => rec.shapes.find((s) => s.op === 'fillRect' && s.x === 0 && s.y === 0)!
  const bands = (W: number) =>
    rec.shapes.filter(
      (s) => s.op === 'fillRect' && s.w === W && s.style !== DARK.background,
    )

  it('the header band paints its own fill over the ground', async () => {
    const canvas = await compose()
    expect(ground().style).toBe(DARK.background)
    const header = bands(canvas.width).find((b) => b.y === 0)
    expect(header, 'no header band was painted').toBeTruthy()
    expect(header!.style, 'the header band is the same surface as the ground').not.toBe(
      DARK.background,
    )
  })

  it('and it is the ONLY band — square’s footer moved into the masthead', async () => {
    const canvas = await compose()
    const b = bands(canvas.width)
    expect(b.length, 'expected exactly the masthead band').toBe(1)
    expect(b[0].y).toBe(0)
  })

  it('the bands are a token wash, never a new colour', async () => {
    const canvas = await compose()
    for (const b of bands(canvas.width)) {
      expect(b.style.startsWith(DARK.axis), `${b.style} is not the muted token`).toBe(true)
    }
  })

  it('and the GRID stays the ground — nothing washes the cells', async () => {
    const canvas = await compose()
    const mid = bands(canvas.width).filter(
      (b) => b.y > canvas.height * 0.15 && b.y < canvas.height * 0.6,
    )
    expect(mid, 'something washed the grid').toEqual([])
  })
})

describe('T10 a cell that has something to say carries the app’s border token', () => {
  // RENAMED in beat 11. It was "every in-month cell carries…", which asserted
  // the previous ruling: outline all 31, let the fill carry the state. The
  // August export showed what that costs — 29 empty boxes with two real days
  // hiding among them — so the outline now follows the day, not the calendar.
  //
  // h > 20 so the band HAIRLINES are not counted as cell outlines. They share
  // the token on purpose — the boundary rule is the cell border, at the cell
  // border’s weight — so the two are told apart by shape, not by colour.
  const outlines = () =>
    rec.shapes.filter((s) => s.op === 'stroke' && s.style === DARK.border && s.h > 20)

  it('the outline is --border-default, the token CalendarGrid uses', async () => {
    await compose()
    // 31 -> 4: this July fixture has four traded days and no touched ones.
    expect(outlines()).toHaveLength(4)
  })

  it('and NO out-of-month cell is boxed — asserted per cell, not by count', async () => {
    // REWRITTEN in beat 11b. It was `outlines().length` toBeLessThan(31),
    // calibrated when every in-month cell was outlined. After the cure the
    // actual is 4, so the bound had 27 of slack: all eleven out-of-month cells
    // could sprout boxes and it stayed green. Planted, it did — the exact
    // equality two lines up caught the defect and this bound said nothing.
    //
    // It now reads the LAYOUT — gridCellBoxes, the same function the compositor
    // draws from — and checks each out-of-month cell's own box. ONE box is
    // enough to fail it.
    await compose()
    const px = (n: number) => Math.round(n * (CALENDAR_CARD_FORMATS.square.w / 1000))
    const region = cardRegions('square', true).find((r) => r.name === 'grid')!
    const rows = visibleRows(buildCells(2026, 7))
    const boxes = gridCellBoxes(region, rows, px)
    const cells = buildCells(2026, 7).slice(0, rows * 7)
    const painted = outlines()
    const offenders = cells
      .map((c, i) => ({ c, b: boxes[i] }))
      .filter((x) => !x.c.inMonth)
      .filter((x) =>
        painted.some((s) => Math.abs(s.x - x.b.x) < 2 && Math.abs(s.y - x.b.y) < 2),
      )
      .map((x) => x.c.date)
    expect(offenders, `out-of-month cells were boxed: ${offenders.join(' ')}`).toEqual([])
  })

  it('and no UNTOUCHED in-month cell is boxed either, per cell', async () => {
    await compose()
    const px = (n: number) => Math.round(n * (CALENDAR_CARD_FORMATS.square.w / 1000))
    const region = cardRegions('square', true).find((r) => r.name === 'grid')!
    const rows = visibleRows(buildCells(2026, 7))
    const boxes = gridCellBoxes(region, rows, px)
    const cells = buildCells(2026, 7).slice(0, rows * 7)
    const seen = new Set(SPARSE_DAYS.map((d) => d.date))
    const painted = outlines()
    const offenders = cells
      .map((c, i) => ({ c, b: boxes[i] }))
      .filter((x) => x.c.inMonth && !seen.has(x.c.date))
      .filter((x) =>
        painted.some((s) => Math.abs(s.x - x.b.x) < 2 && Math.abs(s.y - x.b.y) < 2),
      )
      .map((x) => x.c.date)
    expect(offenders, `untouched days were boxed: ${offenders.slice(0, 5).join(' ')}`).toEqual([])
  })

  it('and it is a hairline, not the heavy stroke the card had before', () => {
    // The app's cell border is 1px; px(1) scaled to 2px at 1600 wide.
    const CARD = readFileSync(resolve(process.cwd(), 'src/lib/calendarCard.ts'), 'utf8')
    expect(CARD).toMatch(/ctx\.strokeStyle = p\.BORDER\s*\n\s*ctx\.lineWidth = 1\s*\n/)
  })

  it('the token is the app’s own, exposed on the shared palette', () => {
    // --border-default, what `border-border` resolves to in CalendarGrid.
    expect(chartColors('dark').border).toBe('#2a3142')
    expect(chartColors('light').border).toBe('#e2e6ed')
  })
})

describe('T11 the three day states stay visually distinct', () => {
  const cellFills = (W: number) =>
    rec.shapes.filter((s) => s.op === 'fill' && s.w > 40 && s.w < W / 4 && s.h > 20)

  it('traded fills with heat, touched fills faint, untouched not at all', async () => {
    const canvas = await compose({
      days: [
        cardDay('2026-07-31', 19.24, 8), // traded
        cardDay('2026-07-06', 0, 0, { noTrade: true }), // touched
        // the other twenty-nine July days are untouched
      ],
    })
    const fills = cellFills(canvas.width)
    expect(fills, 'expected exactly one heat fill and one wash').toHaveLength(2)
    const styles = fills.map((f) => f.style)
    expect(styles.some((s) => s.startsWith(DARK.win)), 'no heat fill').toBe(true)
    expect(styles.some((s) => s.startsWith(DARK.axis)), 'no touched wash').toBe(true)
    expect(new Set(styles).size, 'the two states painted the same fill').toBe(2)
  })

  it('the heat fill is stronger than the touched wash', async () => {
    const canvas = await compose({
      days: [cardDay('2026-07-31', 19.24, 8), cardDay('2026-07-06', 0, 0, { noTrade: true })],
    })
    const fills = cellFills(canvas.width)
    const alpha = (s: string) => parseInt(s.slice(-2), 16)
    const heat = fills.find((f) => f.style.startsWith(DARK.win))!
    const wash = fills.find((f) => f.style.startsWith(DARK.axis))!
    expect(alpha(heat.style)).toBeGreaterThan(alpha(wash.style))
  })

  it('and ONLY the two that happened are outlined — the third is bare', async () => {
    // RENAMED in beat 11. It was "but all three are outlined, so the grid still
    // reads as a grid", which is the ruling this beat reverses: an outline
    // around a day nobody traded says something happened there.
    await compose({
      days: [cardDay('2026-07-31', 19.24, 8), cardDay('2026-07-06', 0, 0, { noTrade: true })],
    })
    // 31 -> 2: one traded, one touched, twenty-nine untouched and unboxed.
    expect(
      rec.shapes.filter((s) => s.op === 'stroke' && s.style === DARK.border && s.h > 20),
    ).toHaveLength(2)
  })

  it('and the touched day still says WHICH it was', async () => {
    await compose({
      days: [
        cardDay('2026-07-03', 0, 0),
        cardDay('2026-07-06', 0, 0, { noTrade: true }),
        cardDay('2026-07-07', 0, 0, { noTrade: true, holiday: true }),
      ],
    })
    expect(rec.texts).toContain('no trades')
    expect(rec.texts).toContain('sat out')
    expect(rec.texts).toContain('MARKET CLOSED')
  })
})
