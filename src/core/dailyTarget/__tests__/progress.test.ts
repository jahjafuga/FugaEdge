import { describe, it, expect } from 'vitest'
import { dailyTargetProgress } from '../progress'

// Pure helper — mirrors MaxLossBanner's "bail when the threshold isn't set"
// stance: target <= 0 (or non-finite) means NOT SET → null. Otherwise report
// the raw fraction (unclamped — a 150% day is real) and whether the target is hit.

describe('dailyTargetProgress', () => {
  it('returns null when target is 0 (not set)', () => {
    expect(dailyTargetProgress(120, 0)).toBeNull()
  })

  it('returns null when target is negative', () => {
    expect(dailyTargetProgress(120, -240)).toBeNull()
  })

  it('returns null when target is non-finite', () => {
    expect(dailyTargetProgress(120, Number.NaN)).toBeNull()
    expect(dailyTargetProgress(120, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('half-way: 120 / 240 → fraction 0.5, not hit', () => {
    expect(dailyTargetProgress(120, 240)).toEqual({ fraction: 0.5, hit: false })
  })

  it('exactly at target: 240 / 240 → fraction 1, hit', () => {
    expect(dailyTargetProgress(240, 240)).toEqual({ fraction: 1, hit: true })
  })

  it('over target: 300 / 240 → fraction 1.25, hit (unclamped)', () => {
    expect(dailyTargetProgress(300, 240)).toEqual({ fraction: 1.25, hit: true })
  })

  it('negative P&L: -50 / 240 → negative fraction, not hit', () => {
    const r = dailyTargetProgress(-50, 240)
    expect(r).not.toBeNull()
    expect(r!.fraction).toBeCloseTo(-50 / 240, 10)
    expect(r!.hit).toBe(false)
  })

  it('zero P&L: 0 / 240 → fraction 0, not hit', () => {
    expect(dailyTargetProgress(0, 240)).toEqual({ fraction: 0, hit: false })
  })
})
