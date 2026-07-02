// Sim-unlock audit, fix beat 2 — the XP layer's TWO sides of the ruling:
//   (2) the maxloss sum (pnl-facts.ts, the one A2 money exception) gains the
//       sim wall — the award judges REAL money only. Routing shim: the
//       legacy route folds a poisoned sim -999/+999 into the date's sum.
//   (1) RULING-1 PIN: practice is PROCESS — facts.ts session/trade facts
//       carry NO wall and NO account dimension; sim trade-days count toward
//       process XP by ruling (Lao 2026-07-02).

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

let sqls: string[] = []
let allArgs: unknown[][] = []

const DATE = '2026-06-09'
const WALLED_ROWS = [{ date: DATE, net_pnl: -50, trade_count: 2 }]
const POISONED_ROWS = [{ date: DATE, net_pnl: 949, trade_count: 3 }] // sim +999 folded in

const mockDb = {
  prepare(sql: string) {
    sqls.push(sql)
    const walled = sql.includes(SIM_WALL)
    return {
      all: (...args: unknown[]) => {
        allArgs.push(args)
        if (/SUM\(net_pnl\)/i.test(sql)) {
          return walled ? WALLED_ROWS : POISONED_ROWS
        }
        return []
      },
      get: () => undefined,
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { netPnlByDate } from '../pnl-facts'
import { assembleSessionFacts, assembleTradeFacts } from '../facts'

beforeEach(() => {
  sqls = []
  allArgs = []
})

describe('netPnlByDate — the maxloss sum judges REAL money only', () => {
  it('wall in the SQL; a poisoned sim figure never enters the date sum', () => {
    const map = netPnlByDate()
    expect(sqls[0]).toContain(SIM_WALL)
    expect(map.get(DATE)).toEqual({ netPnl: -50, tradeCount: 2 })
  })

  it('the wall composes with the parameterized date IN', () => {
    netPnlByDate([DATE])
    expect(sqls[0]).toContain(SIM_WALL)
    expect(sqls[0]).toMatch(/date IN \(\?\)/i)
    expect(allArgs[0]).toEqual([DATE])
  })
})

describe('RULING-1 PIN — practice is process: facts.ts stays wall-free', () => {
  it('session facts carry NO wall and NO account dimension (sim days count)', () => {
    assembleSessionFacts()
    const sessionSql = sqls.join(' ')
    expect(sessionSql).not.toContain(SIM_WALL)
    expect(sessionSql).not.toMatch(/account_id/i)
  })

  it('trade facts carry NO wall and NO account dimension (sim trades count)', () => {
    sqls = []
    assembleTradeFacts('2026-01-01')
    const tradeSql = sqls.join(' ')
    expect(tradeSql).not.toContain(SIM_WALL)
    expect(tradeSql).not.toMatch(/account_id/i)
  })
})
