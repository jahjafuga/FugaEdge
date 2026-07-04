// Arc 3 Beat 1 — the walled money fact: profitPeak, the high-water mark of
// running cumulative net P&L (floored at zero) over non-sim, non-deleted
// trades. Routing-shim style (the execution-facts-sim-wall idiom): the fake
// db routes BY THE SQL — the clean route requires BOTH the SIM_WALL and the
// deleted_at clause; a missing wall serves a poisoned +999,999 sim day and
// a missing deleted-clause serves a poisoned deleted day, so either lost
// guard explodes the peak instead of merely failing a string match. The
// fact is ruled-GLOBAL (no scope param) — the wall is a data-integrity
// fence, the 4703a10 family.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

let sqls: string[] = []
// The clean book: +150, -120, +60 by date -> cumulative 150 / 30 / 90 ->
// peak 150 (the drawdown never lowers it). Swap in the all-loss book to
// prove the zero floor.
let allLoss = false

const CLEAN_ROWS = [
  { date: '2026-06-01', net_pnl: 150 },
  { date: '2026-06-02', net_pnl: -120 },
  { date: '2026-06-03', net_pnl: 60 },
]
const ALL_LOSS_ROWS = [
  { date: '2026-06-01', net_pnl: -50 },
  { date: '2026-06-02', net_pnl: -20 },
]
const SIM_POISON_ROW = { date: '2026-06-02', net_pnl: 999_999 }
const DELETED_POISON_ROW = { date: '2026-06-01', net_pnl: 999_999 }

const mockDb = {
  prepare(sql: string) {
    sqls.push(sql)
    const walled = sql.includes(SIM_WALL)
    const deletedGuarded = /deleted_at IS NULL/i.test(sql)
    return {
      all: () => {
        const base = allLoss ? ALL_LOSS_ROWS : CLEAN_ROWS
        if (!walled) return [...base, SIM_POISON_ROW]
        if (!deletedGuarded) return [DELETED_POISON_ROW, ...base]
        return base
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { profitPeak } from '../money-facts'

beforeEach(() => {
  sqls = []
  allLoss = false
})

describe('profitPeak — the high-water mark of cumulative earned P&L', () => {
  it('THE PEAK MATH: +150 / -120 / +60 -> peak 150; the drawdown never lowers it', () => {
    expect(profitPeak()).toBe(150)
  })

  it('THE FLOOR: an all-loss book -> peak 0, never negative', () => {
    allLoss = true
    expect(profitPeak()).toBe(0)
  })

  it('THE SIM POISON: the wall is in the SQL — a +999,999 sim trade never moves the peak', () => {
    expect(profitPeak()).toBe(150)
    expect(sqls[0]).toContain(SIM_WALL)
  })

  it('THE DELETED POISON: deleted_at IS NULL is in the SQL — a deleted +999,999 never moves the peak', () => {
    expect(profitPeak()).toBe(150)
    expect(sqls[0]).toMatch(/deleted_at IS NULL/i)
  })

  it('the read is date-cumulative (GROUP BY date, ordered) and ruled-global — no scope binds', () => {
    profitPeak()
    expect(sqls[0]).toMatch(/GROUP BY date/i)
    expect(sqls[0]).toMatch(/ORDER BY date/i)
  })
})
