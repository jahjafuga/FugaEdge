// Multi-account Beat 2 — the pro-rata fee spread is account-scoped: Account
// A's day_fees can never land on Account B's trades sharing the same
// (date, symbol). Drives the REAL recomputeFeesForDateSymbol + the REAL
// allocate-fees engine over an account-aware in-memory store (the
// oo-fee-recompute-bypass pattern; only the SQLite I/O is faked).

import { describe, expect, it, beforeEach, vi } from 'vitest'

interface Row {
  id: number
  date: string
  symbol: string
  account_id: string
  shares_bought: number
  shares_sold: number
  gross_pnl: number
  total_fees: number
  net_pnl: number
  fees_reported: number
  deleted_at: string | null
}
interface DayFeeRow {
  date: string
  symbol: string
  account_id: string
  fee_ecn: number
  fee_sec: number
  fee_finra: number
  fee_htb: number
  fee_cat: number
}

let trades: Row[] = []
let dayFees: DayFeeRow[] = []
let tripSelectSqls: string[] = []
let feeSelectSqls: string[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      all: (date: string, symbol: string, accountId: string) => {
        if (/FROM\s+trades/i.test(sql) && /total_shares/i.test(sql)) {
          tripSelectSqls.push(sql)
          let rows = trades.filter(
            (t) => t.date === date && t.symbol === symbol && t.deleted_at === null,
          )
          if (/fees_reported\s*=\s*0/i.test(sql)) {
            rows = rows.filter((t) => t.fees_reported === 0)
          }
          // Emulate the account scope only when the SQL carries it — the RED
          // state (unscoped SQL) therefore leaks other accounts' trades.
          if (/account_id\s*=\s*\?/i.test(sql)) {
            rows = rows.filter((t) => t.account_id === accountId)
          }
          return rows.map((t) => ({ id: t.id, total_shares: t.shares_bought + t.shares_sold }))
        }
        return []
      },
      get: (date: string, symbol: string, accountId: string) => {
        if (/FROM\s+day_fees/i.test(sql)) {
          feeSelectSqls.push(sql)
          const scoped = /account_id\s*=\s*\?/i.test(sql)
          const f = dayFees.find(
            (d) =>
              d.date === date &&
              d.symbol === symbol &&
              (!scoped || d.account_id === accountId),
          )
          return f
            ? {
                fee_ecn: f.fee_ecn,
                fee_sec: f.fee_sec,
                fee_finra: f.fee_finra,
                fee_htb: f.fee_htb,
                fee_cat: f.fee_cat,
              }
            : undefined
        }
        return undefined
      },
      run: (a: { id: number; total_fees: number }) => {
        if (/UPDATE\s+trades\s+SET/i.test(sql)) {
          const t = trades.find((x) => x.id === a.id)
          if (t) {
            t.total_fees = a.total_fees
            t.net_pnl = t.gross_pnl - a.total_fees
          }
          return { changes: 1 }
        }
        return { changes: 0 }
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { recomputeFeesForDateSymbol } from '../apply-fees'

function row(over: Partial<Row>): Row {
  return {
    id: 0,
    date: '2026-05-18',
    symbol: 'LABT',
    account_id: 'ACCT-A',
    shares_bought: 100,
    shares_sold: 100,
    gross_pnl: 10,
    total_fees: 0,
    net_pnl: 10,
    fees_reported: 0,
    deleted_at: null,
    ...over,
  }
}
const byId = (id: number) => trades.find((t) => t.id === id)!

beforeEach(() => {
  trades = []
  dayFees = []
  tripSelectSqls = []
  feeSelectSqls = []
})

describe('recomputeFeesForDateSymbol — account-scoped pro-rata spread', () => {
  it('the trip SELECT and the day_fees lookup both carry AND account_id = ?', () => {
    trades = [row({ id: 1 })]
    recomputeFeesForDateSymbol('2026-05-18', 'LABT', 'ACCT-A')
    expect(tripSelectSqls[0]).toMatch(/AND\s+account_id\s*=\s*\?/i)
    expect(feeSelectSqls[0]).toMatch(/AND\s+account_id\s*=\s*\?/i)
  })

  it("Account A's spread touches ONLY A's trades — B's same-(date,symbol) trade is untouched", () => {
    trades = [
      row({ id: 1, account_id: 'ACCT-A' }),
      row({ id: 2, account_id: 'ACCT-B' }),
    ]
    dayFees = [
      { date: '2026-05-18', symbol: 'LABT', account_id: 'ACCT-A', fee_ecn: 0, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0.2 },
    ]
    recomputeFeesForDateSymbol('2026-05-18', 'LABT', 'ACCT-A')
    expect(byId(1).total_fees).toBe(0.2) // A absorbs A's whole pool
    expect(byId(2).total_fees).toBe(0) // B never touched
    expect(byId(2).net_pnl).toBe(10)
  })

  it("two accounts' fee rows coexist for the same (date, symbol) and spread independently", () => {
    trades = [
      row({ id: 1, account_id: 'ACCT-A' }),
      row({ id: 2, account_id: 'ACCT-B' }),
    ]
    dayFees = [
      { date: '2026-05-18', symbol: 'LABT', account_id: 'ACCT-A', fee_ecn: 0, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0.2 },
      { date: '2026-05-18', symbol: 'LABT', account_id: 'ACCT-B', fee_ecn: 0, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0.5 },
    ]
    recomputeFeesForDateSymbol('2026-05-18', 'LABT', 'ACCT-A')
    recomputeFeesForDateSymbol('2026-05-18', 'LABT', 'ACCT-B')
    expect(byId(1).total_fees).toBe(0.2)
    expect(byId(2).total_fees).toBe(0.5)
  })

  it("no day_fees row for THIS account -> its trips zero out; the other account's row is not borrowed", () => {
    trades = [row({ id: 1, account_id: 'ACCT-B', total_fees: 0.3, net_pnl: 9.7 })]
    dayFees = [
      { date: '2026-05-18', symbol: 'LABT', account_id: 'ACCT-A', fee_ecn: 0, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0.2 },
    ]
    recomputeFeesForDateSymbol('2026-05-18', 'LABT', 'ACCT-B')
    expect(byId(1).total_fees).toBe(0) // zeroAllocation, NOT A's 0.2
  })
})
