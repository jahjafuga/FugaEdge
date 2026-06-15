import { describe, it, expect } from 'vitest'
import { rvolFor } from '../rvol'

describe('rvolFor', () => {
  it('day volume ÷ avg volume (5,000,000 / 1,000,000 → 5.0)', () => {
    expect(rvolFor(5_000_000, 1_000_000)).toBeCloseTo(5.0, 6)
  })

  it('a 10×+ momentum runner (12,000,000 / 1,000,000 → 12.0)', () => {
    expect(rvolFor(12_000_000, 1_000_000)).toBeCloseTo(12.0, 6)
  })

  it('avgVolume ≤ 0 → null (uncomputable, no divide-by-zero)', () => {
    expect(rvolFor(5_000_000, 0)).toBeNull()
    expect(rvolFor(5_000_000, -1)).toBeNull()
  })

  it('dayVolume ≤ 0 → null', () => {
    expect(rvolFor(0, 1_000_000)).toBeNull()
    expect(rvolFor(-5, 1_000_000)).toBeNull()
  })

  it('a missing cache read (null / undefined) → null', () => {
    expect(rvolFor(undefined, 1_000_000)).toBeNull() // daily_volumes[date] absent
    expect(rvolFor(5_000_000, null)).toBeNull() // avg_volume null
  })

  it('non-finite inputs → null', () => {
    expect(rvolFor(Number.NaN, 1_000_000)).toBeNull()
    expect(rvolFor(5_000_000, Number.NaN)).toBeNull()
  })
})
