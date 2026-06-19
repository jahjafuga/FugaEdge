import { describe, it, expect } from 'vitest'
import { computeDnaAdherence, type DnaConfig } from '../adherence'
import { aggregate } from '@/core/insights/helpers'
import type { TradeListRow } from '@shared/trades-types'

// The Ross-Cameron-style profile the honesty contract is measured against:
// price $2–20, day change ≥10%, RVOL ≥5×, float 1M–20M. require_catalyst does
// NOT affect compute (catalyst is always reported as coverage, never pass/fail).
const CONFIG: DnaConfig = {
  dna_price_min: 2,
  dna_price_max: 20,
  dna_change_min: 10,
  dna_rvol_min: 5,
  dna_float_min: 1_000_000,
  dna_float_max: 20_000_000,
  dna_require_catalyst: true,
}

// A fully-complete, all-pass baseline row (price 5, change 15, rvol 8, float 5M,
// catalyst tagged) → classifies fitAll on its own. Overrides flip one dimension
// at a time so each test isolates a single pillar / bucket transition.
let nextId = 1
function mk(over: Partial<TradeListRow>): TradeListRow {
  return {
    id: nextId++,
    date: '2026-06-01',
    symbol: 'AAA',
    side: 'long',
    open_time: '2026-06-01T13:30:00Z',
    close_time: '2026-06-01T14:00:00Z',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 5,
    shares_sold: 100,
    avg_sell_price: 5,
    gross_pnl: 0,
    total_fees: 0,
    net_pnl: 0,
    executions: [],
    note: null,
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
    mae: null,
    mfe: null,
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
    daily_change_pct: 15,
    rvol: 8,
    float_shares: 5_000_000,
    shares_outstanding: null,
    catalyst_type: 'News',
    days_since_catalyst: null,
    country: null,
    country_name: 'Unknown',
    region: 'Unknown',
    country_source: 'unknown',
    attachment_count: 0,
    secondary_tag_count: 0,
    deleted_at: null,
    ...over,
  }
}

describe('computeDnaAdherence — per-pillar pass/exclude', () => {
  it('price pillar: counts a pass and a fail; n = total (price is never null)', () => {
    const trades = [
      mk({ side: 'long', avg_buy_price: 5 }), // pass (2..20)
      mk({ side: 'long', avg_buy_price: 25 }), // fail (>20)
    ]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.perPillar.price).toEqual({ passed: 1, n: 2, pct: 0.5 })
  })

  it('price pillar uses the SELL price for shorts (buy price ignored)', () => {
    const trades = [mk({ side: 'short', avg_sell_price: 10, avg_buy_price: 999 })]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.perPillar.price).toEqual({ passed: 1, n: 1, pct: 1 })
  })

  it('change pillar EXCLUDES a null (not a fail): n counts only trades with data', () => {
    const trades = [
      mk({ daily_change_pct: 15 }), // pass
      mk({ daily_change_pct: 5 }), // fail (>=10)
      mk({ daily_change_pct: null }), // EXCLUDED from n
    ]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.perPillar.change).toEqual({ passed: 1, n: 2, pct: 0.5 })
  })

  it('change pillar is signed — a down-at-entry trade FAILS (not excluded)', () => {
    const trades = [mk({ daily_change_pct: -3 })]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.perPillar.change).toEqual({ passed: 0, n: 1, pct: 0 })
  })

  it('rvol pillar excludes null', () => {
    const trades = [
      mk({ rvol: 8 }), // pass
      mk({ rvol: 2 }), // fail (>=5)
      mk({ rvol: null }), // excluded
    ]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.perPillar.rvol).toEqual({ passed: 1, n: 2, pct: 0.5 })
  })

  it('float pillar excludes null', () => {
    const trades = [
      mk({ float_shares: 5_000_000 }), // pass
      mk({ float_shares: 50_000_000 }), // fail (>20M)
      mk({ float_shares: null }), // excluded
    ]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.perPillar.float).toEqual({ passed: 1, n: 2, pct: 0.5 })
  })

  it('a numeric pillar with no data anywhere → n 0, pct null (never NaN, never 0)', () => {
    const trades = [mk({ rvol: null }), mk({ rvol: null })]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.perPillar.rvol).toEqual({ passed: 0, n: 0, pct: null })
  })
})

describe('computeDnaAdherence — inclusive edges (both ends pass)', () => {
  it('price==min, price==max, change==min, rvol==min, float==min, float==max all pass', () => {
    expect(
      computeDnaAdherence([mk({ side: 'long', avg_buy_price: 2 })], CONFIG).perPillar.price,
    ).toEqual({ passed: 1, n: 1, pct: 1 })
    expect(
      computeDnaAdherence([mk({ side: 'long', avg_buy_price: 20 })], CONFIG).perPillar.price,
    ).toEqual({ passed: 1, n: 1, pct: 1 })
    expect(
      computeDnaAdherence([mk({ daily_change_pct: 10 })], CONFIG).perPillar.change,
    ).toEqual({ passed: 1, n: 1, pct: 1 })
    expect(computeDnaAdherence([mk({ rvol: 5 })], CONFIG).perPillar.rvol).toEqual({
      passed: 1,
      n: 1,
      pct: 1,
    })
    expect(
      computeDnaAdherence([mk({ float_shares: 1_000_000 })], CONFIG).perPillar.float,
    ).toEqual({ passed: 1, n: 1, pct: 1 })
    expect(
      computeDnaAdherence([mk({ float_shares: 20_000_000 })], CONFIG).perPillar.float,
    ).toEqual({ passed: 1, n: 1, pct: 1 })
  })
})

describe('computeDnaAdherence — catalyst coverage (signal, not pass/fail)', () => {
  it('tagged = non-null AND non-empty; null + "" excluded; denominator = ALL trades', () => {
    const trades = [
      mk({ catalyst_type: 'News' }),
      mk({ catalyst_type: 'Earnings' }),
      mk({ catalyst_type: null }),
      mk({ catalyst_type: '' }),
    ]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.catalystCoverage).toEqual({ tagged: 2, total: 4, pct: 0.5 })
  })

  it('catalyst is EXCLUDED from the buckets: a null/empty catalyst stays fitAll', () => {
    const trades = [
      mk({ catalyst_type: 'News' }),
      mk({ catalyst_type: null }),
      mk({ catalyst_type: '' }),
    ]
    const r = computeDnaAdherence(trades, CONFIG)
    // all three are complete + pass all 4 numeric pillars regardless of catalyst
    expect(r.buckets).toEqual({ fitAll: 3, brokeAny: 0, incomplete: 0, total: 3 })
  })
})

describe('computeDnaAdherence — 3-bucket classification', () => {
  it('complete-all-pass → fitAll; complete-fail-one → brokeAny; missing-a-numeric → incomplete', () => {
    const trades = [
      mk({}), // complete, all pass → fitAll
      mk({ rvol: 2 }), // complete, rvol fails → brokeAny
      mk({ rvol: null }), // missing rvol → incomplete (NOT brokeAny, NOT fitAll)
    ]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.buckets).toEqual({ fitAll: 1, brokeAny: 1, incomplete: 1, total: 3 })
  })

  it('every trade lands in exactly one bucket — the counts sum to trades.length', () => {
    const trades = [
      mk({}), // fitAll
      mk({ rvol: 2 }), // brokeAny (rvol)
      mk({ daily_change_pct: null }), // incomplete
      mk({ float_shares: null }), // incomplete
      mk({ side: 'long', avg_buy_price: 100 }), // brokeAny (price)
      mk({ daily_change_pct: null, rvol: null }), // incomplete (two missing → still ONE incomplete)
    ]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.buckets).toEqual({ fitAll: 1, brokeAny: 2, incomplete: 3, total: 6 })
    expect(r.buckets.fitAll + r.buckets.brokeAny + r.buckets.incomplete).toBe(trades.length)
  })

  it('incomplete may be the LARGEST bucket on a thin-data book (honest, not folded in)', () => {
    const trades = [
      mk({ rvol: null }),
      mk({ float_shares: null }),
      mk({ daily_change_pct: null }),
      mk({}),
    ]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.buckets).toEqual({ fitAll: 1, brokeAny: 0, incomplete: 3, total: 4 })
  })
})

describe('computeDnaAdherence — P&L cross-cut (fitAll vs brokeAny)', () => {
  it('aggregates net / win% / count over each set; incomplete trades excluded from both', () => {
    const trades = [
      // fitAll set: +100 (win), -50 (loss)
      mk({ net_pnl: 100 }),
      mk({ net_pnl: -50 }),
      // brokeAny set (rvol fails): +30 (win), 0 (scratch — excluded from win_rate)
      mk({ rvol: 2, net_pnl: 30 }),
      mk({ rvol: 2, net_pnl: 0 }),
      // incomplete (missing rvol) — must NOT pollute either pnl aggregate
      mk({ rvol: null, net_pnl: 9999 }),
    ]
    const r = computeDnaAdherence(trades, CONFIG)
    expect(r.pnl.fitAll.trade_count).toBe(2)
    expect(r.pnl.fitAll.net_pnl).toBe(50)
    expect(r.pnl.fitAll.win_rate).toBe(0.5) // 1 win / (1 win + 1 loss)
    expect(r.pnl.brokeAny.trade_count).toBe(2)
    expect(r.pnl.brokeAny.net_pnl).toBe(30)
    expect(r.pnl.brokeAny.win_rate).toBe(1) // 1 win / 1 decided; scratch excluded
  })
})

describe('computeDnaAdherence — divide-by-zero / empty', () => {
  it('empty trades: all pct null, all buckets 0, pnl = aggregate([]) (no throw)', () => {
    const r = computeDnaAdherence([], CONFIG)
    expect(r.perPillar.price).toEqual({ passed: 0, n: 0, pct: null })
    expect(r.perPillar.change).toEqual({ passed: 0, n: 0, pct: null })
    expect(r.perPillar.rvol).toEqual({ passed: 0, n: 0, pct: null })
    expect(r.perPillar.float).toEqual({ passed: 0, n: 0, pct: null })
    expect(r.catalystCoverage).toEqual({ tagged: 0, total: 0, pct: null })
    expect(r.buckets).toEqual({ fitAll: 0, brokeAny: 0, incomplete: 0, total: 0 })
    expect(r.pnl.fitAll).toEqual(aggregate([]))
    expect(r.pnl.brokeAny).toEqual(aggregate([]))
  })
})
