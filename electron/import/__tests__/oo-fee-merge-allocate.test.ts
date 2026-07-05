// Ocean One fee-merge Beat 2 — the FEE-LANDING half (the penny-tie).
//
// On a covered day the OO trip is superseded (dupe half, sibling test); its fees
// survive as a day_fees row and must land WHOLE on the surviving DAS trade —
// including the two schema-40 columns the allocator didn't used to carry:
// fee_commission (Ocean One's distinct Comm) and fee_other (ORF/OCC/NSCC/…).
//
// Drives the REAL recomputeFeesForDateSymbol + REAL allocate-fees engine over the
// oo-fee-recompute-bypass SQL shim. The day_fees `get` surfaces fee_commission /
// fee_other ONLY when the real SELECT asks for them (mirrors fee-spread gating on
// account_id) — so a SELECT that still lists just the five regulatory columns
// leaves them off and the penny-tie fails, exactly as it does before the fix.

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
  fee_commission: number
  fee_other: number
}

let trades: Row[] = []
let dayFees: DayFeeRow[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      all: (date: string, symbol: string, accountId: string) => {
        if (/FROM\s+trades/i.test(sql) && /total_shares/i.test(sql)) {
          let rows = trades.filter(
            (t) => t.date === date && t.symbol === symbol && t.deleted_at === null,
          )
          if (/fees_reported\s*=\s*0/i.test(sql)) rows = rows.filter((t) => t.fees_reported === 0)
          if (/account_id\s*=\s*\?/i.test(sql)) rows = rows.filter((t) => t.account_id === accountId)
          return rows.map((t) => ({ id: t.id, total_shares: t.shares_bought + t.shares_sold }))
        }
        return []
      },
      get: (date: string, symbol: string, accountId: string) => {
        if (/FROM\s+day_fees/i.test(sql)) {
          const scoped = /account_id\s*=\s*\?/i.test(sql)
          const f = dayFees.find(
            (d) => d.date === date && d.symbol === symbol && (!scoped || d.account_id === accountId),
          )
          if (!f) return undefined
          const base = {
            fee_ecn: f.fee_ecn,
            fee_sec: f.fee_sec,
            fee_finra: f.fee_finra,
            fee_htb: f.fee_htb,
            fee_cat: f.fee_cat,
          }
          // Faithful: surface commission/other ONLY when the SELECT lists them.
          if (/fee_commission/i.test(sql)) {
            return { ...base, fee_commission: f.fee_commission, fee_other: f.fee_other }
          }
          return base
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
    date: '2026-05-01',
    symbol: 'ZZZ',
    account_id: 'ACCT-TEST',
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
function dayFee(over: Partial<DayFeeRow>): DayFeeRow {
  return {
    date: '2026-05-01',
    symbol: 'ZZZ',
    account_id: 'ACCT-TEST',
    fee_ecn: 0,
    fee_sec: 0,
    fee_finra: 0,
    fee_htb: 0,
    fee_cat: 0,
    fee_commission: 0,
    fee_other: 0,
    ...over,
  }
}
const byId = (id: number) => trades.find((t) => t.id === id)!

beforeEach(() => {
  trades = []
  dayFees = []
})

describe('Ocean One fee-merge — covered day: OO fees land WHOLE on the DAS trade', () => {
  it('a single DAS survivor absorbs commission + other into total_fees (penny-tie)', () => {
    trades = [row({ id: 1, fees_reported: 0, gross_pnl: 5 })]
    dayFees = [dayFee({ fee_cat: 0.1, fee_commission: 0.5, fee_other: 0.03 })]
    recomputeFeesForDateSymbol('2026-05-01', 'ZZZ', 'ACCT-TEST')
    // 0.10 + 0.50 + 0.03 = 0.63 — NOT just the 0.10 regulatory slice.
    expect(byId(1).total_fees).toBeCloseTo(0.63, 2)
    expect(byId(1).net_pnl).toBeCloseTo(5 - 0.63, 2)
  })

  it('commission + other split pro-rata across DAS trips, summing to source', () => {
    trades = [
      row({ id: 1, fees_reported: 0, gross_pnl: 5 }),
      row({ id: 2, fees_reported: 0, gross_pnl: 7 }),
    ]
    dayFees = [dayFee({ fee_commission: 0.4, fee_other: 0.8 })]
    recomputeFeesForDateSymbol('2026-05-01', 'ZZZ', 'ACCT-TEST')
    // 200 / 200 shares → 0.60 each; 0.40 + 0.80 = 1.20 total, penny-tied.
    expect(byId(1).total_fees).toBeCloseTo(0.6, 2)
    expect(byId(2).total_fees).toBeCloseTo(0.6, 2)
    expect(byId(1).total_fees + byId(2).total_fees).toBeCloseTo(1.2, 2)
  })
})

describe('Ocean One fee-merge — OO-only day: the OO trip keeps its own fees', () => {
  it('a fees_reported=1 OO trip is excluded from the pool and left untouched', () => {
    trades = [
      row({ id: 1, fees_reported: 1, gross_pnl: 0.03, total_fees: 0.25, net_pnl: -0.22 }),
    ]
    // Its own day_fees row exists (parked) but must NOT be re-applied.
    dayFees = [dayFee({ fee_commission: 0.2, fee_other: 0.05 })]
    recomputeFeesForDateSymbol('2026-05-01', 'ZZZ', 'ACCT-TEST')
    expect(byId(1).total_fees).toBe(0.25)
    expect(byId(1).net_pnl).toBe(-0.22)
  })
})
