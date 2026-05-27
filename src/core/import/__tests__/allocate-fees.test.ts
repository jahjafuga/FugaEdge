import { describe, expect, it } from 'vitest'
import { allocateFees, zeroAllocation } from '../allocate-fees'

// Day 3 of v0.2.0: ECN can be NEGATIVE (maker rebate). v0.1.6 clamped
// each allocated component to >= 0, which destroyed the rebate after
// pro-rata distribution. These tests pin the sign-preserving contract.

describe('allocateFees — single trip', () => {
  it('allocates the entire bucket to the only trip', () => {
    const trips = [{ id: 1, total_shares: 200 }]
    const fees = { fee_ecn: 0.3, fee_sec: 0.02, fee_finra: 0.05, fee_htb: 0, fee_cat: 0.01 }
    const out = allocateFees(trips, fees)
    expect(out).toHaveLength(1)
    expect(out[0].fee_ecn).toBe(0.3)
    expect(out[0].fee_sec).toBe(0.02)
    expect(out[0].fee_finra).toBe(0.05)
    expect(out[0].fee_cat).toBe(0.01)
    expect(out[0].total_fees).toBeCloseTo(0.38, 2)
  })

  it('preserves negative ECN as a rebate on the single trip', () => {
    // v0.1.6 would clamp this to 0 and silently lose the rebate.
    const trips = [{ id: 1, total_shares: 200 }]
    const fees = { fee_ecn: -0.5, fee_sec: 0.02, fee_finra: 0.05, fee_htb: 0, fee_cat: 0.01 }
    const out = allocateFees(trips, fees)
    expect(out[0].fee_ecn).toBe(-0.5)
    // 0.02 + 0.05 + 0 + 0.01 = 0.08 debits, − 0.50 rebate = −0.42 net.
    expect(out[0].total_fees).toBeCloseTo(-0.42, 2)
  })
})

describe('allocateFees — multi-trip pro-rata', () => {
  it('splits positive fees by share ratio', () => {
    // Two trips, 100 and 300 shares (25% / 75%). Source ECN = 0.40 →
    // 0.10 / 0.30.
    const trips = [
      { id: 1, total_shares: 100 },
      { id: 2, total_shares: 300 },
    ]
    const fees = { fee_ecn: 0.4, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0 }
    const out = allocateFees(trips, fees)
    expect(out[0].fee_ecn).toBeCloseTo(0.1, 2)
    expect(out[1].fee_ecn).toBeCloseTo(0.3, 2)
    // Sum must equal source exactly (no penny drift).
    expect(out[0].fee_ecn + out[1].fee_ecn).toBeCloseTo(0.4, 2)
  })

  it('splits a negative ECN rebate proportionally (signed pro-rata)', () => {
    // Source ECN = −1.00 across two trips of 100 / 300 shares.
    // Trip 1 gets 25% = −0.25, Trip 2 gets 75% = −0.75.
    const trips = [
      { id: 1, total_shares: 100 },
      { id: 2, total_shares: 300 },
    ]
    const fees = { fee_ecn: -1.0, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0 }
    const out = allocateFees(trips, fees)
    expect(out[0].fee_ecn).toBeCloseTo(-0.25, 2)
    expect(out[1].fee_ecn).toBeCloseTo(-0.75, 2)
    // Net allocation equals source (sign-preserving).
    expect(out[0].fee_ecn + out[1].fee_ecn).toBeCloseTo(-1.0, 2)
  })

  it('residue fix lands on the last trip across three trips with mixed signs', () => {
    // 33% / 33% / 33% across three trips. ECN = −0.10 doesn't split
    // evenly — naive pro-rata gives −0.0333… × 3 = −0.0999, leaving a
    // 0.0001 cent residue. The last-trip absorbs it so the SUM equals
    // the source exactly.
    const trips = [
      { id: 1, total_shares: 100 },
      { id: 2, total_shares: 100 },
      { id: 3, total_shares: 100 },
    ]
    const fees = { fee_ecn: -0.1, fee_sec: 0.03, fee_finra: 0, fee_htb: 0, fee_cat: 0 }
    const out = allocateFees(trips, fees)
    const ecnSum = out.reduce((acc, a) => acc + a.fee_ecn, 0)
    const secSum = out.reduce((acc, a) => acc + a.fee_sec, 0)
    expect(ecnSum).toBeCloseTo(-0.1, 2)
    expect(secSum).toBeCloseTo(0.03, 2)
  })

  it('end-to-end sign preservation: negative ECN flows into total_fees', () => {
    // Realistic Tester B-shape day: 5 trips on the same (date, symbol)
    // with a −$2.00 ECN rebate spread across them. Every trip's
    // total_fees must be ≤ 0 (rebate exceeds zero debits in this test).
    const trips = [
      { id: 1, total_shares: 100 },
      { id: 2, total_shares: 100 },
      { id: 3, total_shares: 100 },
      { id: 4, total_shares: 100 },
      { id: 5, total_shares: 100 },
    ]
    const fees = { fee_ecn: -2.0, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0 }
    const out = allocateFees(trips, fees)
    for (const a of out) {
      expect(a.fee_ecn).toBeLessThan(0)
      expect(a.total_fees).toBeLessThan(0)
    }
    // Sum lines up with source.
    const total = out.reduce((acc, a) => acc + a.total_fees, 0)
    expect(total).toBeCloseTo(-2.0, 2)
  })
})

describe('allocateFees — degenerate inputs', () => {
  it('returns [] on empty trips', () => {
    expect(allocateFees([], { fee_ecn: 1, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0 })).toEqual([])
  })

  it('returns [] when total_shares across the bucket is zero', () => {
    // No real trip should hit this — defensive guard against zero-share
    // buckets (no division by zero, no NaN propagation).
    const trips = [{ id: 1, total_shares: 0 }]
    const fees = { fee_ecn: 1, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0 }
    expect(allocateFees(trips, fees)).toEqual([])
  })
})

describe('zeroAllocation', () => {
  it('zeros every fee component on every trip', () => {
    const trips = [
      { id: 1, total_shares: 100 },
      { id: 2, total_shares: 200 },
    ]
    const out = zeroAllocation(trips)
    expect(out).toHaveLength(2)
    for (const a of out) {
      expect(a.fee_ecn).toBe(0)
      expect(a.fee_sec).toBe(0)
      expect(a.fee_finra).toBe(0)
      expect(a.fee_htb).toBe(0)
      expect(a.fee_cat).toBe(0)
      expect(a.total_fees).toBe(0)
    }
  })
})
