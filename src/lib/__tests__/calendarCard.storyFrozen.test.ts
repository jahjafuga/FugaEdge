// @vitest-environment jsdom
// v0.2.7 Feature 5 — STORY IS SIGNED OFF. T13's half of the stand-down.
//
// Lao approved the poster. Everything this beat changes — the square masthead,
// the empty-week collapse, the cell type scale — either belongs to another
// format or lives in a helper story shares. This freezes what story DRAWS so a
// shared helper cannot move it quietly: every string, in order, with its
// position, size, alignment and fill.
//
// If this fails, story changed. That is not automatically wrong — but it must be
// deliberate and it must be said out loud, not discovered later.
//
// BEAT 11a — THE FREEZE WAS OVER AN EMPTY MONTH. It composed SPARSE_DAYS (JULY
// dates) onto an AUGUST card, so all thirty-one in-month cells resolved to
// undefined: no traded day, no touched day, heatAlpha never called, the 0.05
// touched wash never painted. Thirty-one of its thirty-two shape marks were
// identical empty outlines, and not one assertion mentioned a shape at all —
// the whole shape census hung on `length > 90`.
//
// It now composes AUGUST_DAYS on an August card: five traded days across five
// distinct heat alphas in both tones, three touched days across three label
// variants, twenty-three untouched, and out-of-month cells at both ends. And it
// asserts the STATE BREAKDOWN rather than a count, because with four states
// present a count cannot tell them apart — which is exactly the capability the
// next beat needs before it may touch the untouched cell.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildCells,
  cardRegions,
  composeCalendarCard,
  gridCellBoxes,
  visibleRows,
  type CalendarCardData,
} from '../calendarCard'
import { chartColors } from '../chartColors'
import { AUGUST_DAYS, AUGUST_WEEKS, DENSE_DAYS } from '@/test/fixtures/calendarCard'
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

const base = (over: Partial<CalendarCardData> = {}): CalendarCardData => ({
  monthLabel: 'August 2026',
  year: 2026,
  month: 8,
  days: AUGUST_DAYS,
  weeks: AUGUST_WEEKS,
  monthPnl: 168.75,
  monthPct: 1.6875,
  monthFees: 19.98,
  monthFeesPct: 0.1998,
  tradeCount: 74,
  monthWinners: 48,
  monthLosers: 26,
  longestGreenRun: 2,
  currentStreak: { kind: 'loss', days: 1 },
  unit: 'percent',
  denominator: 'ok',
  ...over,
})

/** Everything drawn, as one comparable string per call. */
/** The day-cell shapes: everything painted at exactly one grid cell's size, so a
 *  card border or a band cannot be mistaken for one. */
function cellShapes() {
  const px = (n: number) => Math.round(n * 1.08)
  const grid = cardRegions('story', true).find((r) => r.name === 'grid')!
  const box = gridCellBoxes(grid, visibleRows(buildCells(2026, 8)), px)[0]
  return rec.shapes.filter(
    (s) => Math.abs(s.w - box.w) < 2 && Math.abs(s.h - box.h) < 2,
  )
}

async function fingerprint(over: Partial<CalendarCardData> = {}): Promise<string> {
  rec.textPoints.length = 0
  rec.shapes.length = 0
  await composeCalendarCard(base(over), 'dark', 'story')
  const text = rec.textPoints
    .map((t) => `T|${t.text}|${Math.round(t.x)},${Math.round(t.y)}|${t.size}|${t.align}|${t.style}`)
    .join('\n')
  const shape = rec.shapes
    .map((s) => `S|${s.op}|${Math.round(s.x)},${Math.round(s.y)}|${Math.round(s.w)}x${Math.round(s.h)}|${s.style}`)
    .join('\n')
  return `${text}\n${shape}`
}

describe('T13 STORY IS FROZEN — signed off, and it stays where it was', () => {
  it('the poster draws a stable, non-trivial set of marks', async () => {
    const fp = await fingerprint()
    // A guard that could pass on an empty card is not a guard.
    expect(fp.split('\n').length).toBeGreaterThan(90)
    expect(fp).toContain('T|FUGAEDGE|')
    expect(fp).toContain('T|AUGUST 2026|')
    expect(fp).toContain('T|NET|')
  })

  it('THE STATE BREAKDOWN — a count cannot tell four states apart', async () => {
    await fingerprint()
    const cells = cellShapes()
    // FIVE traded days: one heat fill each, five DISTINCT alphas, both tones.
    const heat = cells.filter(
      (s) => s.op === 'fill' && (s.style.startsWith(DARK.win) || s.style.startsWith(DARK.loss)),
    )
    expect(heat, 'traded days are not painting heat').toHaveLength(5)
    expect(new Set(heat.map((s) => s.style)).size, 'the heat ramp collapsed').toBe(5)
    expect(heat.some((s) => s.style === `${DARK.win}66`), 'HEAT_MAX is unexercised').toBe(true)
    expect(heat.some((s) => s.style.startsWith(DARK.loss)), 'no loss tone drawn').toBe(true)

    // THREE touched days: the 0.05 wash, and nothing else.
    const wash = cells.filter((s) => s.op === 'fill' && s.style === `${DARK.axis}0d`)
    expect(wash, 'touched days are not painting the 0.05 wash').toHaveLength(3)

    // 31 -> 8 in beat 11: the outline follows the DAY now, so only the five
    // traded and three touched cells are boxed. The twenty-three untouched and
    // eleven out-of-month cells are numerals on the ground.
    expect(cells.filter((s) => s.op === 'stroke' && s.style === DARK.border)).toHaveLength(8)
  })

  it('and every label variant a touched day can carry is drawn', async () => {
    const fp = await fingerprint()
    for (const label of ['sat out', 'journaled', 'MARKET CLOSED']) {
      expect(fp, `no touched day rendered "${label}"`).toContain(`T|${label}|`)
    }
  })

  it('composing it twice is byte-identical', async () => {
    expect(await fingerprint()).toBe(await fingerprint())
  })

  it('and its own inputs still drive it — the freeze is not a constant', async () => {
    const a = await fingerprint()
    const b = await fingerprint({ monthLabel: 'June 2026', month: 6, days: DENSE_DAYS })
    expect(a).not.toBe(b)
  })

  it('THE MARKS THEMSELVES, so a shared helper cannot move them quietly', async () => {
    const fp = await fingerprint()
    // Sampled rather than pinned whole: the exact lines that would shift if the
    // masthead, the collapse or the cell type scale reached into story.
    expect(fp).toContain('T|FUGAEDGE|72,283|24|left|')
    expect(fp).toContain('T|AUGUST 2026|1058,283|24|right|')
    expect(fp).toContain('T|NET|540,350|22|center|')
    expect(fp).toContain('T|+1.69%|540,474|104|center|')
    expect(fp).toContain('T|TRADING DAYS|152,597|14|center|')
    expect(fp).toContain('T|SUN|22,715|10|left|')
    // no week card, no footer band, no collapsed strip
    expect(fp).not.toContain('NO TRADES')
    expect(fp).not.toMatch(/T\|[A-Z]{3} \d+–[A-Z]{3} \d+\|/)
  })
})
