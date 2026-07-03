// Stage 3 beat 1 — the balance reader. MIRRORS goals/equity.ts (the >= anchor
// convention + the money-track sim semantics), never imports it. ONE ANCHOR
// governs all three sums: deposits, withdrawals, AND trade P&L each filter
// date >= the starting row's date — proven with poisoned pre-anchor routes
// (the legacy route folds a pre-anchor deposit and a pre-anchor trade in, so
// a missing anchor clause breaks the numbers). The combined roll-up excludes
// sim AT THE READER LEVEL (account selection), includes ARCHIVED non-sim
// accounts, and composes PER-ACCOUNT windows — a trade dated between two
// accounts' anchors counts for the earlier-anchored account only (the
// single-SUM impossibility, recon item 1). No starting row -> NULL, never 0;
// the roll-up names missing-anchor accounts in its coverage.

import { describe, expect, it, beforeEach, vi } from 'vitest'

let gets: { sql: string; args: unknown[] }[] = []
let alls: { sql: string; args: unknown[] }[] = []

// Per-account starting rows.
const STARTING: Record<string, { amount: number; date: string } | undefined> = {}
// Clean per-(account|anchor) sums vs poisoned no-anchor routes.
let depositSums: Record<string, number> = {}
let withdrawalSums: Record<string, number> = {}
let pnlSums: Record<string, number> = {}
let accountRows: { id: string; account_type: string; status: string }[] = []

function anchoredKey(sql: string, args: unknown[]): string | null {
  // The clean route REQUIRES the anchor clause; args = [account, anchor].
  if (!/date >= \?/.test(sql)) return null
  return `${args[0]}|${args[1]}`
}

const POISON = 999_999

const mockDb = {
  prepare(sql: string) {
    return {
      get: (...args: unknown[]) => {
        gets.push({ sql, args })
        if (/FROM cash_events WHERE account_id = \? AND kind = 'starting'/.test(sql)) {
          return STARTING[args[0] as string]
        }
        if (/SUM\(amount\)/.test(sql) && /kind = 'deposit'/.test(sql)) {
          const k = anchoredKey(sql, args)
          return { total: k ? (depositSums[k] ?? 0) : POISON }
        }
        if (/SUM\(amount\)/.test(sql) && /kind = 'withdrawal'/.test(sql)) {
          const k = anchoredKey(sql, args)
          return { total: k ? (withdrawalSums[k] ?? 0) : POISON }
        }
        if (/SUM\(net_pnl\)/.test(sql) && /FROM trades/.test(sql)) {
          const k = anchoredKey(sql, args)
          return { total: k ? (pnlSums[k] ?? 0) : POISON }
        }
        return undefined
      },
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        if (/FROM accounts/.test(sql)) return accountRows
        return []
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { balanceForAccount, combinedBalance } from '../balance'

beforeEach(() => {
  gets = []
  alls = []
  for (const k of Object.keys(STARTING)) delete STARTING[k]
  STARTING['ACCT-A'] = { amount: 1000, date: '2026-01-01' }
  STARTING['ACCT-B'] = { amount: 2000, date: '2026-06-01' }
  STARTING['ACCT-SIM'] = { amount: 5000, date: '2026-01-01' }
  depositSums = {
    'ACCT-A|2026-01-01': 200,
    'ACCT-B|2026-06-01': 0,
    'ACCT-SIM|2026-01-01': 0,
  }
  withdrawalSums = {
    'ACCT-A|2026-01-01': 50,
    'ACCT-B|2026-06-01': 0,
    'ACCT-SIM|2026-01-01': 0,
  }
  // The composition fixture: a trade dated 2026-03-15 (between the anchors)
  // is inside A's window and OUTSIDE B's — A's anchored sum includes it
  // (60 + 40), B's does not (25 from June onward only).
  pnlSums = {
    'ACCT-A|2026-01-01': 100,
    'ACCT-B|2026-06-01': 25,
    'ACCT-SIM|2026-01-01': 999, // the poisoned practice gain
  }
  accountRows = [
    { id: 'ACCT-A', account_type: 'margin', status: 'active' },
    { id: 'ACCT-B', account_type: 'cash', status: 'archived' },
    { id: 'ACCT-C', account_type: 'margin', status: 'active' }, // no starting row
  ]
})

describe('balanceForAccount — one anchor governs all three sums', () => {
  it('anchored account: starting + deposits - withdrawals + P&L, every sum date >= the anchor', () => {
    const b = balanceForAccount('ACCT-A')!
    expect(b).toBeTruthy()
    expect(b.starting).toBe(1000)
    expect(b.deposits).toBe(200)
    expect(b.withdrawals).toBe(50)
    expect(b.net_pnl).toBe(100)
    expect(b.balance).toBe(1250)
    expect(b.anchor_date).toBe('2026-01-01')
    // SQL contracts: the three sums all carry the anchor clause + binds
    // (the shim's poisoned no-anchor route returns 999,999 — the numbers
    // above prove the clean route was taken).
    const sums = gets.filter((g) => /SUM\(/.test(g.sql))
    expect(sums).toHaveLength(3)
    for (const s of sums) {
      expect(s.sql).toMatch(/date >= \?/)
      expect(s.args).toEqual([expect.any(String), '2026-01-01'])
    }
    // The trades read mirrors the seam conventions: deleted_at + account bind.
    const trades = gets.find((g) => /FROM trades/.test(g.sql))!
    expect(trades.sql).toMatch(/deleted_at IS NULL/i)
    expect(trades.sql).toMatch(/account_id = \?/)
    expect(trades.args[0]).toBe('ACCT-A')
  })

  it('NO starting row -> NULL, never 0 (the no-fabricated-data law)', () => {
    expect(balanceForAccount('ACCT-C')).toBeNull()
  })

  it("a sim account's OWN balance computes normally (the practice ledger)", () => {
    const b = balanceForAccount('ACCT-SIM')!
    expect(b.balance).toBe(5000 + 999)
  })
})

describe('combinedBalance — the composing sim-walled roll-up with coverage', () => {
  it('composes PER-ACCOUNT windows: the between-anchors trade counts for the earlier anchor only', () => {
    const c = combinedBalance()
    // A: 1000+200-50+100 = 1250 (the 2026-03-15 trade INSIDE its window);
    // B: 2000+0-0+25 = 2025 (the same trade OUTSIDE its later window).
    expect(c.total).toBe(1250 + 2025)
    // The per-account trades sums were issued with DISTINCT anchors.
    const tradeSums = gets.filter((g) => /SUM\(net_pnl\)/.test(g.sql))
    const bindPairs = tradeSums.map((g) => `${g.args[0]}|${g.args[1]}`)
    expect(bindPairs).toContain('ACCT-A|2026-01-01')
    expect(bindPairs).toContain('ACCT-B|2026-06-01')
  })

  it('sim is excluded AT THE READER LEVEL: the account selection excludes sim and no sim read ever fires', () => {
    combinedBalance()
    const acctRead = alls.find((a) => /FROM accounts/.test(a.sql))!
    expect(acctRead.sql).toMatch(/account_type != 'sim'/)
    // The poisoned +999 sim gain can never enter: no read binds the sim id.
    expect(gets.some((g) => g.args.includes('ACCT-SIM'))).toBe(false)
  })

  it('an ARCHIVED non-sim account IS included (archiving is decluttering, not a cash event)', () => {
    const c = combinedBalance()
    // B is archived and contributes 2025 — already proven by the total; the
    // account selection must NOT filter on status.
    const acctRead = alls.find((a) => /FROM accounts/.test(a.sql))!
    expect(acctRead.sql).not.toMatch(/status/)
    expect(c.total).toBe(3275)
  })

  it('a missing-anchor account is excluded from the total and NAMED in the coverage', () => {
    const c = combinedBalance()
    expect(c.missing_anchor).toEqual(['ACCT-C'])
    expect(c.total).toBe(3275) // still computed over the anchored rest
  })
})
