// @vitest-environment jsdom
// v0.2.7 Feature 5 — THE STORY POSTER AND THE EMPHASIS. T4..T8.
//
// A week rail is a reference object: you read it leaning in. Nobody leans into a
// story — it is seen full-screen for about five seconds — so the story format is
// no longer the rail. It is a poster built around one number.
//
// And the net was drawing at the same size as the fees in every other format,
// four numbers at one weight, so nothing on the card was the point of it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CALENDAR_CARD_FORMATS,
  CALENDAR_CARD_FORMAT_IDS,
  cardRegions,
  composeCalendarCard,
  headerHeightOf,
  HEADER_NET_SIZE,
  HEADER_STAT_SIZE,
  HERO_NET_SIZE,
  standsOut,
  STORY_SAFE_BOTTOM,
  STORY_SAFE_TOP,
  type CalendarCardData,
  type CalendarCardFormat,
} from '../calendarCard'
import { cardDay, cardWeek, DENSE_DAYS, SPARSE_DAYS } from '@/test/fixtures/calendarCard'
import { fontSizeOf, installImageDecode, installRecordingCanvas } from '@/test/recordingCanvas'

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

const WEEKS = [
  cardWeek('2026-07-26', '2026-08-01', {
    tradeCount: 16, netPnl: 0.99, netPct: 0.0099, totalFees: 4.32, feesPct: 0.0432,
    winners: 8, losers: 8, winRate: 0.5, plRatio: 2.11, daysTraded: 4, daysJournaled: 3,
    streak: { kind: 'loss', days: 3 }, topMistake: { name: 'Chased entry', count: 4 },
  }),
  cardWeek('2026-08-02', '2026-08-08'),
  cardWeek('2026-08-09', '2026-08-15'),
  cardWeek('2026-08-16', '2026-08-22', { daysJournaled: 2 }),
  cardWeek('2026-08-23', '2026-08-29'),
  cardWeek('2026-08-30', '2026-09-05', { inMonth: false }),
]

function card(over: Partial<CalendarCardData> = {}): CalendarCardData {
  return {
    monthLabel: 'August 2026',
    year: 2026,
    month: 8,
    days: SPARSE_DAYS,
    weeks: WEEKS,
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
const compose = (over: Partial<CalendarCardData> = {}, f: CalendarCardFormat = 'story') =>
  composeCalendarCard(card(over), 'dark', f)

/** The ink box of a drawn string. */
const ink = (t: { x: number; y: number; width: number; size: number; align: string }) => {
  const x0 = t.align === 'center' ? t.x - t.width / 2 : t.align === 'right' ? t.x - t.width : t.x
  return { x0, x1: x0 + t.width, y0: t.y - t.size / 2, y1: t.y + t.size / 2 }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('T4 no readable content outside the safe band', () => {
  it('the band is stated in the module, not guessed at the call site', () => {
    expect(STORY_SAFE_TOP).toBe(250)
    expect(STORY_SAFE_BOTTOM).toBe(1670)
    expect(CALENDAR_CARD_FORMATS.story.h).toBe(1920)
  })

  it('every region the poster lays out is inside it', () => {
    for (const hasNote of [true, false]) {
      for (const r of cardRegions('story', hasNote)) {
        expect(r.y, `${r.name} starts above the band`).toBeGreaterThanOrEqual(STORY_SAFE_TOP)
        expect(r.y + r.h, `${r.name} runs past the band`).toBeLessThanOrEqual(STORY_SAFE_BOTTOM)
      }
    }
  })

  it('and every string drawn on it is too, for both months and both units', async () => {
    for (const over of [{}, { monthLabel: 'June 2026', month: 6, days: DENSE_DAYS }]) {
      for (const unit of ['percent', 'dollars'] as const) {
        rec.textPoints.length = 0
        await compose({ ...over, unit })
        for (const t of rec.textPoints) {
          if (t.text.trim() === '') continue
          const k = ink(t)
          expect(k.y0, `"${t.text}" is above the safe band`).toBeGreaterThanOrEqual(
            STORY_SAFE_TOP - 1,
          )
          expect(k.y1, `"${t.text}" is below the safe band`).toBeLessThanOrEqual(
            STORY_SAFE_BOTTOM + 1,
          )
        }
      }
    }
  })

  it('the background may still fill the frame — only the words are bound', async () => {
    const canvas = await compose()
    const ground = rec.shapes.find((s) => s.op === 'fillRect' && s.x === 0 && s.y === 0)!
    expect(ground.h).toBe(canvas.height)
  })
})

describe('T5 the net is the largest text on the card', () => {
  it('by a wide margin, against every other size drawn', async () => {
    await compose()
    const sizes = rec.textPoints.map((t) => t.size).filter((n) => n > 0)
    const max = Math.max(...sizes)
    const rest = sizes.filter((n) => n < max)
    expect(max).toBe(Math.round(HERO_NET_SIZE * (1080 / 1000)))
    expect(max / Math.max(...rest), 'the hero barely out-sizes the next thing').toBeGreaterThan(2)
  })

  it('and only ONE string is drawn at that size — the net itself', async () => {
    await compose()
    const max = Math.max(...rec.textPoints.map((t) => t.size))
    const biggest = rec.textPoints.filter((t) => t.size === max)
    expect(biggest).toHaveLength(1)
    expect(biggest[0].text).toBe('+0.01%')
  })

  it('it stays the biggest in dollars, and under the mask', async () => {
    for (const over of [{ unit: 'dollars' as const }, {}]) {
      rec.textPoints.length = 0
      await compose(over)
      const max = Math.max(...rec.textPoints.map((t) => t.size))
      expect(rec.textPoints.filter((t) => t.size === max)).toHaveLength(1)
    }
  })
})

describe('T6 story draws a month grid and no week cards', () => {
  it('the layout is the poster, not the rail', () => {
    expect(CALENDAR_CARD_FORMATS.story.layout).toBe('poster')
    const names = cardRegions('story', true).map((r) => r.name)
    expect(names).toContain('grid')
    expect(names).toContain('hero')
    expect(names).not.toContain('rail')
  })

  it('the grid is drawn — the weekday strip is the tell', async () => {
    await compose()
    for (const d of ['SUN', 'WED', 'SAT']) expect(rec.texts).toContain(d)
  })

  it('and no week card is drawn: no range, no NT count, no tier line', async () => {
    await compose()
    expect(rec.texts.some((t) => /–/.test(t) && /^[A-Z]{3} \d/.test(t))).toBe(false)
    expect(rec.texts).not.toContain('No trades')
    // A TIER line, not the poster's own FEES label: the week card's read
    // "3/4 JOURNALED" and "$4.32 FEES", with a value in front.
    expect(rec.texts.some((t) => /\S JOURNALED$/.test(t))).toBe(false)
    expect(rec.texts.some((t) => /\S FEES$/.test(t))).toBe(false)
  })

  it('the poster carries its own brand line and supporting row', async () => {
    await compose()
    expect(rec.texts).toContain('FUGAEDGE')
    expect(rec.texts).toContain('AUGUST 2026')
    expect(rec.texts).toContain('NET')
    for (const l of ['TRADING DAYS', 'TRADES', 'W/L', 'FEES']) expect(rec.texts).toContain(l)
  })

  it('a standout day earns a closing line; an ordinary one does not', async () => {
    // Twice the next best AND a fifth of the month's green.
    expect(standsOut({ pnl: 100 }, [{ pnl: 100 }, { pnl: 10 }, { pnl: 8 }])).toBe(true)
    expect(standsOut({ pnl: 40 }, [{ pnl: 40 }, { pnl: 38 }, { pnl: 35 }])).toBe(false)
    expect(standsOut({ pnl: 12 }, [{ pnl: 12 }])).toBe(true)
  })

  it('and it is drawn when it is earned', async () => {
    await compose({
      days: [
        cardDay('2026-08-03', 200, 4),
        cardDay('2026-08-04', 12, 2),
        cardDay('2026-08-05', -8, 3),
      ],
    })
    expect(rec.texts.some((t) => t.startsWith('BEST DAY AUG 3'))).toBe(true)
  })
})

describe('T7 dead space inside the band is under the stated threshold', () => {
  // STATED: a tenth of the band. Measured on the poster's own regions, the same
  // way every other format is measured — allocation, not ink.
  const BAND = STORY_SAFE_BOTTOM - STORY_SAFE_TOP

  it('the regions tile the band', () => {
    const rs = [...cardRegions('story', true)].sort((a, b) => a.y - b.y)
    let worst = rs[0].y - STORY_SAFE_TOP
    let reach = rs[0].y + rs[0].h
    for (const r of rs) {
      if (r.y > reach) worst = Math.max(worst, r.y - reach)
      reach = Math.max(reach, r.y + r.h)
    }
    worst = Math.max(worst, STORY_SAFE_BOTTOM - reach)
    expect(worst / BAND, `a ${Math.round(worst)}px gap in the band`).toBeLessThanOrEqual(0.1)
  })

  it('and no region hogs it — the grid is the only large one', () => {
    for (const r of cardRegions('story', true)) {
      if (r.name === 'grid') continue
      expect(r.h / BAND, `${r.name} claims ${Math.round((r.h / BAND) * 100)}%`)
        .toBeLessThanOrEqual(0.25)
    }
  })
})

describe('T8 the net out-sizes every other header stat, in every format', () => {
  it('the type scale says so', () => {
    for (const f of CALENDAR_CARD_FORMAT_IDS) {
      expect(HEADER_NET_SIZE[f], `${f}`).toBeGreaterThan(HEADER_STAT_SIZE)
    }
    // Wide carries more than portrait IN PIXELS, which is what a reader sees.
    // In scale UNITS it is smaller, because px() multiplies by canvas width and
    // wide's canvas is half again as wide — comparing units here compared the
    // wrong thing.
    const rendered = (f: CalendarCardFormat) =>
      Math.round(HEADER_NET_SIZE[f] * (CALENDAR_CARD_FORMATS[f].w / 1000))
    expect(rendered('wide')).toBeGreaterThan(rendered('portrait'))
  })

  it('and the canvas agrees — the net is drawn larger than every sibling', async () => {
    for (const f of ['square', 'portrait', 'wide'] as const) {
      rec.textPoints.length = 0
      await compose({}, f)
      const scale = CALENDAR_CARD_FORMATS[f].w / 1000
      const netPx = Math.round(HEADER_NET_SIZE[f] * scale)
      const statPx = Math.round(HEADER_STAT_SIZE * scale)
      const net = rec.textPoints.find((t) => t.size === netPx && t.text.includes('0.01'))
      expect(net, `${f}: the net is not drawn at its own size`).toBeTruthy()
      // Every other stat IN THE MASTHEAD is smaller than the net. Asserted
      // against the NET rather than a fixed supporting size, because the
      // masthead now has two supporting tiers at two different sizes and the
      // rule that matters is "nothing competes with the headline".
      void statPx
      const band = headerHeightOf(f, (n) => Math.round(n * scale))
      const siblings = rec.textPoints.filter(
        (t) => t.y < band && t.size > 0 && t !== net && /^[\d$.,+%-]+$/.test(t.text),
      )
      expect(siblings.length, `${f}: no supporting stats found`).toBeGreaterThan(2)
      for (const sb of siblings) {
        expect(sb.size, `${f}: "${sb.text}" matches the headline`).toBeLessThan(netPx)
      }
    }
  })

  it('the font shorthand actually carries the size the scale states', async () => {
    await compose({}, 'wide')
    const net = rec.textPoints.find((t) => t.text === '+0.01%')!
    expect(fontSizeOf(net.font)).toBe(Math.round(HEADER_NET_SIZE.wide * 1.6))
  })

  it('and square’s footer leads with one figure rather than three equals', async () => {
    await compose({}, 'square')
    const foot = rec.textPoints.filter((t) => t.y > 900 && t.size > 0 && !/^[A-Z /]+$/.test(t.text))
    const sizes = [...new Set(foot.map((t) => t.size))].sort((a, b) => b - a)
    expect(sizes.length, 'the footer draws everything at one size').toBeGreaterThan(1)
  })
})
