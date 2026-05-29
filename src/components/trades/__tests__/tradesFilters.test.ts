import { describe, it, expect } from 'vitest'
import { applyTradesFilters, emptyFilters } from '../TradesFilters'
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
    float_shares: null, catalyst_type: null, days_since_catalyst: null,
    country: 'US', country_name: 'United States', region: 'USA', country_source: 'polygon',
    attachment_count: 0,
    mae: null, mfe: null,
    ...over,
  }
}

function tradeWithTier(id: number, tier: PlaybookTier | null): TradeListRow {
  return trade({ id, playbook_tier: tier })
}

describe('applyTradesFilters — A+ Setups pill', () => {
  it('returns only trades whose playbook tier is A+', () => {
    const list = [
      tradeWithTier(1, 'A+'),
      tradeWithTier(2, 'A'),
      tradeWithTier(3, 'B'),
      tradeWithTier(4, 'C'),
      tradeWithTier(5, 'A+'),
    ]
    const out = applyTradesFilters(list, { ...emptyFilters(), aPlus: true })
    expect(out.map((t) => t.id)).toEqual([1, 5])
  })

  it('excludes trades that have no playbook tier when A+ filter is on', () => {
    const list = [tradeWithTier(1, null), tradeWithTier(2, 'A+')]
    const out = applyTradesFilters(list, { ...emptyFilters(), aPlus: true })
    expect(out.map((t) => t.id)).toEqual([2])
  })

  it('no longer keys off confidence — high confidence with non-A+ tier is excluded', () => {
    // Repro of the v0.1.3 stop-gap behaviour: confidence>=4 used to mean
    // A+. v0.1.5 reads the playbook tier instead, so a high-confidence
    // trade tagged with a B-tier playbook should now be filtered out.
    const list = [
      trade({ id: 1, confidence: 5, playbook_tier: 'B' }),
      trade({ id: 2, confidence: 1, playbook_tier: 'A+' }),
    ]
    const out = applyTradesFilters(list, { ...emptyFilters(), aPlus: true })
    expect(out.map((t) => t.id)).toEqual([2])
  })

  it('does not affect filter results when aPlus is off', () => {
    const list = [
      tradeWithTier(1, 'A+'),
      tradeWithTier(2, 'B'),
      tradeWithTier(3, null),
    ]
    const out = applyTradesFilters(list, emptyFilters())
    expect(out.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('composes correctly with other filters (long-only + A+)', () => {
    const list = [
      trade({ id: 1, side: 'long', playbook_tier: 'A+' }),
      trade({ id: 2, side: 'short', playbook_tier: 'A+' }),
      trade({ id: 3, side: 'long', playbook_tier: 'B' }),
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      aPlus: true,
      side: 'long',
    })
    expect(out.map((t) => t.id)).toEqual([1])
  })
})
