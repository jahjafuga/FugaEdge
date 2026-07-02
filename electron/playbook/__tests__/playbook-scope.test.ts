// Multi-account (Playbook slice) — per-playbook STATS follow the account
// switcher; DEFINITIONS are GLOBAL identity (the ruled split). SQL-contract
// via a ROUTING shim (the calendar-scope mirror, upgraded): the fake db
// routes the stats read by the SQL the seam generates — single scope routes
// by the bound account id, the non-sim wall routes to the non-sim union —
// so the count/P&L assertions are load-bearing: an implementation that
// fails to emit the seam clause falls into the legacy-unfiltered route and
// the numbers break. Definitions queries must stay account-free under every
// scope, byte-identical rows + ordering, zero-trade playbooks keeping the
// EXISTING emptyStats shape.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

interface Captured {
  sql: string
  args: unknown[]
}

let alls: Captured[] = []
let gets: Captured[] = []

// Two definitions: pb1 carries trades, pb2 has ZERO trades everywhere.
const DEFS = [
  {
    id: 1, name: 'Bull Flag', description: '', rules: '', ideal_conditions: '',
    archived: 0, is_system: 0, tier: 'A', created_at: '2026-01-01',
  },
  {
    id: 2, name: 'Gap & Go', description: '', rules: '', ideal_conditions: '',
    archived: 0, is_system: 0, tier: 'B', created_at: '2026-01-02',
  },
]

// TradeRowForStats-shaped rows per (playbook, account).
function row(net_pnl: number) {
  return {
    net_pnl, side: 'long' as const,
    avg_buy_price: 10, avg_sell_price: 11,
    shares_bought: 100, shares_sold: 100,
    planned_risk: null, planned_stop_loss_price: null,
  }
}
const PB1 = {
  'ACCT-A': [row(100), row(50)],
  'ACCT-B': [row(-30)],
  'ACCT-SIM': [row(999)],
}

function routeTrades(sql: string, args: unknown[]): unknown[] {
  const pbId = args[0] as number
  if (pbId !== 1) return []
  if (/account_id = \?/.test(sql)) {
    return PB1[(args[1] as keyof typeof PB1)] ?? []
  }
  if (sql.includes(SIM_WALL)) {
    return [...PB1['ACCT-A'], ...PB1['ACCT-B']]
  }
  // Legacy-unfiltered route — the latent sim leak this slice kills. An
  // implementation that lands here gets sim rows and fails the numbers.
  return [...PB1['ACCT-A'], ...PB1['ACCT-B'], ...PB1['ACCT-SIM']]
}

const mockDb = {
  prepare(sql: string) {
    return {
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        if (/FROM playbooks/i.test(sql)) return DEFS
        if (/FROM trades/i.test(sql)) return routeTrades(sql, args)
        return []
      },
      get: (...args: unknown[]) => {
        gets.push({ sql, args })
        if (/FROM playbooks WHERE id = \?/.test(sql)) {
          return DEFS.find((d) => d.id === args[0])
        }
        return undefined
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { listPlaybooks, getPlaybook } from '../repo'

beforeEach(() => {
  alls = []
  gets = []
})

const statsReads = () => alls.filter((c) => /FROM trades/i.test(c.sql))
const defReads = () => alls.filter((c) => /FROM playbooks/i.test(c.sql))
const defShape = (l: ReturnType<typeof listPlaybooks>) =>
  l.map((p) => ({ id: p.id, name: p.name, archived: p.archived, tier: p.tier }))

const EMPTY_STATS = {
  trade_count: 0, net_pnl: 0, winners: 0, losers: 0, scratches: 0,
  win_rate: null, profit_factor: null, avg_winner: null, avg_loser: null,
  largest_winner: null, largest_loser: null, avg_r: null,
}

describe('listPlaybooks — per-playbook stats follow the scope', () => {
  it("single scope: the stats read filters account_id = ? and the numbers are that account's ONLY", () => {
    const l = listPlaybooks({ accountId: 'ACCT-A' })
    for (const r of statsReads()) {
      expect(r.sql).toMatch(/account_id = \?/)
      expect(r.sql).toMatch(/deleted_at IS NULL/i)
      expect(r.args).toEqual([expect.any(Number), 'ACCT-A'])
    }
    const pb1 = l.find((p) => p.id === 1)!
    expect(pb1.stats.trade_count).toBe(2)
    expect(pb1.stats.net_pnl).toBe(150)
    expect(pb1.stats.winners).toBe(2)

    alls = []
    const lb = listPlaybooks({ accountId: 'ACCT-B' })
    const pb1b = lb.find((p) => p.id === 1)!
    expect(pb1b.stats.trade_count).toBe(1)
    expect(pb1b.stats.net_pnl).toBe(-30)
    expect(pb1b.stats.losers).toBe(1)
  })

  it("'all': the non-sim wall applies — sim trades never enter the numbers", () => {
    const l = listPlaybooks('all')
    for (const r of statsReads()) {
      expect(r.sql).toContain(SIM_WALL)
      expect(r.args).toEqual([expect.any(Number)])
    }
    const pb1 = l.find((p) => p.id === 1)!
    expect(pb1.stats.trade_count).toBe(3) // A(2) + B(1), NEVER the sim row
    expect(pb1.stats.net_pnl).toBe(120)
  })

  it("absent scope resolves through the seam — output byte-equal to explicit 'all', wall in the SQL", () => {
    const absent = listPlaybooks()
    const absentSql = statsReads().map((r) => r.sql)
    for (const s of absentSql) expect(s).toContain(SIM_WALL)
    alls = []
    const explicit = listPlaybooks('all')
    expect(absent).toEqual(explicit)
    expect(absentSql).toEqual(statsReads().map((r) => r.sql))
  })

  it('definitions unaffected: identical rows + ordering under every scope; zero-trade playbooks keep the EXISTING emptyStats shape', () => {
    const all = listPlaybooks('all')
    const single = listPlaybooks({ accountId: 'ACCT-B' })
    const absent = listPlaybooks()
    expect(defShape(single)).toEqual(defShape(all))
    expect(defShape(absent)).toEqual(defShape(all))
    // The definitions query itself carries NO account dimension.
    for (const d of defReads()) {
      expect(d.sql).not.toMatch(/account_id/i)
    }
    // pb2 has zero trades in every scope — present, existing zero shape.
    for (const l of [all, single, absent]) {
      expect(l.find((p) => p.id === 2)!.stats).toEqual(EMPTY_STATS)
    }
  })
})

describe('getPlaybook — scope symmetry with the list path', () => {
  it('threads the same optional scope into the stats read', () => {
    const pb = getPlaybook(1, { accountId: 'ACCT-B' })!
    const r = statsReads()[0]
    expect(r.sql).toMatch(/account_id = \?/)
    expect(r.args).toEqual([1, 'ACCT-B'])
    expect(pb.stats.trade_count).toBe(1)
    expect(pb.stats.net_pnl).toBe(-30)
  })

  it("absent scope resolves through the seam (the wall), mirroring the list", () => {
    const pb = getPlaybook(1)!
    expect(statsReads()[0].sql).toContain(SIM_WALL)
    expect(pb.stats.trade_count).toBe(3)
  })
})
