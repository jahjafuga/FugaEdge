// Regression coverage for the Reports Daily P&L aggregator.
//
// Guards the multi-round-trip scenario from
// docs/plans/2026-05-14-v0.1.7-multi-roundtrip-bug.md — the v0.1.6/v0.1.7-era
// bug where a trading day with two round trips of the SAME symbol under-
// charted the day's P&L (Reports showed RT1 only and silently dropped RT2).
// The bug doc's anchor case: two ODYS round trips on 2026-05-11, +$17.69 and
// +$6.78, whose true day total is +$24.47.
//
// The bug is structurally absent in current code — the v0.2.0 Day 1
// universal-import rewrite (commit 3f1df7d) replaced the orphaned
// electron/import/compute-trips.ts path the bug doc flagged. These tests are
// the bug doc's "Test 2": they exercise the aggregator unit directly on
// TradeListRow[] and lock the behaviour so it cannot silently regress. The
// round-trip BUILDER unit is covered separately by
// src/core/import/__tests__/buildRoundTrips.test.ts.

import { describe, expect, it } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import {
  computeCumulativePnL,
  computeDailyPnL,
  computeDailyVolume,
  computeDailyWinRate,
} from '../metrics'

// A complete TradeListRow with benign defaults. Tests override only the
// fields the aggregators actually read — date, symbol, open_time, net_pnl,
// shares_bought, shares_sold — plus id for readable fixtures.
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
    deleted_at: null,
    mae: null,
    mfe: null,
    ...overrides,
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────

// (A) The headline scenario: two ODYS round trips on a single day. Bug doc
// anchor — RT1 +$17.69, RT2 +$6.78, true day total +$24.47.
const ODYS_ANCHOR: TradeListRow[] = [
  tradeRow({
    id: 1, date: '2026-05-11', symbol: 'ODYS',
    open_time: '2026-05-11T08:35:11', close_time: '2026-05-11T08:39:50',
    net_pnl: 17.69, gross_pnl: 17.69, shares_bought: 25, shares_sold: 25,
  }),
  tradeRow({
    id: 2, date: '2026-05-11', symbol: 'ODYS',
    open_time: '2026-05-11T08:44:15', close_time: '2026-05-11T08:44:22',
    net_pnl: 6.78, gross_pnl: 6.78, shares_bought: 25, shares_sold: 25,
  }),
]

// (B) Control: two DIFFERENT symbols on the same day. The day point must sum
// across symbols and there must be exactly one date point — a regression to
// (symbol, date) keying would emit two.
const CROSS_SYMBOL_SAME_DAY: TradeListRow[] = [
  tradeRow({
    id: 1, date: '2026-05-11', symbol: 'ODYS',
    open_time: '2026-05-11T08:35:11',
    net_pnl: 17.69, gross_pnl: 17.69, shares_bought: 25, shares_sold: 25,
  }),
  tradeRow({
    id: 2, date: '2026-05-11', symbol: 'NVDA',
    open_time: '2026-05-11T10:02:00',
    net_pnl: -5, gross_pnl: -5, shares_bought: 10, shares_sold: 10,
  }),
]

// (C) Multi-day bound: two ODYS trips on day 1, one on day 2. Proves per-date
// bucketing — not "sum everything into one number".
const MULTI_DAY: TradeListRow[] = [
  ...ODYS_ANCHOR,
  tradeRow({
    id: 3, date: '2026-05-12', symbol: 'ODYS',
    open_time: '2026-05-12T09:31:00', close_time: '2026-05-12T09:40:00',
    net_pnl: 9.1, gross_pnl: 9.1, shares_bought: 30, shares_sold: 30,
  }),
]

// (D) Win + loss on the same symbol/day, so the win rate itself (0.5)
// discriminates a collapse — with two winners, 1/1 and 2/2 both read 1.0.
const WIN_LOSS_SAME_DAY: TradeListRow[] = [
  tradeRow({
    id: 1, date: '2026-05-11', symbol: 'ODYS',
    open_time: '2026-05-11T08:35:11',
    net_pnl: 17.69, gross_pnl: 17.69, shares_bought: 25, shares_sold: 25,
  }),
  tradeRow({
    id: 2, date: '2026-05-11', symbol: 'ODYS',
    open_time: '2026-05-11T08:44:15',
    net_pnl: -10, gross_pnl: -10, shares_bought: 25, shares_sold: 25,
  }),
]

// ── computeDailyPnL ───────────────────────────────────────────────────────

describe('computeDailyPnL — multiple round trips, same symbol same day', () => {
  it('sums both ODYS round trips into the 2026-05-11 day total', () => {
    const points = computeDailyPnL(ODYS_ANCHOR, null)
    expect(points).toHaveLength(1)
    const may11 = points[0]
    expect(may11.date).toBe('2026-05-11')
    // The v0.1.6 bug returned 17.69 here — RT1 only, RT2 silently dropped.
    expect(may11.pnl).toBeCloseTo(24.47, 2)
    expect(may11.tradeCount).toBe(2)
  })

  it('sums across different symbols on the same day into one date point', () => {
    const points = computeDailyPnL(CROSS_SYMBOL_SAME_DAY, null)
    expect(points).toHaveLength(1)
    expect(points[0].date).toBe('2026-05-11')
    expect(points[0].pnl).toBeCloseTo(12.69, 2)
    expect(points[0].tradeCount).toBe(2)
  })

  it('buckets per-day — two trips on day 1, one on day 2, no cross-day merge', () => {
    const points = computeDailyPnL(MULTI_DAY, null)
    expect(points.map((p) => p.date)).toEqual(['2026-05-11', '2026-05-12'])
    expect(points[0].pnl).toBeCloseTo(24.47, 2)
    expect(points[0].tradeCount).toBe(2)
    expect(points[1].pnl).toBeCloseTo(9.1, 2)
    expect(points[1].tradeCount).toBe(1)
  })
})

// ── computeDailyVolume (independent per-date Map — does NOT inherit) ───────

describe('computeDailyVolume — multiple round trips, same symbol same day', () => {
  it('sums share volume across both same-day round trips', () => {
    const points = computeDailyVolume(ODYS_ANCHOR, null)
    expect(points).toHaveLength(1)
    expect(points[0].date).toBe('2026-05-11')
    // (25 bought + 25 sold) per trip × 2 trips.
    expect(points[0].volume).toBe(100)
  })
})

// ── computeDailyWinRate (independent per-date Map — does NOT inherit) ──────

describe('computeDailyWinRate — multiple round trips, same symbol same day', () => {
  it('counts both same-day round trips — one win, one loss → 0.5', () => {
    const points = computeDailyWinRate(WIN_LOSS_SAME_DAY, null)
    expect(points).toHaveLength(1)
    expect(points[0].date).toBe('2026-05-11')
    expect(points[0].winRate).toBe(0.5)
    expect(points[0].tradeCount).toBe(2)
  })
})

// ── computeCumulativePnL (delegates to computeDailyPnL) ───────────────────

describe('computeCumulativePnL — multiple round trips, same symbol same day', () => {
  it('running total reflects every round trip, not one-per-day', () => {
    const points = computeCumulativePnL(MULTI_DAY, null)
    expect(points.map((p) => p.date)).toEqual(['2026-05-11', '2026-05-12'])
    expect(points[0].cumulative).toBeCloseTo(24.47, 2)
    expect(points[1].cumulative).toBeCloseTo(33.57, 2)
  })
})
