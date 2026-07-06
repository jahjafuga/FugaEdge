// Beat F0 — the fee allocator now MAINTAINS the precise fee/net columns it
// previously left stale (total_fees_precise = 0 after a 2dp allocation). Structural
// mock-shim test (better-sqlite3's Electron ABI won't load under vitest — the
// get-mistakes.test.ts idiom): capture the UPDATE SQL apply-fees prepares and assert
//   - the two ADDITIVE precise SET lines are present, and
//   - the existing 2dp SET lines are byte-unchanged (purely additive).
// Allocated total_fees is exact-2dp (allocate-fees.ts last-trip residue), so
// total_fees_precise = @total_fees is lossless; net_pnl_precise = gross_pnl_precise
// - @total_fees reads the precise gross the insert already set (repo.ts:462, before
// this UPDATE runs). Row outcomes proven in the STEP 4 rehearsal.

import { describe, expect, it, vi } from 'vitest'

let capturedUpdateSql = ''

const mockDb = {
  prepare(sql: string) {
    const q = sql.replace(/\s+/g, ' ').trim()
    if (/^UPDATE trades SET/i.test(q)) capturedUpdateSql = q
    return {
      // The (date, symbol) trip bucket — one fees_reported = 0 trip.
      all: (..._a: unknown[]) =>
        /FROM trades\b/i.test(q) ? [{ id: 1, total_shares: 100 }] : [],
      // The matching day_fees row.
      get: (..._a: unknown[]) =>
        /FROM day_fees\b/i.test(q)
          ? {
              fee_ecn: 1,
              fee_sec: 0.5,
              fee_finra: 0.25,
              fee_htb: 0,
              fee_cat: 0,
              fee_commission: 0,
              fee_other: 0,
            }
          : undefined,
      run: (..._a: unknown[]) => ({ changes: 1, lastInsertRowid: 0 }),
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { recomputeFeesForDateSymbol } from '../apply-fees'

function captureUpdateSql(): string {
  capturedUpdateSql = ''
  recomputeFeesForDateSymbol('2026-05-01', 'AAPL', 'acct-1')
  return capturedUpdateSql
}

describe('apply-fees allocator — maintains the precise fee/net columns (Beat F0)', () => {
  it('sets total_fees_precise to the allocated 2dp fee (lossless — bucket sums are exact)', () => {
    expect(captureUpdateSql()).toMatch(/total_fees_precise = @total_fees\b/i)
  })

  it('derives net_pnl_precise from the precise gross minus the allocated fee', () => {
    expect(captureUpdateSql()).toMatch(/net_pnl_precise = gross_pnl_precise - @total_fees\b/i)
  })

  it('leaves the 2dp SET lines byte-unchanged (regression guard — purely additive)', () => {
    const sql = captureUpdateSql()
    expect(sql).toMatch(/total_fees = @total_fees\b/i)
    expect(sql).toMatch(/net_pnl = gross_pnl - @total_fees\b/i)
    expect(sql).toMatch(/pnl = gross_pnl - @total_fees\b/i)
  })
})
