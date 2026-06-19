import { describe, expect, it } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import type { RoundTripExecution } from '@shared/import-types'
import { computeExitDeltas } from '../exit-quality'

// One execution fill. Only side/qty/price drive the best-exit math; the rest
// are benign defaults so tests read as fills, not boilerplate.
function exec(side: 'B' | 'S', qty: number, price: number): RoundTripExecution {
  return { trade_id: 't', order_id: 'o', side, qty, price, time: '2026-05-15T09:30:00Z' }
}

function tradeRow(overrides: Partial<TradeListRow>): TradeListRow {
  return {
    id: 0,
    date: '2026-05-15',
    symbol: 'TEST',
    side: 'long',
    open_time: '2026-05-15T09:30:00',
    close_time: '2026-05-15T09:45:00',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 10,
    shares_sold: 100,
    avg_sell_price: 10,
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

describe('computeExitDeltas', () => {
  it('computes the best-exit gap for a scaled-out long from its own exit fills', () => {
    // Entry 100 @ 10.00; scaled exits 50 @ 10.40 + 50 @ 10.80.
    // actual avg exit 10.60, gross 60, net 60 (no fees).
    // Best exit fill = 10.80 → all 100sh at 10.80 = gross 80, bestNet 80.
    const trades = [
      tradeRow({
        id: 1,
        side: 'long',
        net_pnl: 60,
        total_fees: 0,
        executions: [exec('B', 100, 10.0), exec('S', 50, 10.4), exec('S', 50, 10.8)],
      }),
    ]

    const result = computeExitDeltas(trades)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      trade_id: 1,
      side: 'long',
      exit_count: 2,
      best_exit_price: 10.8,
    })
    expect(result[0].actual_avg_exit).toBeCloseTo(10.6, 5)
    expect(result[0].actual_net_pnl).toBeCloseTo(60, 5)
    expect(result[0].best_exit_net_pnl).toBeCloseTo(80, 5)
    expect(result[0].delta).toBeCloseTo(20, 5)
    // % left = |best − avg| / best = |10.8 − 10.6| / 10.8 ≈ 0.0185, a 0..1
    // fraction (NOT pre-multiplied by 100).
    expect(result[0].pct_left_on_table).toBeCloseTo(0.2 / 10.8, 5)
    expect(result[0].pct_left_on_table).toBeGreaterThan(0)
    expect(result[0].pct_left_on_table).toBeLessThanOrEqual(1)
  })

  it('uses the lowest cover price as best exit for a scaled-out short', () => {
    // Short 100 @ 10.00; covers 50 @ 9.60 + 50 @ 9.20.
    // actual avg cover 9.40, gross 60, net 60. Best cover = 9.20 → bestNet 80.
    const trades = [
      tradeRow({
        id: 2,
        side: 'short',
        net_pnl: 60,
        total_fees: 0,
        executions: [exec('S', 100, 10.0), exec('B', 50, 9.6), exec('B', 50, 9.2)],
      }),
    ]

    const result = computeExitDeltas(trades)

    expect(result).toHaveLength(1)
    expect(result[0].best_exit_price).toBeCloseTo(9.2, 5)
    expect(result[0].actual_avg_exit).toBeCloseTo(9.4, 5)
    expect(result[0].best_exit_net_pnl).toBeCloseTo(80, 5)
    expect(result[0].delta).toBeCloseTo(20, 5)
    // % left is POSITIVE for a short even though best (9.2) < avg (9.4): Math.abs
    // mirrors the sign-normalized delta. |9.2 − 9.4| / 9.2 ≈ 0.0217. Dave's
    // literal (best − avg)/best would be −0.0217 — this assertion pins the fix.
    expect(result[0].pct_left_on_table).toBeCloseTo(0.2 / 9.2, 5)
    expect(result[0].pct_left_on_table).toBeGreaterThan(0)
  })

  it('subtracts fees from the hypothetical best-exit net', () => {
    // Same scaled long, but $10 fees. net 50, bestNet = 80 − 10 = 70.
    const trades = [
      tradeRow({
        id: 3,
        side: 'long',
        net_pnl: 50,
        total_fees: 10,
        executions: [exec('B', 100, 10.0), exec('S', 50, 10.4), exec('S', 50, 10.8)],
      }),
    ]

    const result = computeExitDeltas(trades)

    expect(result[0].best_exit_net_pnl).toBeCloseTo(70, 5)
    expect(result[0].delta).toBeCloseTo(20, 5)
  })

  it('skips single-exit trades (no scaling to analyze)', () => {
    const trades = [
      tradeRow({
        id: 4,
        side: 'long',
        net_pnl: 50,
        executions: [exec('B', 100, 10.0), exec('S', 100, 10.5)],
      }),
    ]

    expect(computeExitDeltas(trades)).toEqual([])
  })

  it('skips multi-exit trades whose fills were all the same price (delta = 0)', () => {
    const trades = [
      tradeRow({
        id: 5,
        side: 'long',
        net_pnl: 50,
        executions: [exec('B', 100, 10.0), exec('S', 50, 10.5), exec('S', 50, 10.5)],
      }),
    ]

    expect(computeExitDeltas(trades)).toEqual([])
  })

  it('returns eligible trades sorted by delta descending', () => {
    const small = tradeRow({
      id: 1,
      side: 'long',
      net_pnl: 60,
      executions: [exec('B', 100, 10.0), exec('S', 50, 10.4), exec('S', 50, 10.8)], // delta 20
    })
    const big = tradeRow({
      id: 2,
      side: 'long',
      net_pnl: 150,
      executions: [exec('B', 100, 10.0), exec('S', 50, 11.0), exec('S', 50, 12.0)], // best 12 → bestNet 200, delta 50
    })

    const result = computeExitDeltas([small, big])

    expect(result.map((d) => d.trade_id)).toEqual([2, 1])
    expect(result[0].delta).toBeCloseTo(50, 5)
    expect(result[1].delta).toBeCloseTo(20, 5)
  })
})
