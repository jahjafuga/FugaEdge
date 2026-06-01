import { describe, it, expect } from 'vitest'
import { computeTodayStats } from '../today'
import type { TradeListRow } from '@shared/trades-types'

function trade(over: Partial<TradeListRow>): TradeListRow {
  return {
    id: 1, date: '2026-05-14', symbol: 'XYZ', side: 'long',
    open_time: '2026-05-14T09:30:00', close_time: '2026-05-14T09:35:00',
    is_open: false,
    shares_bought: 100, avg_buy_price: 10, shares_sold: 100, avg_sell_price: 11,
    gross_pnl: 100, total_fees: 0, net_pnl: 100,
    executions: [], note: null, entry_timeframe: null, entry_ema9_distance_pct: null,
    playbook_id: null, playbook_name: null, playbook_tier: null,
    confidence: null, mistakes: [],
    planned_risk: null, planned_stop_loss_price: null,
    risk_per_share: null, total_risk: null, r_multiple: null,
    float_shares: null, shares_outstanding: null, catalyst_type: null, days_since_catalyst: null,
    country: 'US', country_name: 'United States', region: 'USA', country_source: 'polygon',
    attachment_count: 0,
    deleted_at: null,
    mae: null, mfe: null,
    ...over,
  }
}

describe('computeTodayStats — v0.1.5 gross + fees', () => {
  it('returns 0 for gross/fees when there are no trades', () => {
    const s = computeTodayStats([])
    expect(s.netPnL).toBe(0)
    expect(s.grossPnL).toBe(0)
    expect(s.totalFees).toBe(0)
    expect(s.trades).toBe(0)
  })

  it('sums gross_pnl and total_fees across the day', () => {
    const s = computeTodayStats([
      trade({ gross_pnl: 100, total_fees: 5, net_pnl: 95 }),
      trade({ gross_pnl: -50, total_fees: 3, net_pnl: -53 }),
      trade({ gross_pnl: 30, total_fees: 2, net_pnl: 28 }),
    ])
    expect(s.grossPnL).toBe(80)
    expect(s.totalFees).toBe(10)
    expect(s.netPnL).toBe(70)
  })

  it('keeps gross and fees independent of net (no double counting)', () => {
    // A trade with non-zero fees: net should equal gross - fees in the
    // input; the aggregator must keep all three separate.
    const s = computeTodayStats([
      trade({ gross_pnl: 200, total_fees: 7, net_pnl: 193 }),
    ])
    expect(s.grossPnL).toBe(200)
    expect(s.totalFees).toBe(7)
    expect(s.netPnL).toBe(193)
  })

  it('handles zero-fee trades without breaking the tally', () => {
    const s = computeTodayStats([
      trade({ gross_pnl: 50, total_fees: 0, net_pnl: 50 }),
    ])
    expect(s.totalFees).toBe(0)
    expect(s.grossPnL).toBe(50)
  })
})
