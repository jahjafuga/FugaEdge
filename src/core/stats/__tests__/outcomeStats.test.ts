// Beat 4a — computeOutcomeStats: the single Convention-A (scratch-EXCLUDED)
// outcome-stats helper, extracted from the three inline copies (tiers.ts,
// repo.ts, metrics.ts). Pure. Hand-computed expectations lock the EXACT
// behavior those three shipped (win_rate over winners+losers; expectancy
// WR·avgW − (1−WR)·|avgL|; profit_factor winnersSum/|losersSum|; the null /
// zero / Infinity guards as they exist today).

import { describe, expect, it } from 'vitest'
import { computeOutcomeStats } from '../outcomeStats'

const T = (...pnls: number[]) => pnls.map((net_pnl) => ({ net_pnl }))

describe('computeOutcomeStats', () => {
  it('mixed set — scratches excluded from the win-rate denominator', () => {
    // 2 winners (150), 3 losers (-60), 1 scratch (0.003). decided = 5.
    const s = computeOutcomeStats(T(100, 50, -30, -20, -10, 0.003))
    expect(s.winners).toBe(2)
    expect(s.losers).toBe(3)
    expect(s.scratches).toBe(1)
    expect(s.net_pnl).toBeCloseTo(90.003, 6)
    expect(s.win_rate).toBeCloseTo(0.4, 10) // 2 / (2+3), scratch NOT in denominator
    expect(s.avg_winner).toBeCloseTo(75, 10) // 150/2
    expect(s.avg_loser).toBeCloseTo(-20, 10) // -60/3
    expect(s.expectancy).toBeCloseTo(18, 10) // 0.4*75 − 0.6*20
    expect(s.profit_factor).toBeCloseTo(2.5, 10) // 150/60
  })

  it('all winners — no losers → profit_factor null, expectancy null (no avg_loser)', () => {
    const s = computeOutcomeStats(T(10, 20, 30))
    expect(s.winners).toBe(3)
    expect(s.losers).toBe(0)
    expect(s.win_rate).toBe(1) // 3/3
    expect(s.avg_winner).toBeCloseTo(20, 10)
    expect(s.avg_loser).toBeNull()
    expect(s.profit_factor).toBeNull() // losers === 0
    expect(s.expectancy).toBeNull() // avg_loser null
  })

  it('all losers — no winners → win_rate 0, profit_factor 0, expectancy null', () => {
    const s = computeOutcomeStats(T(-10, -20))
    expect(s.winners).toBe(0)
    expect(s.losers).toBe(2)
    expect(s.net_pnl).toBeCloseTo(-30, 10)
    expect(s.win_rate).toBe(0) // 0/(0+2)
    expect(s.avg_winner).toBeNull()
    expect(s.avg_loser).toBeCloseTo(-15, 10)
    expect(s.profit_factor).toBe(0) // 0 / |−30|
    expect(s.expectancy).toBeNull() // avg_winner null
  })

  it('all scratches — decided 0 → every ratio null', () => {
    const s = computeOutcomeStats(T(0, 0.004, -0.002))
    expect(s.winners).toBe(0)
    expect(s.losers).toBe(0)
    expect(s.scratches).toBe(3)
    expect(s.win_rate).toBeNull()
    expect(s.avg_winner).toBeNull()
    expect(s.avg_loser).toBeNull()
    expect(s.profit_factor).toBeNull()
    expect(s.expectancy).toBeNull()
  })

  it('single trade', () => {
    const s = computeOutcomeStats(T(42))
    expect(s.winners).toBe(1)
    expect(s.win_rate).toBe(1)
    expect(s.avg_winner).toBe(42)
    expect(s.profit_factor).toBeNull()
    expect(s.expectancy).toBeNull()
  })

  it('empty set — zeros and nulls, no division by zero', () => {
    const s = computeOutcomeStats([])
    expect(s).toEqual({
      winners: 0,
      losers: 0,
      scratches: 0,
      net_pnl: 0,
      win_rate: null,
      expectancy: null,
      profit_factor: null,
      avg_winner: null,
      avg_loser: null,
    })
  })

  it('SCRATCH_EPSILON boundary — |net| ≤ 0.005 is a scratch (inclusive)', () => {
    // 0.005 / -0.005 scratch; 0.006 win; -0.006 loss.
    const s = computeOutcomeStats(T(0.005, -0.005, 0.006, -0.006))
    expect(s.scratches).toBe(2)
    expect(s.winners).toBe(1)
    expect(s.losers).toBe(1)
    expect(s.win_rate).toBe(0.5)
  })
})
