// Multi-account — listTrades' account scope. Trades-page slice ALIGNMENT
// (flips the prior pin, by order): ABSENT now resolves through the seam as
// 'all' (the non-sim wall) — consistent with the dashboard/calendar handlers.
// Vacuously identical today (sim imports are blocked, so no sim rows exist);
// load-bearing the day they do. getTrade stays BY-ID and unscoped: the detail
// of an already-visible row must always open (pinned below). Rows carry
// account_id so the All-scope list can render its per-row account indicator.

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

import { listTrades, getTrade } from '../list'

beforeEach(() => {
  alls = []
  gets = []
})

describe('listTrades — account scope (aligned default)', () => {
  it("ABSENT scope resolves through the seam as 'all' (the non-sim wall)", () => {
    listTrades({ date: '2026-06-09' })
    expect(alls[0].sql).toContain(SIM_WALL)
    expect(alls[0].args).toEqual(['2026-06-09'])
  })

  it('single-account scope filters and binds', () => {
    listTrades({ date: '2026-06-09', accountScope: { accountId: 'ACCT-X' } })
    expect(alls[0].sql).toMatch(/account_id = \?/)
    expect(alls[0].args).toEqual(['2026-06-09', 'ACCT-X'])
  })

  it("explicit 'all' applies the same non-sim wall", () => {
    listTrades({ accountScope: 'all' })
    expect(alls[0].sql).toContain(SIM_WALL)
  })

  it('the soft-delete predicate survives alongside the scope (Trash is walled too — sim-trash visibility lands with the sim-unlock audit)', () => {
    listTrades({ deleted: true, accountScope: { accountId: 'ACCT-X' } })
    expect(alls[0].sql).toMatch(/deleted_at IS NOT NULL/i)
    expect(alls[0].sql).toMatch(/account_id = \?/)
  })

  it('rows carry the owning account: the SELECT projects t.account_id', () => {
    listTrades({})
    expect(alls[0].sql).toMatch(/t\.account_id/)
  })
})

describe('getTrade — by-id, unscoped (ruling pin)', () => {
  it('fetches by id with NO account filter and projects t.account_id', () => {
    getTrade(7)
    expect(gets[0].sql).toMatch(/WHERE t\.id = \?/)
    expect(gets[0].sql).not.toContain(SIM_WALL)
    expect(gets[0].sql).not.toMatch(/account_id = \?/)
    expect(gets[0].sql).toMatch(/t\.account_id/)
    expect(gets[0].args).toEqual([7])
  })
})

// Precision pass Beat F4 display carve-out: the trades list + detail render the
// per-trip net_pnl (2dp) — F4 only repoints aggregate SUMs, never per-row
// display, so these reads must stay on the 2dp column.
describe('display carve-out (F4): trades list + detail read the 2dp per-trip net_pnl', () => {
  it('listTrades projects the 2dp t.net_pnl and never net_pnl_precise', () => {
    listTrades({ date: '2026-06-09' })
    expect(alls[0].sql).toMatch(/t\.net_pnl\b/)
    expect(alls[0].sql).not.toMatch(/net_pnl_precise/i)
  })

  it('getTrade (detail) reads the 2dp t.net_pnl and never net_pnl_precise', () => {
    getTrade(7)
    expect(gets[0].sql).toMatch(/t\.net_pnl\b/)
    expect(gets[0].sql).not.toMatch(/net_pnl_precise/i)
  })
})
