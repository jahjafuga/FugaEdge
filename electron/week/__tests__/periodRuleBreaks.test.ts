// THE DATA PATH: a window carries its own rule-break rollup.
//
// The pure restriction is pinned in src/core/analytics/__tests__/
// periodRuleBreaks.test.ts. What these cases pin is the SEAM -- that
// getPeriodDetail reads the junction ONCE, restricts both maps to its own
// window, and hands the result out on the detail.
//
// THE SAME VACUITY TRAP APPLIES HERE. The mock db returns the WHOLE book for
// both reads, so a fixture whose breaks all fell inside the window would pass
// with no filter at all. Two days before and two days after, with nets no
// window total could absorb.
import { describe, expect, it, beforeEach, vi } from 'vitest'

let alls: { sql: string; args: unknown[] }[] = []

/** date -> net. Whole book: two days before the week, two after. */
const DAILY = [
  { date: '2026-06-01', pnl: 500 }, // BEFORE
  { date: '2026-06-03', pnl: -200 }, // BEFORE
  { date: '2026-06-07', pnl: 11 },
  { date: '2026-06-08', pnl: 100 },
  { date: '2026-06-09', pnl: 7 }, // clean in-window day
  { date: '2026-06-10', pnl: -40 },
  { date: '2026-06-13', pnl: 29 },
  { date: '2026-06-20', pnl: 999 }, // AFTER
  { date: '2026-06-25', pnl: -777 }, // AFTER
]

/** The junction JOIN's rows, in the reader's own shape. 2026-06-12 carries a
 *  break but NO trade. */
const LINKS = [
  { date: '2026-06-01', name: 'A' },
  { date: '2026-06-03', name: 'B' },
  { date: '2026-06-07', name: 'A' },
  { date: '2026-06-08', name: 'A' },
  { date: '2026-06-08', name: 'B' },
  { date: '2026-06-10', name: 'A' },
  { date: '2026-06-12', name: 'C' },
  { date: '2026-06-13', name: 'B' },
  { date: '2026-06-20', name: 'A' },
  { date: '2026-06-25', name: 'C' },
]

const mockDb = {
  prepare(sql: string) {
    return {
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        if (/SUM\(net_pnl\)/i.test(sql)) return DAILY
        if (/FROM journal_rule_break/i.test(sql)) return LINKS
        if (/FROM journal/i.test(sql)) return []
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

import { getPeriodDetail, getWeekDetail } from '../repo'

beforeEach(() => {
  alls = []
})

const junctionReads = () => alls.filter((c) => /FROM journal_rule_break/i.test(c.sql))

describe('AO the window carries its rule breaks', () => {
  it('AO1b getPeriodDetail rolls up ONLY the window, reading the junction ONCE', () => {
    const p = getPeriodDetail('2026-06-07', '2026-06-13')
    // ONE read, and it is the unbounded one -- no WHERE, no per-day loop.
    expect(junctionReads().length, 'the junction was read more than once').toBe(1)
    expect(junctionReads()[0].args, 'a WHERE clause was added to the reader').toEqual([])

    expect(p.ruleBreaks.days_with_any_break, 'out-of-window days leaked in').toBe(5)
    // 11 + 100 - 40 + 0 + 29
    expect(p.ruleBreaks.flawed_day_net_pnl).toBe(100)
    expect(p.ruleBreaks.clean_days).toBe(1)
    expect(p.ruleBreaks.clean_day_net_pnl).toBe(7)
    const sum = p.ruleBreaks.byRuleBreak.reduce((a, x) => a + x.day_count, 0)
    expect(sum, 'the rows do not sum higher than the headline').toBe(6)
  })

  it('AO2b a DIFFERENT window gets a different rollup from the same reads', () => {
    // The proof that the restriction is per-call and not baked in.
    const first = getPeriodDetail('2026-06-01', '2026-06-03')
    expect(first.ruleBreaks.days_with_any_break).toBe(2)
    expect(first.ruleBreaks.flawed_day_net_pnl).toBe(300) // 500 - 200
    const second = getPeriodDetail('2026-06-20', '2026-06-25')
    expect(second.ruleBreaks.days_with_any_break).toBe(2)
    expect(second.ruleBreaks.flawed_day_net_pnl).toBe(222) // 999 - 777
  })

  it('AO6b an empty window gets an empty rollup, not null and not a throw', () => {
    const p = getPeriodDetail('2026-08-01', '2026-08-31')
    expect(p.ruleBreaks).toBeTruthy()
    expect(p.ruleBreaks.byRuleBreak).toEqual([])
    expect(p.ruleBreaks.days_with_any_break).toBe(0)
    expect(p.ruleBreaks.flawed_green_rate).toBe(null)
  })

  it('AO5b THE WEEK carries it too -- it is hand-composed and would drop it', () => {
    // WeekDetail is written out field by field (week-types.ts:118-121), so a
    // new field on PeriodDetail does NOT reach the week host unless the week
    // is told about it. That is the whole reason this case exists.
    const w = getWeekDetail('2026-06-07')
    expect(w.ruleBreaks, 'the week dropped the rollup on the floor').toBeTruthy()
    expect(w.ruleBreaks.days_with_any_break).toBe(5)
    expect(w.ruleBreaks.flawed_day_net_pnl).toBe(100)
    // and it is the SAME rollup the window produced
    const p = getPeriodDetail('2026-06-07', '2026-06-13')
    expect(w.ruleBreaks).toEqual(p.ruleBreaks)
  })
})
