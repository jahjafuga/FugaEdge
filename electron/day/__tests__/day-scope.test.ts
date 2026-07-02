// Multi-account (Technicals slice, beat 2) — getDayDetail threads the scope:
// the day's trades come via listTrades({ date, accountScope }) (the channel
// whose seam default is already pinned in trades' list-scope.test.ts), and
// the day METADATA reads (session_meta note, journal rule-breaks) stay
// GLOBAL — pinned here.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

let alls: { sql: string; args: unknown[] }[] = []
let gets: { sql: string; args: unknown[] }[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        return []
      },
      get: (...args: unknown[]) => {
        gets.push({ sql, args })
        return undefined
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { getDayDetail } from '../repo'

beforeEach(() => {
  alls = []
  gets = []
})

const DATE = '2026-06-09'
const tradeReads = () => alls.filter((c) => /FROM trades t/i.test(c.sql))
const metadataReads = () => [
  ...gets.filter((c) => /FROM session_meta|FROM journal/i.test(c.sql)),
  ...alls.filter((c) => /FROM session_meta|FROM journal/i.test(c.sql)),
]

describe('getDayDetail — scope threading into the trades channel', () => {
  it('explicit single scope: the trades read filters account_id = ? with the bind', () => {
    getDayDetail(DATE, { accountScope: { accountId: 'ACCT-A' } })
    const r = tradeReads()[0]
    expect(r.sql).toMatch(/account_id = \?/)
    expect(r.args).toEqual([DATE, 'ACCT-A'])
  })

  it("absent scope: the trades channel's seam default applies (the wall — pass-through proof)", () => {
    getDayDetail(DATE)
    const r = tradeReads()[0]
    expect(r.sql).toContain(SIM_WALL)
    expect(r.args).toEqual([DATE])
  })

  it('day metadata GLOBAL: session_meta + rule-breaks reads carry NO account dimension', () => {
    getDayDetail(DATE, { accountScope: { accountId: 'ACCT-A' } })
    const meta = metadataReads()
    expect(meta.length).toBeGreaterThanOrEqual(2)
    for (const m of meta) {
      expect(m.sql).not.toMatch(/account_id/i)
    }
  })
})
