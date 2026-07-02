// Multi-account slice — listTrades gains an OPTIONAL accountScope (used by
// the Calendar page's compare strip; the DayDetailModal renders from the
// already-scoped month payload and fetches nothing). The distinction is
// load-bearing and pinned: ABSENT means legacy UNSCOPED (every existing
// caller — Trades page, Journal, insights — stays byte-identical), NOT the
// 'all' wall; only callers that opt in get scoped semantics. The Trades-page
// slice will flip its own callers later.

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

import { listTrades } from '../list'

beforeEach(() => {
  alls = []
})

describe('listTrades — optional account scope', () => {
  it('ABSENT scope: the SQL carries NO account filter (legacy callers byte-identical)', () => {
    listTrades({ date: '2026-06-09' })
    expect(alls[0].sql).not.toMatch(/account_id/i)
    expect(alls[0].args).toEqual(['2026-06-09'])
  })

  it('single-account scope filters and binds', () => {
    listTrades({ date: '2026-06-09', accountScope: { accountId: 'ACCT-X' } })
    expect(alls[0].sql).toMatch(/account_id = \?/)
    expect(alls[0].args).toEqual(['2026-06-09', 'ACCT-X'])
  })

  it("'all' scope applies the non-sim wall", () => {
    listTrades({ accountScope: 'all' })
    expect(alls[0].sql).toContain(SIM_WALL)
  })

  it('the soft-delete predicate survives alongside the scope', () => {
    listTrades({ deleted: true, accountScope: { accountId: 'ACCT-X' } })
    expect(alls[0].sql).toMatch(/deleted_at IS NOT NULL/i)
    expect(alls[0].sql).toMatch(/account_id = \?/)
  })
})
