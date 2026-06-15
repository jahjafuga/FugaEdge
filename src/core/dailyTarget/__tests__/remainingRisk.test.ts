import { describe, it, expect } from 'vitest'
import { remainingRisk } from '../remainingRisk'

// How much loss budget is left before today hits the max-daily-loss cap.
// Mirrors MaxLossBanner: bail (null) when the cap isn't set. Green/flat days
// leave the full budget intact; a drawdown eats into it; never goes negative.

describe('remainingRisk', () => {
  it('returns null when maxDailyLoss is 0 (not set)', () => {
    expect(remainingRisk(-40, 0)).toBeNull()
  })

  it('returns null when maxDailyLoss is negative', () => {
    expect(remainingRisk(-40, -120)).toBeNull()
  })

  it('returns null when maxDailyLoss is non-finite', () => {
    expect(remainingRisk(-40, Number.NaN)).toBeNull()
    expect(remainingRisk(-40, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('green day (+86): full budget intact → 120', () => {
    expect(remainingRisk(86, 120)).toBe(120)
  })

  it('flat day (0): full budget intact → 120', () => {
    expect(remainingRisk(0, 120)).toBe(120)
  })

  it('drawdown -40 / cap 120 → 80 left', () => {
    expect(remainingRisk(-40, 120)).toBe(80)
  })

  it('exactly at the cap -120 / 120 → 0 left', () => {
    expect(remainingRisk(-120, 120)).toBe(0)
  })

  it('breached -150 / cap 120 → 0 (floored, never negative)', () => {
    expect(remainingRisk(-150, 120)).toBe(0)
  })
})
