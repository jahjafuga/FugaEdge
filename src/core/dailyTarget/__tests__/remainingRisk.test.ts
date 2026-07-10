import { describe, it, expect } from 'vitest'
import { remainingRisk } from '../remainingRisk'

// How much the trader can STILL lose from their CURRENT P&L before hitting the
// max-daily-loss floor (-maxDailyLoss). Profit is CREDITED as buffer: a green
// day GROWS it, unbounded above the cap; a drawdown shrinks it; it never goes
// negative (floored at 0 once the floor is reached or breached). Null when the
// cap isn't set (mirrors MaxLossBanner bailing). maxDailyLoss is the POSITIVE
// cap magnitude, so buffer = todayPnl - (-maxDailyLoss) = todayPnl + maxDailyLoss.

describe('remainingRisk', () => {
  // ── null-guard: cap not set / invalid → null (widget shows "—") ──
  it('returns null when maxDailyLoss is 0 (not set)', () => {
    expect(remainingRisk(50, 0)).toBeNull()
  })

  it('returns null when maxDailyLoss is negative (<= 0)', () => {
    expect(remainingRisk(-40, -120)).toBeNull()
  })

  it('returns null when maxDailyLoss is non-finite', () => {
    expect(remainingRisk(50, Number.NaN)).toBeNull()
    expect(remainingRisk(-40, Number.POSITIVE_INFINITY)).toBeNull()
  })

  // ── profit CREDITED as buffer (the new definition; reverses the old "full
  //    cap on any green/flat day") ──
  it('green day (+86 / cap 120): profit credited → 206 (was 120)', () => {
    expect(remainingRisk(86, 120)).toBe(206)
  })

  it('flat day (0 / cap 120): full cap → 120', () => {
    expect(remainingRisk(0, 120)).toBe(120)
  })

  // ── screenshot cases ──
  it('screenshot +16 / cap 50: profit credited → 66 (was 50)', () => {
    expect(remainingRisk(16, 50)).toBe(66)
  })

  it('screenshot -8 / cap 50: drawdown → 42 (unchanged)', () => {
    expect(remainingRisk(-8, 50)).toBe(42)
  })

  it('great day +100 / cap 50: UNBOUNDED above the cap → 150 (exceeds cap)', () => {
    const left = remainingRisk(100, 50)
    expect(left).toBe(150)
    expect(left).toBeGreaterThan(50) // explicitly exceeds the cap magnitude
  })

  // ── drawdown shrinks the buffer, floored at 0 (never negative) ──
  it('drawdown -40 / cap 120 → 80 left', () => {
    expect(remainingRisk(-40, 120)).toBe(80)
  })

  it('exactly at the floor -120 / cap 120 → 0 left', () => {
    expect(remainingRisk(-120, 120)).toBe(0)
  })

  it('below the floor -150 / cap 120 → 0 (clamped, never negative)', () => {
    expect(remainingRisk(-150, 120)).toBe(0)
  })
})
