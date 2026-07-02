// Ocean One Beat 3b — EDIT 2 proof. recomputeFeesForDateSymbol must EXCLUDE
// authoritative-fee trips (fees_reported = 1) from the day_fees pool, fixing
// BOTH failure modes from beat 3a:
//   Mode 1 (no day_fees): an OO trip is no longer zeroed — it keeps the
//           total_fees it was inserted with, instead of being clobbered to 0.
//   Mode 2 (day_fees collision): an OO trip sharing (date,symbol) with a DAS
//           trip is excluded from allocateFees, so the DAS trip gets the FULL
//           pool (its share-weight denominator shrinks back to DAS-only) and
//           the OO trip keeps its own fees.
//
// Drives the REAL recomputeFeesForDateSymbol + the REAL allocate-fees engine.
// better-sqlite3's native binary won't load under vitest, so the mock emulates
// exactly the three queries the function runs — the trip-gathering SELECT (and
// its deleted_at / fees_reported WHERE filter), the day_fees lookup, and the
// per-trip UPDATE — over an in-memory store. Same SQL-emulation pattern as
// read-paths-deleted-filter.test.ts: only the SQLite I/O is faked; the
// allocation math under test is the real module.

import { describe, expect, it, beforeEach, vi } from 'vitest'

interface Row {
  id: number
  date: string
  symbol: string
  shares_bought: number
  shares_sold: number
  gross_pnl: number
  fee_ecn: number
  fee_sec: number
  fee_finra: number
  fee_htb: number
  fee_cat: number
  total_fees: number
  net_pnl: number
  pnl: number
  fees_reported: number
  deleted_at: string | null
}
interface DayFeeRow {
  date: string
  symbol: string
  fee_ecn: number
  fee_sec: number
  fee_finra: number
  fee_htb: number
  fee_cat: number
}
interface Alloc {
  id: number
  fee_ecn: number
  fee_sec: number
  fee_finra: number
  fee_htb: number
  fee_cat: number
  total_fees: number
}

let trades: Row[] = []
let dayFees: DayFeeRow[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      all: (date: string, symbol: string) => {
        // The trip-gathering SELECT (id + total_shares).
        if (/FROM\s+trades/i.test(sql) && /total_shares/i.test(sql)) {
          let rows = trades.filter(
            (t) => t.date === date && t.symbol === symbol && t.deleted_at === null,
          )
          // Emulate the load-bearing exclusion when the SQL carries it.
          if (/fees_reported\s*=\s*0/i.test(sql)) {
            rows = rows.filter((t) => t.fees_reported === 0)
          }
          return rows.map((t) => ({ id: t.id, total_shares: t.shares_bought + t.shares_sold }))
        }
        return []
      },
      get: (date: string, symbol: string) => {
        if (/FROM\s+day_fees/i.test(sql)) {
          const f = dayFees.find((d) => d.date === date && d.symbol === symbol)
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
      run: (a: Alloc) => {
        if (/UPDATE\s+trades\s+SET/i.test(sql)) {
          const t = trades.find((x) => x.id === a.id)
          if (t) {
            t.fee_ecn = a.fee_ecn
            t.fee_sec = a.fee_sec
            t.fee_finra = a.fee_finra
            t.fee_htb = a.fee_htb
            t.fee_cat = a.fee_cat
            t.total_fees = a.total_fees
            // Mirror the real UPDATE: net_pnl = gross_pnl - @total_fees (pnl too).
            t.net_pnl = t.gross_pnl - a.total_fees
            t.pnl = t.gross_pnl - a.total_fees
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
    shares_bought: 100,
    shares_sold: 100,
    gross_pnl: 10,
    fee_ecn: 0,
    fee_sec: 0,
    fee_finra: 0,
    fee_htb: 0,
    fee_cat: 0,
    total_fees: 0,
    net_pnl: 10,
    pnl: 10,
    fees_reported: 0,
    deleted_at: null,
    ...over,
  }
}
const byId = (id: number) => trades.find((t) => t.id === id)!

beforeEach(() => {
  trades = []
  dayFees = []
})

describe('recomputeFeesForDateSymbol bypasses authoritative-fee trips (EDIT 2)', () => {
  it('Mode 1: an OO trip with no day_fees keeps its inline total_fees (not clobbered to 0)', () => {
    trades = [
      row({ id: 1, fees_reported: 1, gross_pnl: 0.03, total_fees: 0.15, net_pnl: -0.12, pnl: -0.12 }),
    ]
    recomputeFeesForDateSymbol('2026-05-18', 'LABT', 'ACCT-TEST') // Beat 2: account param
    expect(byId(1).total_fees).toBe(0.15)
    expect(byId(1).net_pnl).toBe(-0.12)
  })

  it('Mode 2: OO excluded from the pool — DAS gets the full day_fees, OO keeps its own', () => {
    trades = [
      // OO authoritative trip (200 shares), carries total_fees 0.30 from insert.
      row({ id: 1, fees_reported: 1, gross_pnl: 12, total_fees: 0.3, net_pnl: 11.7, pnl: 11.7 }),
      // DAS trip (200 shares) — its fees arrive via the day_fees pool.
      row({ id: 2, fees_reported: 0, gross_pnl: 5, total_fees: 0, net_pnl: 5, pnl: 5 }),
    ]
    dayFees = [
      { date: '2026-05-18', symbol: 'LABT', fee_ecn: 0, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0.1 },
    ]
    recomputeFeesForDateSymbol('2026-05-18', 'LABT', 'ACCT-TEST') // Beat 2: account param
    // DAS gets the WHOLE 0.10 pool (denominator excludes OO's 200 shares).
    expect(byId(2).total_fees).toBe(0.1)
    expect(byId(2).fee_cat).toBe(0.1)
    expect(byId(2).net_pnl).toBe(5 - 0.1)
    // OO keeps its own inline fees, untouched by the pool.
    expect(byId(1).total_fees).toBe(0.3)
    expect(byId(1).net_pnl).toBe(11.7)
  })

  it('regression: a pure-DAS bucket allocates the pool unchanged (DAS flow untouched)', () => {
    trades = [
      row({ id: 1, fees_reported: 0, gross_pnl: 5 }),
      row({ id: 2, fees_reported: 0, gross_pnl: 7 }),
    ]
    dayFees = [
      { date: '2026-05-18', symbol: 'LABT', fee_ecn: 0, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0.1 },
    ]
    recomputeFeesForDateSymbol('2026-05-18', 'LABT', 'ACCT-TEST') // Beat 2: account param
    // 200/200 share split → 0.05 each (residue on the last). Unchanged by the fix.
    expect(byId(1).total_fees).toBe(0.05)
    expect(byId(2).total_fees).toBe(0.05)
  })
})
