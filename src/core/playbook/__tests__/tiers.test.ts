import { describe, it, expect } from 'vitest'
import { aggregateTierPerformance } from '../tiers'
import type { TradeListRow } from '@shared/trades-types'
import type { PlaybookTier } from '@shared/playbook-types'

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
    mae: null, mfe: null, daily_change_pct: null, rvol: null,
    ...over,
  }
}

function winner(over: Partial<TradeListRow> = {}): TradeListRow {
  return trade({ net_pnl: 100, gross_pnl: 100, total_fees: 0, ...over })
}
function loser(over: Partial<TradeListRow> = {}): TradeListRow {
  return trade({ net_pnl: -50, gross_pnl: -50, total_fees: 0, ...over })
}
function scratch(over: Partial<TradeListRow> = {}): TradeListRow {
  return trade({ net_pnl: 0, gross_pnl: 0, total_fees: 0, ...over })
}

describe('aggregateTierPerformance', () => {
  it('returns empty array when no trades carry a tier', () => {
    const out = aggregateTierPerformance([
      trade({ playbook_tier: null }),
      trade({ playbook_tier: null }),
    ])
    expect(out).toEqual([])
  })

  it('skips trades without a playbook tier', () => {
    const out = aggregateTierPerformance([
      winner({ playbook_tier: 'A+' }),
      trade({ playbook_tier: null, net_pnl: 9999 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].tier).toBe('A+')
    expect(out[0].trades).toBe(1)
    expect(out[0].net_pnl).toBe(100)
  })

  it('orders rows A+ → A → B → C regardless of input order', () => {
    const tiers: PlaybookTier[] = ['B', 'C', 'A+', 'A']
    const out = aggregateTierPerformance(
      tiers.map((t) => winner({ playbook_tier: t })),
    )
    expect(out.map((r) => r.tier)).toEqual(['A+', 'A', 'B', 'C'])
  })

  it('omits tiers with zero trades', () => {
    const out = aggregateTierPerformance([
      winner({ playbook_tier: 'A+' }),
      loser({ playbook_tier: 'C' }),
    ])
    expect(out.map((r) => r.tier)).toEqual(['A+', 'C'])
  })

  it('computes win_rate from decided trades only (excludes scratches)', () => {
    // 2 winners, 1 loser, 1 scratch → win_rate = 2/3
    const out = aggregateTierPerformance([
      winner({ playbook_tier: 'A' }),
      winner({ playbook_tier: 'A' }),
      loser({ playbook_tier: 'A' }),
      scratch({ playbook_tier: 'A' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].trades).toBe(4)
    expect(out[0].winners).toBe(2)
    expect(out[0].losers).toBe(1)
    expect(out[0].scratches).toBe(1)
    expect(out[0].win_rate).toBeCloseTo(2 / 3, 5)
  })

  it('expectancy = WR·avgWinner − (1−WR)·|avgLoser|', () => {
    // 1 winner +200, 1 loser -100 → WR = 0.5, avgW = 200, avgL = -100
    // expectancy = 0.5*200 - 0.5*100 = 50
    const out = aggregateTierPerformance([
      winner({ playbook_tier: 'A+', net_pnl: 200, gross_pnl: 200 }),
      loser({ playbook_tier: 'A+', net_pnl: -100, gross_pnl: -100 }),
    ])
    expect(out[0].expectancy).toBeCloseTo(50, 5)
  })

  it('expectancy is null when there are no losers', () => {
    const out = aggregateTierPerformance([
      winner({ playbook_tier: 'A' }),
      winner({ playbook_tier: 'A' }),
    ])
    expect(out[0].expectancy).toBeNull()
    expect(out[0].profit_factor).toBeNull()
  })

  it('profit_factor = sum(winners)/|sum(losers)|', () => {
    // 200 + 100 winners; 50 + 50 losers → PF = 300/100 = 3.0
    const out = aggregateTierPerformance([
      winner({ playbook_tier: 'B', net_pnl: 200, gross_pnl: 200 }),
      winner({ playbook_tier: 'B', net_pnl: 100, gross_pnl: 100 }),
      loser({ playbook_tier: 'B', net_pnl: -50, gross_pnl: -50 }),
      loser({ playbook_tier: 'B', net_pnl: -50, gross_pnl: -50 }),
    ])
    expect(out[0].profit_factor).toBeCloseTo(3, 5)
  })

  it('aggregates gross_pnl + total_fees per tier', () => {
    const out = aggregateTierPerformance([
      winner({ playbook_tier: 'A+', gross_pnl: 100, total_fees: 5, net_pnl: 95 }),
      winner({ playbook_tier: 'A+', gross_pnl: 200, total_fees: 10, net_pnl: 190 }),
    ])
    expect(out[0].gross_pnl).toBe(300)
    expect(out[0].total_fees).toBe(15)
    expect(out[0].net_pnl).toBe(285)
  })

  it('returns null win_rate when there are zero decided trades (all scratches)', () => {
    const out = aggregateTierPerformance([
      scratch({ playbook_tier: 'B' }),
      scratch({ playbook_tier: 'B' }),
    ])
    expect(out[0].win_rate).toBeNull()
    expect(out[0].expectancy).toBeNull()
    expect(out[0].profit_factor).toBeNull()
  })
})
