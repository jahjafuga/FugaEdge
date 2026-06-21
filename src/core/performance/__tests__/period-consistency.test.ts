// Flagship Compare stats, Group 1 — per-period green/red-day consistency
// (Ross's #1 review metric) + expectancy in R. These extend PeriodMetrics, so
// they ride ComparisonResult.periodA/periodB into the Compare UI in a later beat.
//
// Day classification: a DAY is green/red/breakeven by its AGGREGATE net P&L
// (sum of the day's trades) — NOT the per-trade scratch epsilon. A day either
// made money (>0), lost money (<0), or netted exactly flat (==0).
//
// Expectancy-R is coverage-gated: r_multiple is null without a logged stop/risk,
// so expectancyR is the mean over the COVERED subset only (null if none), and
// rCoverage reports how many trades carried an r_multiple.

import { describe, expect, it } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import type { DateRange } from '../types'
import { computePeriodMetrics } from '../metrics'

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

const RANGE: DateRange = { from: '2026-05-01', to: '2026-05-31' }

// 7 trades over 5 trading days: 2 green, 2 red, 1 breakeven. 5 of 7 carry an
// r_multiple (Day C's +30 trade and Day D's −200 trade are unlogged → null).
//   Day A 05-04 GREEN +150 : +100 (R 2.0) + 50 (R 1.0)
//   Day B 05-05 RED   −80  : −80  (R −1.0)
//   Day C 05-06 EVEN   0   : +30 (R null) + −30 (R 0.5)
//   Day D 05-07 RED   −200 : −200 (R null)
//   Day E 05-08 GREEN  +40 : +40 (R 1.5)
const FIXTURE: TradeListRow[] = [
  tradeRow({ date: '2026-05-04', open_time: '2026-05-04T13:30:00Z', net_pnl: 100, r_multiple: 2.0 }),
  tradeRow({ date: '2026-05-04', open_time: '2026-05-04T14:00:00Z', net_pnl: 50, r_multiple: 1.0 }),
  tradeRow({ date: '2026-05-05', open_time: '2026-05-05T13:30:00Z', net_pnl: -80, r_multiple: -1.0 }),
  tradeRow({ date: '2026-05-06', open_time: '2026-05-06T13:30:00Z', net_pnl: 30, r_multiple: null }),
  tradeRow({ date: '2026-05-06', open_time: '2026-05-06T14:00:00Z', net_pnl: -30, r_multiple: 0.5 }),
  tradeRow({ date: '2026-05-07', open_time: '2026-05-07T13:30:00Z', net_pnl: -200, r_multiple: null }),
  tradeRow({ date: '2026-05-08', open_time: '2026-05-08T13:30:00Z', net_pnl: 40, r_multiple: 1.5 }),
]

describe('computePeriodMetrics — green/red-day consistency + expectancy-R', () => {
  const m = computePeriodMetrics(FIXTURE, RANGE)

  it('green / red / breakeven day counts (by aggregate daily net)', () => {
    expect(m.tradingDays).toBe(5)
    expect(m.greenDays).toBe(2)
    expect(m.redDays).toBe(2)
    expect(m.breakevenDays).toBe(1)
  })

  it('avg + largest green / red day', () => {
    expect(m.avgGreenDay).toBeCloseTo(95, 5) // (150 + 40) / 2
    expect(m.avgRedDay).toBeCloseTo(-140, 5) // (-80 + -200) / 2
    expect(m.largestGreenDay).toBe(150)
    expect(m.largestRedDay).toBe(-200)
  })

  it('green-day pct', () => {
    expect(m.greenDayPct).toBeCloseTo(0.4, 5) // 2 / 5
  })

  it('expectancy-R over the covered subset + r coverage', () => {
    expect(m.expectancyR).toBeCloseTo(0.8, 5) // (2 + 1 - 1 + 0.5 + 1.5) / 5
    expect(m.rCoverage).toBe(5)
  })

  it('no r_multiple anywhere → expectancyR null, rCoverage 0 (day stats still compute)', () => {
    const noR = computePeriodMetrics(
      [tradeRow({ date: '2026-05-04', net_pnl: 100, r_multiple: null })],
      RANGE,
    )
    expect(noR.expectancyR).toBeNull()
    expect(noR.rCoverage).toBe(0)
    expect(noR.greenDays).toBe(1)
  })

  it('zero trades → all day stats 0/null, expectancyR null', () => {
    const empty = computePeriodMetrics([], RANGE)
    expect(empty.tradingDays).toBe(0)
    expect(empty.greenDays).toBe(0)
    expect(empty.redDays).toBe(0)
    expect(empty.breakevenDays).toBe(0)
    expect(empty.avgGreenDay).toBeNull()
    expect(empty.avgRedDay).toBeNull()
    expect(empty.largestGreenDay).toBeNull()
    expect(empty.largestRedDay).toBeNull()
    expect(empty.greenDayPct).toBeNull()
    expect(empty.expectancyR).toBeNull()
    expect(empty.rCoverage).toBe(0)
  })
})
