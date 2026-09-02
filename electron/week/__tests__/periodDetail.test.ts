// THE WINDOW IS THE PRIMITIVE; THE WEEK IS ONE CALLER OF IT.
//
// getWeekDetail did everything itself: derived a Saturday from a Sunday, read
// the trades, built the streak map, read the journal range, read week_notes,
// and computed the metrics. Of the lines that touch weekStart or weekEnd, FOUR
// are bounds-only — any two dates would do — and TWO are week-shaped: the
// hardcoded +6, and the week_notes lookup keyed on a week id.
//
// This splits the four from the two. getPeriodDetail takes (from, to) and does
// the bounds-only work. getWeekDetail derives its Saturday, calls it, adds the
// week note, and returns exactly what it always returned.
//
// WHAT THESE CASES ARE FOR. The refactor must be invisible. AC1 lives outside
// the suite because it needs a real book: eight windows of the demo book were
// serialised from the SHIPPED function before anything moved, and the same
// eight are compared byte for byte after. That is a one-time proof, not a
// standing guard, and it is reported rather than pretended into this file.
// What stands here is the COMPOSITION — that the week is the window plus a
// note, and nothing else.
import { describe, expect, it, beforeEach, vi } from 'vitest'

let alls: { sql: string; args: unknown[] }[] = []
let gets: { sql: string; args: unknown[] }[] = []

/** Two traded days inside the week, one before it, so a window that reached
 *  too far or not far enough would show. */
const DAILY = [
  { date: '2026-06-08', pnl: 100 },
  { date: '2026-06-09', pnl: -40 },
  { date: '2026-06-01', pnl: 25 },
]

const NOTE = 'the week note, which the window function must never read'

const mockDb = {
  prepare(sql: string) {
    return {
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        if (/SUM\(net_pnl\)/i.test(sql)) return DAILY
        return [] // the trades list + the journal range
      },
      get: (...args: unknown[]) => {
        gets.push({ sql, args })
        return { text: NOTE } // week_notes
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { getWeekDetail, getPeriodDetail } from '../repo'

beforeEach(() => {
  alls = []
  gets = []
})

const WEEK = '2026-06-07' // Sunday; the Saturday is 2026-06-13
const WEEK_END = '2026-06-13'

const noteReads = () => gets.filter((c) => /FROM week_notes/i.test(c.sql))
const rangeArgs = () =>
  alls.filter((c) => /FROM journal/i.test(c.sql)).map((c) => c.args)

describe('AC the window is the primitive', () => {
  it('AC2 getPeriodDetail takes (from, to) and returns the shape WITHOUT notes', () => {
    const p = getPeriodDetail('2026-06-07', '2026-06-13')
    expect(p.from).toBe('2026-06-07')
    expect(p.to).toBe('2026-06-13')
    expect(p.metrics, 'no metrics came back').toBeTruthy()
    expect(Array.isArray(p.trades)).toBe(true)
    expect(Array.isArray(p.entries)).toBe(true)
    // A NOTE IS NOT A PROPERTY OF A WINDOW. week_notes is keyed on a week id,
    // so the window function has no business reading it and no field to put it
    // in.
    expect('notes' in p, 'the window function grew a notes field').toBe(false)
    expect(noteReads().length, 'the window function read week_notes').toBe(0)
  })

  it('AC3 an arbitrary window is honoured verbatim, not rounded to seven days', () => {
    getPeriodDetail('2026-06-01', '2026-06-30')
    // the journal range read is the cheapest place to see the bounds land
    expect(rangeArgs()[0], 'the window was not passed through').toEqual([
      '2026-06-01',
      '2026-06-30',
    ])
    // and the metrics are computed over the days the map actually holds, with
    // no seven-slot assumption anywhere
    const p = getPeriodDetail('2026-06-01', '2026-06-30')
    expect(p.metrics.dayByDay.length, 'dayByDay is not the traded-day count').toBe(
      p.metrics.tradingDays,
    )
  })

  it('AC4 getWeekDetail IS the window plus the week note, and nothing more', () => {
    const w = getWeekDetail(WEEK)
    alls = []
    gets = []
    const p = getPeriodDetail(WEEK, WEEK_END)
    // COMPOSITION, PINNED. Everything the window produced arrives untouched.
    expect(w.metrics).toEqual(p.metrics)
    expect(w.trades).toEqual(p.trades)
    expect(w.entries).toEqual(p.entries)
    // and the week adds exactly two things: its own labels and the note
    expect(w.weekStart).toBe(WEEK)
    expect(w.weekEnd).toBe(WEEK_END)
    expect(w.notes, 'the week note did not come from week_notes').toBe(NOTE)
  })

  it('AC4b the week still derives its own Saturday, six days on', () => {
    getWeekDetail(WEEK)
    expect(rangeArgs()[0], 'the week window is not Sunday..Saturday').toEqual([
      WEEK,
      WEEK_END,
    ])
  })

  it('AC5 CONTROL: WeekDetail is unchanged in name and in shape', () => {
    // Four fixture files and the IPC handler depend on this. If the refactor
    // renamed or reshaped it they would go red for a reason that has nothing
    // to do with what this beat is for.
    const w = getWeekDetail(WEEK)
    expect(Object.keys(w).sort(), 'WeekDetail changed shape').toEqual([
      'entries',
      'metrics',
      'notes',
      'trades',
      'weekEnd',
      'weekStart',
    ])
    expect(typeof getWeekDetail, 'getWeekDetail stopped being a function').toBe('function')
    expect(getWeekDetail.length, 'getWeekDetail changed arity').toBe(2)
  })
})
