import { describe, expect, it, vi, beforeEach } from 'vitest'

// pnl-facts.ts is the documented §A2 EXCEPTION — the one module ALLOWED to read
// P&L. So this test asserts it reads P&L CORRECTLY (SUM(net_pnl) + COUNT over
// non-deleted CLOSED trades, grouped by date) — the inverse of the facts.ts
// allowlist guard, which stays untouched and P&L-blind for every other award.

const { store } = vi.hoisted(() => ({
  store: {
    sqls: [] as string[],
    params: [] as unknown[][],
    rows: [] as unknown[],
  },
}))

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      store.sqls.push(sql)
      return {
        all: (...params: unknown[]) => {
          store.params.push(params)
          return store.rows
        },
      }
    },
  }),
}))

import { netPnlByDate } from '../pnl-facts'

beforeEach(() => {
  store.sqls = []
  store.params = []
  store.rows = []
})

describe('netPnlByDate (the §A2-exception P&L reader)', () => {
  it('maps per-date SUM(net_pnl) + COUNT into { netPnl, tradeCount }', () => {
    store.rows = [
      { date: '2026-06-29', net_pnl: -10, trade_count: 3 },
      { date: '2026-06-28', net_pnl: 120, trade_count: 5 },
    ]
    const map = netPnlByDate()
    expect(map.get('2026-06-29')).toEqual({ netPnl: -10, tradeCount: 3 })
    expect(map.get('2026-06-28')).toEqual({ netPnl: 120, tradeCount: 5 })
  })

  it('reads only non-deleted CLOSED trades, grouped by date', () => {
    netPnlByDate()
    const sql = store.sqls.join(' ')
    expect(sql).toMatch(/SUM\(net_pnl\)/i)
    expect(sql).toMatch(/COUNT\(\*\)/i)
    expect(sql).toMatch(/deleted_at IS NULL/i)
    expect(sql).toMatch(/close_time IS NOT NULL/i)
    expect(sql).toMatch(/GROUP BY date/i)
  })

  it('scopes to the given dates via a parameterized IN', () => {
    netPnlByDate(['2026-06-29', '2026-06-28'])
    const sql = store.sqls.join(' ')
    expect(sql).toMatch(/date IN \(\?, \?\)/i)
    expect(store.params[0]).toEqual(['2026-06-29', '2026-06-28'])
  })
})
