// Multi-account (Analytics slice) — getReports reads become scope-aware.
// Its SINGLE trades read (feeding the Quality tab's win/loss days, drawdown,
// full stats, day-of-week roll-ups) carries the scope through the ONE seam;
// the market_data enrichment read is symbol-keyed reference data with no
// account dimension — pinned UNSCOPED.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

let alls: { sql: string; args: unknown[] }[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        return []
      },
      get: () => undefined,
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { getReports } from '../get'

beforeEach(() => {
  alls = []
})

const tradeReads = () => alls.filter((c) => /FROM trades/i.test(c.sql))
const marketReads = () => alls.filter((c) => /FROM market_data/i.test(c.sql))

describe("getReports — 'all' scope (the aligned default when absent)", () => {
  it('the trades read carries the sim wall; the market_data read stays unscoped', () => {
    getReports()
    const reads = tradeReads()
    expect(reads.length).toBe(1)
    expect(reads[0].sql).toContain(SIM_WALL)
    expect(reads[0].sql).toMatch(/deleted_at IS NULL/i)

    for (const m of marketReads()) {
      expect(m.sql).not.toMatch(/account_id/i)
    }
  })
})

describe('getReports — single-account scope', () => {
  it('filters account_id = ? and binds the id; deleted_at semantics verbatim', () => {
    getReports({ accountId: 'ACCT-X' })
    const reads = tradeReads()
    expect(reads.length).toBe(1)
    expect(reads[0].sql).toMatch(/account_id = \?/)
    expect(reads[0].sql).toMatch(/deleted_at IS NULL/i)
    expect(reads[0].args).toEqual(['ACCT-X'])
  })
})
