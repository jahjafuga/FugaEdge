// Sim-unlock audit, fix beat 2 — equity-goal progress judges REAL money
// only: cumulativeNetPnlSince gains the sim wall (Lao ruling 2026-07-02).
// Routing shim: the legacy route folds a poisoned sim +999 into the sum.
// D19 (equity completion can never award XP) is untouched territory — its
// pin lives at electron/goals/__tests__/engine.test.ts:192-193 and must
// pass unmodified.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

let sqls: string[] = []
let getArgs: unknown[][] = []

const mockDb = {
  prepare(sql: string) {
    sqls.push(sql)
    const walled = sql.includes(SIM_WALL)
    return {
      get: (...args: unknown[]) => {
        getArgs.push(args)
        return walled ? { pnl: 150 } : { pnl: 1149 } // sim +999 folded into legacy
      },
      all: () => [],
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { cumulativeNetPnlSince } from '../equity'

beforeEach(() => {
  sqls = []
  getArgs = []
})

describe('cumulativeNetPnlSince — the sim wall on equity-goal progress', () => {
  it('wall in the SQL; a poisoned sim gain never enters progress; the start-date bind survives', () => {
    expect(cumulativeNetPnlSince('2026-01-01')).toBe(150)
    expect(sqls[0]).toContain(SIM_WALL)
    expect(sqls[0]).toMatch(/deleted_at IS NULL/i)
    expect(getArgs[0]).toEqual(['2026-01-01'])
  })
})
