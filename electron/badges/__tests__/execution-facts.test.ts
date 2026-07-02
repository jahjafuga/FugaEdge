import { describe, expect, it, vi, beforeEach } from 'vitest'

// execution-facts.ts is the walled trade-fact reader for execution badges. The
// streak-walk (longestGreenStreak) is the only real logic — cover its edges. The
// count fns are thin COUNT() wrappers; assert they return the count + the low-
// float query carries the threshold filter.

const { store } = vi.hoisted(() => ({
  store: { rows: [] as unknown[], getN: 0, sqls: [] as string[] },
}))

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      store.sqls.push(sql)
      return {
        all: () => store.rows,
        get: () => ({ n: store.getN }),
      }
    },
  }),
}))

import {
  countGreenDays,
  countLowFloatTrades,
  countWinningTrades,
  longestGreenStreak,
} from '../execution-facts'

beforeEach(() => {
  store.rows = []
  store.getN = 0
  store.sqls = []
})

describe('longestGreenStreak (the streak-walk)', () => {
  const withPnls = (pnls: number[]) => {
    store.rows = pnls.map((p) => ({ total_pnl: p }))
  }

  it('empty -> 0', () => {
    withPnls([])
    expect(longestGreenStreak()).toBe(0)
  })

  it('all green -> the full length', () => {
    withPnls([10, 5, 20])
    expect(longestGreenStreak()).toBe(3)
  })

  it('a red day breaks the run', () => {
    withPnls([10, -5, 20, 30])
    expect(longestGreenStreak()).toBe(2)
  })

  it('leading + trailing red days do not count', () => {
    withPnls([-1, 10, 10, -1])
    expect(longestGreenStreak()).toBe(2)
  })

  it('a flat (0) day breaks the run', () => {
    withPnls([10, 0, 10, 10])
    expect(longestGreenStreak()).toBe(2)
  })
})

describe('count fns', () => {
  it('countGreenDays returns the COUNT', () => {
    store.getN = 11
    expect(countGreenDays()).toBe(11)
  })

  // Beat 4 — daily_summary is keyed (date, account_id); the badge facts keep
  // their GLOBAL combined-trading meaning by aggregating PER DATE across
  // accounts before judging green.
  it('countGreenDays judges per-DATE SUM across accounts (cross-account aggregate)', () => {
    store.getN = 11
    countGreenDays()
    const sql = store.sqls.join(' ')
    expect(sql).toMatch(/GROUP BY date/i)
    expect(sql).toMatch(/HAVING SUM\(total_pnl\) > 0/i)
  })

  it('longestGreenStreak walks per-date SUM(total_pnl) grouped by date', () => {
    store.rows = [{ total_pnl: 5 }]
    longestGreenStreak()
    const sql = store.sqls.join(' ')
    expect(sql).toMatch(/SUM\(total_pnl\)/i)
    expect(sql).toMatch(/GROUP BY date/i)
    expect(sql).toMatch(/ORDER BY date ASC/i)
  })

  it('countWinningTrades returns the COUNT', () => {
    store.getN = 42
    expect(countWinningTrades()).toBe(42)
  })

  it('countLowFloatTrades returns the COUNT and filters on float_shares < ?', () => {
    store.getN = 97
    expect(countLowFloatTrades()).toBe(97)
    expect(store.sqls.join(' ')).toMatch(/float_shares < \?/i)
  })
})
