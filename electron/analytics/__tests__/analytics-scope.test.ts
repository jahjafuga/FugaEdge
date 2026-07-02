// Multi-account (Analytics slice) — getAnalytics reads become scope-aware
// (the calendar-scope mirror). The module's SINGLE trades read (equity,
// streaks, giveback, setups, share size, P/L ratio, Psychology — everything
// downstream is pure compute over these rows) carries the scope through the
// ONE seam. The journal / session_meta discipline + rule-break reads are
// day-level metadata with NO account column — pinned GLOBAL, mirroring the
// calendar ruling.

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

import { getAnalytics } from '../get'

beforeEach(() => {
  alls = []
})

const tradeReads = () => alls.filter((c) => /FROM trades/i.test(c.sql))
const metadataReads = () =>
  alls.filter(
    (c) =>
      /FROM journal|FROM session_meta/i.test(c.sql) && !/FROM trades/i.test(c.sql),
  )

describe("getAnalytics — 'all' scope (the aligned default when absent)", () => {
  it('the trades read carries the sim wall; discipline/rule-break metadata reads stay GLOBAL', () => {
    getAnalytics()
    const reads = tradeReads()
    expect(reads.length).toBe(1)
    expect(reads[0].sql).toContain(SIM_WALL)
    expect(reads[0].sql).toMatch(/t\.deleted_at IS NULL/i)

    const meta = metadataReads()
    expect(meta.length).toBeGreaterThanOrEqual(3)
    for (const m of meta) {
      expect(m.sql).not.toMatch(/account_id/i)
    }
  })
})

describe('getAnalytics — single-account scope', () => {
  it('filters account_id = ? and binds the id; deleted_at semantics verbatim', () => {
    getAnalytics({ accountId: 'ACCT-X' })
    const reads = tradeReads()
    expect(reads.length).toBe(1)
    expect(reads[0].sql).toMatch(/account_id = \?/)
    expect(reads[0].sql).toMatch(/t\.deleted_at IS NULL/i)
    expect(reads[0].args).toEqual(['ACCT-X'])
  })
})
