// THE MONTH IS ONE WINDOW, AND IT IS THE SAME WINDOW.
//
// getPeriodDetail already takes a start and an end (beat 260) and was driven
// across a whole calendar month before any month code existed to call it. The
// month repo adds exactly one thing: turning 'YYYY-MM' into that pair. So the
// case that matters is not what the numbers ARE — it is that they are the
// window function's own, asserted against the FUNCTION rather than against a
// literal anyone could have typed to match.
//
// MONTH BOUNDS ARE CALENDAR DAYS. Not the six grid weeks the calendar draws:
// June 2026's grid reaches back to May 31 and on to July 4, and a month that
// summed those would count eleven days it does not own.
//
// The mock-db shape is periodDetail.test.ts's, so the two read alike.
import { describe, expect, it, beforeEach, vi } from 'vitest'

let alls: { sql: string; args: unknown[] }[] = []

/** Traded days inside June, plus one on either side of it. A window that
 *  reached to the grid's edges instead of the month's would pick up May 31
 *  and July 1 and the equality below would fail. */
const DAILY = [
  { date: '2026-06-08', pnl: 100 },
  { date: '2026-06-09', pnl: -40 },
  { date: '2026-05-31', pnl: 25 },
  { date: '2026-07-01', pnl: 70 },
]

const mockDb = {
  prepare(sql: string) {
    return {
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        if (/SUM\(net_pnl\)/i.test(sql)) return DAILY
        return []
      },
      get: (...args: unknown[]) => {
        alls.push({ sql, args })
        return undefined
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { getMonthDetail } from '../repo'
import { getPeriodDetail } from '../../week/repo'

beforeEach(() => {
  alls = []
})

const rangeArgs = () => alls.filter((c) => /FROM journal/i.test(c.sql)).map((c) => c.args)

describe('AG4 the month detail IS the period detail on the month window', () => {
  it('AG4 getMonthDetail IS getPeriodDetail over startOfMonth..endOfMonth, plus the note', () => {
    const got = getMonthDetail('2026-06')
    alls = []
    const want = getPeriodDetail('2026-06-01', '2026-06-30')
    // ASSERTED AGAINST THE FUNCTION, not against numbers. If the month ever
    // stops being a window of the book this fails no matter what the numbers
    // happen to be that day.
    //
    // BEAT 265 WROTE THIS AS ONE DEEP-EQUAL, because a month was a window and
    // nothing else. Beat 266 gave it a note of its own, so the equality is
    // false by design -- and field by field is the stronger form anyway: a
    // month that recomputed a metric of its own would pass a whole-object
    // comparison the moment the shape it is compared against also moved.
    expect(got.from).toBe(want.from)
    expect(got.to).toBe(want.to)
    expect(got.metrics).toEqual(want.metrics)
    expect(got.trades).toEqual(want.trades)
    expect(got.entries).toEqual(want.entries)

    // and the month adds EXACTLY what it declares. BEAT 265 listed six keys
    // (the window's five plus its note); beat 267 added the weeks ladder. The
    // list is spelled out rather than counted so a field arriving without
    // anyone declaring it still fails here.
    expect(Object.keys(got).sort()).toEqual([
      'entries',
      'from',
      'ladder',
      'metrics',
      'notes',
      'to',
      'trades',
    ])
    expect(Array.isArray(got.ladder), 'the ladder is not a list').toBe(true)
    expect('ladder' in want, 'a window grew a ladder').toBe(false)
    expect(typeof got.notes, 'the note is not a string').toBe('string')
    expect('notes' in want, 'a window grew a note').toBe(false)
  })

  it('AG4b the window is CALENDAR DAYS, never the grid weeks', () => {
    getMonthDetail('2026-06')
    expect(rangeArgs()[0], 'the month did not ask for its own calendar days').toEqual([
      '2026-06-01',
      '2026-06-30',
    ])
    // the grid's own span, for contrast — a month that used it would ask for
    // these instead, and this is the pair the assertion above rules out
    expect(rangeArgs()[0]).not.toEqual(['2026-05-31', '2026-07-04'])
  })

  it('AG4c month ends are honoured: 30-day, 31-day, February, leap February', () => {
    for (const [id, from, to] of [
      ['2026-06', '2026-06-01', '2026-06-30'],
      ['2026-07', '2026-07-01', '2026-07-31'],
      ['2026-02', '2026-02-01', '2026-02-28'],
      ['2024-02', '2024-02-01', '2024-02-29'],
      ['2026-12', '2026-12-01', '2026-12-31'],
    ] as const) {
      alls = []
      const d = getMonthDetail(id)
      expect([d.from, d.to], `${id} resolved to the wrong window`).toEqual([from, to])
    }
  })

  it('AG4d CONTROL: a month is NOT a week — the seven-day shape cannot pass', () => {
    const june = getMonthDetail('2026-06')
    const week = getPeriodDetail('2026-06-07', '2026-06-13')
    expect(june.from).not.toBe(week.from)
    expect(june.to).not.toBe(week.to)
  })
})
