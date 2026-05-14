import { describe, it, expect } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { runRegionStrength, runRegionWeakness } from '../rules'

function mkTrade(over: Partial<TradeListRow>): TradeListRow {
  return {
    id: 1, date: '2026-01-15', symbol: 'XYZ', side: 'long',
    open_time: '2026-01-15T09:30:00', close_time: '2026-01-15T09:35:00',
    is_open: false,
    shares_bought: 100, avg_buy_price: 10, shares_sold: 100, avg_sell_price: 11,
    gross_pnl: 100, total_fees: 0, net_pnl: 100,
    executions: [], note: null, entry_timeframe: null, entry_ema9_distance_pct: null,
    playbook_id: null, playbook_name: null, playbook_tier: null, confidence: null, mistakes: [],
    planned_risk: null, planned_stop_loss_price: null,
    risk_per_share: null, total_risk: null, r_multiple: null,
    float_shares: null, catalyst_type: null, days_since_catalyst: null,
    country: 'US', country_name: 'United States', region: 'USA', country_source: 'polygon',
    attachment_count: 0,
    ...over,
  }
}

const baseInput = (trades: TradeListRow[]) => ({
  trades, sentimentByDate: new Map<string, number>(), disciplineStreak: 0,
})

describe('runRegionWeakness', () => {
  it('returns null when no region has ≥10 trades', () => {
    const trades = Array.from({ length: 5 }, () => mkTrade({ region: 'China', net_pnl: -50 }))
    expect(runRegionWeakness(baseInput(trades))).toBeNull()
  })

  it('fires when a region win-rate gap ≥15pts below overall', () => {
    // Overall: 30 trades, 60% win rate. China: 10 trades, 30% win rate (30pt gap).
    const usa = Array.from({ length: 20 }, (_, i) => mkTrade({
      region: 'USA', net_pnl: i < 14 ? 100 : -50,  // 70% win
    }))
    const cn = Array.from({ length: 10 }, (_, i) => mkTrade({
      region: 'China', net_pnl: i < 3 ? 100 : -50, // 30% win
    }))
    const result = runRegionWeakness(baseInput([...usa, ...cn]))
    expect(result).not.toBeNull()
    expect(result!.title).toContain('China')
    expect(result!.tone).toBe('negative')
  })

  it('returns one card — the worst region — when multiple qualify', () => {
    const usa = Array.from({ length: 30 }, (_, i) => mkTrade({
      region: 'USA', net_pnl: i < 24 ? 100 : -50,  // 80% win
    }))
    const cn = Array.from({ length: 10 }, (_, i) => mkTrade({
      region: 'China', net_pnl: i < 4 ? 100 : -50, // 40% win
    }))
    const eu = Array.from({ length: 10 }, (_, i) => mkTrade({
      region: 'Europe', net_pnl: i < 2 ? 100 : -50, // 20% win — worst
    }))
    const result = runRegionWeakness(baseInput([...usa, ...cn, ...eu]))
    expect(result).not.toBeNull()
    expect(result!.title).toContain('Europe')
  })

  it('ignores Unknown region', () => {
    const usa = Array.from({ length: 20 }, () => mkTrade({ region: 'USA', net_pnl: 100 }))
    const unk = Array.from({ length: 15 }, () => mkTrade({ region: 'Unknown', net_pnl: -100 }))
    expect(runRegionWeakness(baseInput([...usa, ...unk]))).toBeNull()
  })
})

describe('runRegionStrength', () => {
  it('fires when a region win-rate is ≥15pts ABOVE overall', () => {
    const usa = Array.from({ length: 20 }, (_, i) => mkTrade({
      region: 'USA', net_pnl: i < 8 ? 100 : -50,   // 40% win
    }))
    const cn = Array.from({ length: 10 }, (_, i) => mkTrade({
      region: 'China', net_pnl: i < 9 ? 100 : -50, // 90% win
    }))
    const result = runRegionStrength(baseInput([...usa, ...cn]))
    expect(result).not.toBeNull()
    expect(result!.title).toContain('China')
    expect(result!.tone).toBe('positive')
  })

  it('returns null when no region beats overall by ≥15 points', () => {
    const trades = Array.from({ length: 30 }, () => mkTrade({ region: 'USA', net_pnl: 100 }))
    expect(runRegionStrength(baseInput(trades))).toBeNull()
  })

  it('returns one card — the best region — when multiple qualify', () => {
    const usa = Array.from({ length: 30 }, (_, i) => mkTrade({
      region: 'USA', net_pnl: i < 9 ? 100 : -50,    // 30% win
    }))
    const cn = Array.from({ length: 10 }, (_, i) => mkTrade({
      region: 'China', net_pnl: i < 7 ? 100 : -50,  // 70% win
    }))
    const eu = Array.from({ length: 10 }, (_, i) => mkTrade({
      region: 'Europe', net_pnl: i < 9 ? 100 : -50, // 90% win — best
    }))
    const result = runRegionStrength(baseInput([...usa, ...cn, ...eu]))
    expect(result).not.toBeNull()
    expect(result!.title).toContain('Europe')
  })
})
