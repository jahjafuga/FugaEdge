// Data-honesty #1 — near-zero-base ratio guard. Three blowups share one root
// (a ratio whose base is ~0): Comparison Insights Rule 2 (+547% off a ~-$10
// prior net) and Rule 6 (+95% off a tiny avg winner), and the Quality-tab
// Max-drawdown % (-180% off a ~$50 cumulative-P&L peak). One shared helper
// (safeRatio / relativeChange) floors the base; Rule 2 also reworks to an
// absolute swing because a "% more" against a NEGATIVE prior net is nonsense.

import { describe, expect, it } from 'vitest'
import type { PeriodMetrics } from '../types'
import { relativeChange, safeRatio } from '../ratio'
import { generateComparisonInsights } from '../comparison'
import { buildEquityCurve, computeDrawdown } from '../equity'

// Minimal PeriodMetrics builder — defaults to a quiet period; override only the
// fields the insight rules under test read (trades, netPnL, winRate, avgWinner).
function pm(o: Partial<PeriodMetrics>): PeriodMetrics {
  return {
    range: { from: '2026-05-01', to: '2026-05-31' },
    netPnL: 0, grossPnL: 0, fees: 0, avgTradePnL: null, avgDailyPnL: null, profitFactor: null,
    trades: 0, winners: 0, losers: 0, scratches: 0, tradingDays: 0,
    avgHoldSeconds: null, avgHoldSecondsWinners: null, avgHoldSecondsLosers: null,
    maxConsecutiveWins: 0, maxConsecutiveLosses: 0,
    winRate: null, avgWinner: null, avgLoser: null, largestWinner: null, largestLoser: null, winLossRatio: null,
    bestDay: null, worstDay: null,
    greenDays: 0, redDays: 0, breakevenDays: 0,
    avgGreenDay: null, avgRedDay: null, largestGreenDay: null, largestRedDay: null, greenDayPct: null,
    expectancyR: null, rCoverage: 0,
    mfeCapturePct: null, mfeCaptureCoverage: 0, maeToStop: null, maeToStopCoverage: 0,
    rDistribution: [], rDistCoverage: 0,
    afterBigWinAvgPnl: null, afterBigWinCount: 0, afterBigLossAvgPnl: null, afterBigLossCount: 0,
    ...o,
  }
}

const THREE_PLUS_DIGIT_PCT = /\d{3,}\s*%/ // catches "+547%", "-180%", etc.

describe('safeRatio / relativeChange — shared base floor', () => {
  it('floors on |base| (returns null), else computes', () => {
    expect(relativeChange(45, -10, { baseFloor: 50 })).toBeNull() // |-10| < 50
    expect(relativeChange(500, 200, { baseFloor: 50 })).toBeCloseTo(1.5, 10) // (500-200)/200
    expect(safeRatio(90, 50, { baseFloor: 100 })).toBeNull() // |50| < 100
    expect(safeRatio(1000, 5000, { baseFloor: 100 })).toBeCloseTo(0.2, 10)
  })
})

describe('generateComparisonInsights — Rule 2 (less-trades / overtrading)', () => {
  it('negative prior net -> absolute swing, never a "% more" blowup', () => {
    // The real +547% case: B lost ~$11 on 10 trades, A made ~$49 on 8.
    const a = pm({ trades: 8, netPnL: 48.73, winRate: 0.5, avgWinner: 50 })
    const b = pm({ trades: 10, netPnL: -10.91, winRate: 0.5, avgWinner: 50 })
    const insights = generateComparisonInsights(a, b, [])
    const r2 = insights.find((i) => i.id === 'less-trades-more-pnl' || i.id === 'more-trades-less-pnl')
    expect(r2).toBeDefined()
    expect(r2!.text).not.toMatch(THREE_PLUS_DIGIT_PCT) // no +547%
    expect(r2!.text).not.toContain('% more')
    expect(r2!.text).not.toContain('% less')
    expect(r2!.text).toContain('swung from') // honest absolute wording
  })

  it('healthy positive prior net -> normal "% more" wording', () => {
    const a = pm({ trades: 8, netPnL: 900, winRate: 0.5, avgWinner: 50 })
    const b = pm({ trades: 12, netPnL: 600, winRate: 0.5, avgWinner: 50 })
    const insights = generateComparisonInsights(a, b, [])
    const r2 = insights.find((i) => i.id === 'less-trades-more-pnl')
    expect(r2).toBeDefined()
    expect(r2!.text).toContain('more') // (900-600)/600 = +50% more, fewer trades
    expect(r2!.text).not.toMatch(THREE_PLUS_DIGIT_PCT)
  })
})

describe('generateComparisonInsights — Rule 6 (avg-winner regression)', () => {
  it('tiny avg-winner base -> suppressed (no absurd %)', () => {
    const a = pm({ trades: 5, avgWinner: 40, winRate: 0.5 })
    const b = pm({ trades: 5, avgWinner: 4, winRate: 0.5 }) // $4 base
    const insights = generateComparisonInsights(a, b, [])
    expect(insights.find((i) => i.id === 'avg-winner-move')).toBeUndefined()
  })

  it('healthy base -> normal "X% larger"', () => {
    const a = pm({ trades: 5, avgWinner: 300, winRate: 0.5 })
    const b = pm({ trades: 5, avgWinner: 180, winRate: 0.5 })
    const insights = generateComparisonInsights(a, b, [])
    const r6 = insights.find((i) => i.id === 'avg-winner-move')
    expect(r6).toBeDefined()
    expect(r6!.text).toContain('larger') // (300-180)/180 = +67%
    expect(r6!.text).not.toMatch(THREE_PLUS_DIGIT_PCT)
  })
})

describe('computeDrawdown — % over a tiny cumulative-P&L peak', () => {
  it('tiny peak -> null %, dollar amount unchanged (no -180%)', () => {
    const dd = computeDrawdown(
      buildEquityCurve([
        { date: '2026-05-01', net_pnl: 50 }, // peak +$50
        { date: '2026-05-02', net_pnl: -90 }, // trough -$40
      ]),
    )
    expect(dd?.amount).toBeCloseTo(90, 6) // dollar drawdown UNCHANGED
    expect(dd?.percent).toBeNull() // peak $50 < floor -> no bogus % shown
  })

  it('healthy peak -> percent still computes', () => {
    const dd = computeDrawdown(
      buildEquityCurve([
        { date: '2026-05-01', net_pnl: 5000 }, // peak +$5000
        { date: '2026-05-02', net_pnl: -1000 }, // trough +$4000
      ]),
    )
    expect(dd?.amount).toBeCloseTo(1000, 6)
    expect(dd?.percent).toBeCloseTo(0.2, 6) // 1000 / 5000
  })
})
