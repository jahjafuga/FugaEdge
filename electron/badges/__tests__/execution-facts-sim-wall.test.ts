// Sim-unlock audit, fix beat 2 — the FOUR badge outcome facts gain the sim
// wall (Lao ruling 2026-07-02: sim is EXCLUDED from all outcome/money reads;
// practice counts as PROCESS only). Routing-shim style: the fake db routes
// each read BY ITS SQL — the walled route serves the non-sim truth, the
// legacy route folds in POISONED SIM ROWS (a +999 sim day / winner /
// low-float trade) so a missing wall breaks the numbers, not just a string
// match. The wall is the bare SIM_WALL constant (no binds) — these facts are
// ruled-GLOBAL and never take a scope param.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

let sqls: string[] = []

// Per-fact walled vs legacy-poisoned routing.
const GREEN_DAYS_WALLED = { n: 1 } // one real green date
const GREEN_DAYS_POISONED = { n: 2 } // sim +999 flips a red date green
const WIN_COUNT_WALLED = { n: 2 }
const WIN_COUNT_POISONED = { n: 3 } // the sim winner counted
const LOW_FLOAT_WALLED = { n: 4 }
const LOW_FLOAT_POISONED = { n: 5 } // the sim low-float trade counted
const STREAK_WALLED = [{ total_pnl: 5 }, { total_pnl: -1 }, { total_pnl: 3 }] // -> 1
const STREAK_POISONED = [{ total_pnl: 5 }, { total_pnl: 999 }, { total_pnl: 3 }] // sim-only green day bridges -> 3

const mockDb = {
  prepare(sql: string) {
    sqls.push(sql)
    const walled = sql.includes(SIM_WALL)
    return {
      get: () => {
        if (/HAVING SUM\(total_pnl\)/i.test(sql)) {
          return walled ? GREEN_DAYS_WALLED : GREEN_DAYS_POISONED
        }
        if (/float_shares/i.test(sql)) {
          return walled ? LOW_FLOAT_WALLED : LOW_FLOAT_POISONED
        }
        return walled ? WIN_COUNT_WALLED : WIN_COUNT_POISONED
      },
      all: () => (walled ? STREAK_WALLED : STREAK_POISONED),
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import {
  countGreenDays,
  countLowFloatTrades,
  countWinningTrades,
  longestGreenStreak,
} from '../execution-facts'

beforeEach(() => {
  sqls = []
})

describe('execution facts — the sim wall (outcome reads exclude practice)', () => {
  it('countGreenDays: wall in the SQL; a poisoned sim day cannot flip a date green', () => {
    expect(countGreenDays()).toBe(1)
    expect(sqls[0]).toContain(SIM_WALL)
  })

  it('longestGreenStreak: wall; a sim-only green day never extends the streak', () => {
    expect(longestGreenStreak()).toBe(1)
    expect(sqls[0]).toContain(SIM_WALL)
  })

  it('countWinningTrades: wall; a poisoned sim winner never counts', () => {
    expect(countWinningTrades()).toBe(2)
    expect(sqls[0]).toContain(SIM_WALL)
  })

  it('countLowFloatTrades: wall; a poisoned sim low-float trade never counts', () => {
    expect(countLowFloatTrades()).toBe(4)
    expect(sqls[0]).toContain(SIM_WALL)
  })
})
