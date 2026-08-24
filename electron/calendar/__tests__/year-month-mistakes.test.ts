// v0.2.7 -- THE YEAR ROLL-UP LEARNS THE MONTH'S TOP MISTAKE.
//
// Dave's ask: "similar to the weekly tab, show top mistakes" on the year
// view's month tiles. The RANKING already exists as range-agnostic pure core
// (topMistake); what did not exist is a month-scoped READ -- the year query
// carries no mistake data at all.
//
// This pins the read half: one row per month, folded by the shared comparator,
// scoped exactly as every other year trade-read is (the non-sim wall plus the
// soft-delete filter), and never leaking a neighbouring month's tags onto a
// tile.
//
// SQL-contract via the routing shim (the calendar-scope.test.ts idiom) --
// better-sqlite3's native binary will not load under vitest.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

interface Captured {
  sql: string
  args: unknown[]
}
let alls: Captured[] = []

/** Junction rows the mistake read will return, keyed by nothing -- the shim
 *  hands the same set back and the fold is what we assert. */
let mistakeRows: Record<string, unknown>[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      get: (...args: unknown[]) => {
        void args
        if (/MIN\(date\) AS earliest/i.test(sql)) return { earliest: null, latest: null }
        return undefined
      },
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        if (/trade_mistake/i.test(sql)) return mistakeRows
        return []
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { getCalendarYear } from '../get'

const mistakeSql = () => alls.find((a) => /trade_mistake/i.test(a.sql))
const monthOf = (year: ReturnType<typeof getCalendarYear>, m: number) =>
  year.months.find((x) => x.month === m)!

beforeEach(() => {
  alls = []
  mistakeRows = []
})

// --- G3 ---------------------------------------------------------------------

describe('G3 each month carries its own top mistake, by the shared comparator', () => {
  it('folds junction rows per month and ranks count desc', () => {
    mistakeRows = [
      { ym: '2026-03', name: 'Chased extended', sort_position: 11, c: 58 },
      { ym: '2026-03', name: 'Oversized', sort_position: 10, c: 5 },
      { ym: '2026-05', name: 'Oversized', sort_position: 10, c: 3 },
    ]
    const year = getCalendarYear(2026)
    expect(monthOf(year, 3).top_mistake).toEqual({ name: 'Chased extended', count: 58 })
    expect(monthOf(year, 5).top_mistake).toEqual({ name: 'Oversized', count: 3 })
  })

  it('a count tie falls to sort_position, not the alphabet (the April case)', () => {
    mistakeRows = [
      { ym: '2026-04', name: 'FOMO entry', sort_position: 11, c: 4 },
      { ym: '2026-04', name: 'Oversized', sort_position: 10, c: 4 },
    ]
    const year = getCalendarYear(2026)
    expect(
      monthOf(year, 4).top_mistake,
      'the tie was broken alphabetically -- FOMO entry would win',
    ).toEqual({ name: 'Oversized', count: 4 })
  })
})

// --- G4 ---------------------------------------------------------------------

describe('G4 the new read obeys the scope wall and the soft-delete filter', () => {
  it("carries SIM_WALL under the 'all' scope", () => {
    getCalendarYear(2026)
    const q = mistakeSql()
    expect(q, 'no trade_mistake read was issued').toBeTruthy()
    expect(q!.sql).toContain(SIM_WALL)
  })

  it('carries account_id = ? under a single-account scope', () => {
    getCalendarYear(2026, { accountId: 'ACCT-X' })
    const q = mistakeSql()
    expect(q!.sql).toContain('account_id = ?')
    expect(q!.args).toContain('ACCT-X')
  })

  it('excludes soft-deleted trades', () => {
    getCalendarYear(2026)
    expect(mistakeSql()!.sql).toMatch(/deleted_at IS NULL/i)
  })

  it('and it is bound to the requested year', () => {
    getCalendarYear(2026)
    expect(mistakeSql()!.args).toContain('2026-%')
  })
})

// --- G5 ---------------------------------------------------------------------

describe('G5 month scoping -- a neighbour never bleeds onto a tile', () => {
  it("March's mistake does not appear on April, and April's not on March", () => {
    mistakeRows = [
      { ym: '2026-03', name: 'Chased extended', sort_position: 11, c: 58 },
      { ym: '2026-04', name: 'Oversized', sort_position: 10, c: 4 },
    ]
    const year = getCalendarYear(2026)
    expect(monthOf(year, 3).top_mistake?.name).toBe('Chased extended')
    expect(monthOf(year, 4).top_mistake?.name).toBe('Oversized')
  })

  it('a month with no rows carries null, not a neighbour and not a zero', () => {
    mistakeRows = [{ ym: '2026-03', name: 'Chased extended', sort_position: 11, c: 58 }]
    const year = getCalendarYear(2026)
    for (const m of [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(monthOf(year, m).top_mistake, `month ${m} invented a mistake`).toBeNull()
    }
  })

  it('every month of the year carries the field, present or null', () => {
    const year = getCalendarYear(2026)
    expect(year.months).toHaveLength(12)
    for (const m of year.months) {
      expect(m, `month ${m.month} is missing top_mistake`).toHaveProperty('top_mistake')
    }
  })
})
