// Beat 2 — the "wired" stat tier on the Compare comparison result. Three stats
// that are NOT on PeriodMetrics but ARE already computed by existing pure fns
// get attached per period inside computePeriodComparison:
//   avgDailyVolume  <- computeFullStats(rows).avg_daily_volume
//   avgHoldScratch  <- computeFullStats(rows).avg_hold_seconds_scratches
//   maxDrawdown     <- computeDrawdown(buildEquityCurve(rows)).amount  (null when empty)
//
// No new math — this test pins that the wiring reaches periodA/periodB with the
// numbers the underlying pure fns produce, over a hand-computable fixture.

import { describe, expect, it } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import type { DateRange } from '../types'
import { computePeriodComparison } from '../comparison'

function tradeRow(overrides: Partial<TradeListRow>): TradeListRow {
  return {
    id: 0,
    date: '2026-05-11',
    symbol: 'TEST',
    side: 'long',
    open_time: '2026-05-11T09:30:00',
    close_time: '2026-05-11T09:45:00',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 1,
    shares_sold: 100,
    avg_sell_price: 1,
    gross_pnl: 0,
    total_fees: 0,
    net_pnl: 0,
    executions: [],
    note: null,
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
    playbook_id: null,
    playbook_name: null,
    playbook_tier: null,
    confidence: null,
    mistakes: [],
    planned_risk: null,
    planned_stop_loss_price: null,
    risk_per_share: null,
    total_risk: null,
    r_multiple: null,
    float_shares: null,
    shares_outstanding: null,
    catalyst_type: null,
    days_since_catalyst: null,
    country: null,
    country_name: 'Unknown',
    region: 'Unknown',
    country_source: 'unknown',
    attachment_count: 0,
    secondary_tag_count: 0,
    deleted_at: null,
    mae: null,
    mfe: null,
    daily_change_pct: null,
    rvol: null,
    ...overrides,
  }
}

const RANGE_A: DateRange = { from: '2026-05-01', to: '2026-05-31' }
const RANGE_B: DateRange = { from: '2026-06-01', to: '2026-06-30' }

// Period A (May) — 3 trading days, an equity dip, and one scratch trade.
//   Volume: shares (bought+sold) = 300 + 200 + 400 + 300 = 1200 over 3 days -> 400/day
//   Scratch hold: the one net=0 trade ran 13:30:00 -> 13:35:00 = 300s
//   Equity by day: 05-04 = 100+0 = 100, 05-05 = -60 -> 40, 05-06 = +30 -> 70
//     peak 100 (day 1), trough 40 (day 2) -> max drawdown amount = 60
// Period B (June) — 3 trading days, monotonically rising equity, no scratch.
//   Volume: 200 + 200 + 200 = 600 over 3 days -> 200/day
//   Equity: 50 -> 90 -> 110 (only up) -> max drawdown amount = 0 (all-up branch)
//   No scratch trade -> avg_hold_seconds_scratches = null
const FIXTURE: TradeListRow[] = [
  // — Period A —
  tradeRow({ date: '2026-05-04', net_pnl: 100, shares_bought: 150, shares_sold: 150,
             open_time: '2026-05-04T13:30:00Z', close_time: '2026-05-04T13:45:00Z' }),
  tradeRow({ date: '2026-05-04', net_pnl: 0, shares_bought: 100, shares_sold: 100, // SCRATCH
             open_time: '2026-05-04T13:30:00Z', close_time: '2026-05-04T13:35:00Z' }),
  tradeRow({ date: '2026-05-05', net_pnl: -60, shares_bought: 200, shares_sold: 200,
             open_time: '2026-05-05T13:30:00Z', close_time: '2026-05-05T13:45:00Z' }),
  tradeRow({ date: '2026-05-06', net_pnl: 30, shares_bought: 150, shares_sold: 150,
             open_time: '2026-05-06T13:30:00Z', close_time: '2026-05-06T13:45:00Z' }),
  // — Period B —
  tradeRow({ date: '2026-06-02', net_pnl: 50, shares_bought: 100, shares_sold: 100,
             open_time: '2026-06-02T13:30:00Z', close_time: '2026-06-02T13:45:00Z' }),
  tradeRow({ date: '2026-06-03', net_pnl: 40, shares_bought: 100, shares_sold: 100,
             open_time: '2026-06-03T13:30:00Z', close_time: '2026-06-03T13:45:00Z' }),
  tradeRow({ date: '2026-06-04', net_pnl: 20, shares_bought: 100, shares_sold: 100,
             open_time: '2026-06-04T13:30:00Z', close_time: '2026-06-04T13:45:00Z' }),
]

describe('computePeriodComparison — wired stat tier (volume / scratch-hold / drawdown)', () => {
  const comparison = computePeriodComparison(FIXTURE, RANGE_A, RANGE_B)

  it('period A: volume 400/day, scratch hold 300s, max drawdown 60', () => {
    expect(comparison.periodA.avgDailyVolume).toBeCloseTo(400, 6) // 1200 shares / 3 days
    expect(comparison.periodA.avgHoldScratch).toBeCloseTo(300, 6) // the lone net=0 trade
    expect(comparison.periodA.maxDrawdown).toBeCloseTo(60, 6) // peak 100 -> trough 40
  })

  it('period B: volume 200/day, no scratch -> null hold, all-up -> drawdown 0', () => {
    expect(comparison.periodB.avgDailyVolume).toBeCloseTo(200, 6) // 600 shares / 3 days
    expect(comparison.periodB.avgHoldScratch).toBeNull() // no scratch trades
    expect(comparison.periodB.maxDrawdown).toBe(0) // monotonic-up equity (all-up branch)
  })

  // Phase 1 (djsevans87) — the per-share + shares-traded wired fields flow from
  // computeFullStats(rows) onto periodA/periodB, same pattern as the three above.
  // Period A per-share (position = max legs): T1 +100/150, T4 +30/150 (winners),
  // T3 -60/200 (loser); T2 is the net=0 scratch (excluded from gain/loss).
  it('period A: per-share gain/loss/extremes + pooled per-share + shares traded', () => {
    expect(comparison.periodA.avgPerShareGain).toBeCloseTo((100 / 150 + 30 / 150) / 2, 6)
    expect(comparison.periodA.maxPerShareWin).toBeCloseTo(100 / 150, 6)
    expect(comparison.periodA.avgPerShareLoss).toBeCloseTo(-60 / 200, 6) // -0.30
    expect(comparison.periodA.maxPerShareLoss).toBeCloseTo(-60 / 200, 6) // lone loser
    expect(comparison.periodA.avgPerSharePnl).toBeCloseTo(70 / 600, 6) // pooled net / Σ position
    expect(comparison.periodA.totalSharesTraded).toBe(1200) // both-leg sum
  })

  it('period B: all winners -> loss-side per-share null; shares traded 600', () => {
    expect(comparison.periodB.avgPerShareGain).toBeCloseTo((0.5 + 0.4 + 0.2) / 3, 6)
    expect(comparison.periodB.maxPerShareWin).toBeCloseTo(0.5, 6)
    expect(comparison.periodB.avgPerShareLoss).toBeNull()
    expect(comparison.periodB.maxPerShareLoss).toBeNull()
    expect(comparison.periodB.totalSharesTraded).toBe(600)
  })
})
