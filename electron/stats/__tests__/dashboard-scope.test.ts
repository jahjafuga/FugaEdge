// Multi-account Beat 4 — getDashboardData becomes scope-aware. SQL-contract
// tests (routing shim): every P&L/stats read carries the scope; the
// daily_summary reads aggregate GROUP BY date (the re-keyed cache); and the
// STEP 0 classification ruling is PINNED — readDisciplineStreak is the
// showed-up (identity) streak, so it stays GLOBAL and unscoped.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

interface Captured {
  sql: string
  args: unknown[]
}

let prepared: string[] = []
let gets: Captured[] = []
let alls: Captured[] = []

const mockDb = {
  prepare(sql: string) {
    prepared.push(sql)
    return {
      get: (...args: unknown[]) => {
        gets.push({ sql, args })
        if (/COALESCE\(SUM\(net_pnl\), 0\)\s+AS net_pnl/i.test(sql)) {
          return { net_pnl: 0, gross_pnl: 0, total_fees: 0, trade_count: 0, scratches: 0 }
        }
        if (/MAX\(net_pnl\) AS max/i.test(sql)) return { n: 0, sum: 0, max: null }
        if (/MIN\(net_pnl\) AS min/i.test(sql)) return { n: 0, sum: 0, min: null }
        if (/MAX\(date\) AS date FROM trades/i.test(sql)) return { date: null }
        if (/COUNT\(\*\) AS n FROM trades/i.test(sql)) return { n: 0 }
        return undefined
      },
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        return []
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { getDashboardData } from '../dashboard'

beforeEach(() => {
  prepared = []
  gets = []
  alls = []
})

const tradeStatReads = () =>
  gets.filter(
    (g) =>
      /FROM trades/i.test(g.sql) &&
      !/DISTINCT date FROM trades/i.test(g.sql), // the streak read is exempt by ruling
  )
const summaryReads = () => alls.filter((a) => /FROM daily_summary/i.test(a.sql))
const streakTradeReads = () => alls.filter((a) => /DISTINCT date FROM trades/i.test(a.sql))

describe("getDashboardData — 'all' scope (the default)", () => {
  it('every trades P&L/stats read carries the sim wall; the streak read stays GLOBAL', () => {
    getDashboardData('all')
    const reads = tradeStatReads()
    expect(reads.length).toBeGreaterThanOrEqual(4) // totals, winners, losers, latest-MAX, empty
    for (const r of reads) {
      expect(r.sql).toContain(SIM_WALL)
    }
    // The STEP 0 ruling, pinned: discipline streak = showed-up days (identity
    // system) — GLOBAL, no account filter.
    const streak = streakTradeReads()
    expect(streak).toHaveLength(1)
    expect(streak[0].sql).not.toMatch(/account_id/i)
  })

  it('daily_summary reads aggregate per date over the wall (series + month)', () => {
    getDashboardData('all')
    const reads = summaryReads()
    expect(reads).toHaveLength(2) // readDailySeries + readMonth
    for (const r of reads) {
      expect(r.sql).toMatch(/SUM\(total_pnl\)/i)
      expect(r.sql).toMatch(/GROUP BY date/i)
      expect(r.sql).toContain(SIM_WALL)
    }
  })
})

describe('getDashboardData — single-account scope', () => {
  it('every trades P&L/stats read filters account_id = ? and binds the id', () => {
    getDashboardData('all', { accountId: 'ACCT-X' })
    const reads = tradeStatReads()
    for (const r of reads) {
      expect(r.sql).toMatch(/account_id = \?/)
      expect(r.args).toContain('ACCT-X')
    }
  })

  it('daily_summary series/month reads bind the account and still group per date', () => {
    getDashboardData('all', { accountId: 'ACCT-X' })
    for (const r of summaryReads()) {
      expect(r.sql).toMatch(/account_id = \?/)
      expect(r.sql).toMatch(/GROUP BY date/i)
      expect(r.args).toContain('ACCT-X')
    }
  })

  it("the scoped 'empty' check makes an archived/sim selection honestly empty", () => {
    getDashboardData('all', { accountId: 'ACCT-X' })
    const emptyRead = gets.find((g) => /COUNT\(\*\) AS n FROM trades/i.test(g.sql))!
    expect(emptyRead.sql).toMatch(/account_id = \?/)
    expect(emptyRead.args).toEqual(['ACCT-X'])
  })
})

// Sim-unlock audit, fix beat 2 — RULING-1 PIN (Lao 2026-07-02: practice is
// process). The showing-up streak counts sim trade-days: its traded-days
// read carries NO wall and NO account dimension, under every scope.
describe('the showing-up streak — wall-free by ruling (sim days count)', () => {
  it('the streak trades read carries no wall and no account dimension', () => {
    getDashboardData('all', { accountId: 'ACCT-X' })
    getDashboardData('all', 'all')
    const streakReads = streakTradeReads()
    expect(streakReads.length).toBeGreaterThanOrEqual(2)
    for (const r of streakReads) {
      expect(r.sql).not.toMatch(/account_id/i)
    }
  })
})
