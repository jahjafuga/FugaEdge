// v0.2.7 — D1: THE GOLDEN PIN. Written and GREEN before any refactor touched
// computeDnaAdherence; it survives the per-trade-scorer extraction untouched.
//
// Every number below is HAND-COMPUTED from the six-trade fixture and pinned
// exactly — perPillar, coverage, buckets, both pnl aggregates, the stand-down
// flag — under require-catalyst ON, OFF, and the defs-unavailable stand-down.
// If the extraction moves any of them, the card's numbers moved, and this file
// is the proof.

import { describe, expect, it } from 'vitest'
import { computeDnaAdherence, type DnaConfig } from '../adherence'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'
import type { CatalystDef } from '@shared/catalyst-types'

const CONFIG: DnaConfig = {
  dna_price_min: 2,
  dna_price_max: 20,
  dna_change_min: 10,
  dna_rvol_min: 5,
  dna_float_min: 0,
  dna_float_max: 20_000_000,
  dna_require_catalyst: true,
}
const CONFIG_OFF: DnaConfig = { ...CONFIG, dna_require_catalyst: false }

const def = (id: number, name: string, kind: CatalystDef['kind']): CatalystDef => ({
  id,
  name,
  sort_position: id,
  is_custom: false,
  is_archived: false,
  kind,
})
const DEFS: CatalystDef[] = [def(1, 'News / PR', 'news'), def(2, 'Technical / No Catalyst', 'none')]

const t = (over: Partial<TradeListRow>): TradeListRow => makeTrade(over as never)

/** Six trades, every pillar value explicit. Hand-scored in the margin. */
const BOOK: TradeListRow[] = [
  // T1 — 5/5: price 5 in 2..20, change 12>=10, rvol 6>=5, float 10M in 0..20M, news catalyst
  t({ id: 1, side: 'long', avg_buy_price: 5, daily_change_pct: 12, rvol: 6, float_shares: 10_000_000, catalyst_type: 'News / PR', net_pnl: 100 }),
  // T2 — 0/5: price 50 out, change 2 fail, rvol 1 fail, float 50M out, no-catalyst kind fails
  t({ id: 2, side: 'long', avg_buy_price: 50, daily_change_pct: 2, rvol: 1, float_shares: 50_000_000, catalyst_type: 'Technical / No Catalyst', net_pnl: -50 }),
  // T3 — 3/5: price 10 pass, change 15 pass, rvol 2 fail, float 10M pass, none-kind fails
  t({ id: 3, side: 'long', avg_buy_price: 10, daily_change_pct: 15, rvol: 2, float_shares: 10_000_000, catalyst_type: 'Technical / No Catalyst', net_pnl: 25 }),
  // T4 — INCOMPLETE: change and rvol null
  t({ id: 4, side: 'long', avg_buy_price: 10, daily_change_pct: null, rvol: null, float_shares: 10_000_000, catalyst_type: 'News / PR', net_pnl: -10 }),
  // T5 — INCOMPLETE under require-on (catalyst untagged); 4/4 with it off
  t({ id: 5, side: 'long', avg_buy_price: 10, daily_change_pct: 15, rvol: 6, float_shares: 10_000_000, catalyst_type: null, net_pnl: 40 }),
  // T6 — INCOMPLETE under require-on (tag the vocabulary cannot explain); 4/4 off
  t({ id: 6, side: 'long', avg_buy_price: 10, daily_change_pct: 15, rvol: 6, float_shares: 10_000_000, catalyst_type: 'Renamed Out Of The Vocabulary', net_pnl: -5 }),
]

describe('D1 the golden pin — require-catalyst ON', () => {
  const a = computeDnaAdherence(BOOK, CONFIG, DEFS)

  it('perPillar, exactly', () => {
    expect(a.perPillar.price).toEqual({ passed: 5, n: 6, pct: 5 / 6 })
    expect(a.perPillar.change).toEqual({ passed: 4, n: 5, pct: 0.8 })
    expect(a.perPillar.rvol).toEqual({ passed: 3, n: 5, pct: 0.6 })
    expect(a.perPillar.float).toEqual({ passed: 5, n: 6, pct: 5 / 6 })
    expect(a.perPillar.catalyst).toEqual({ passed: 2, n: 4, pct: 0.5 })
  })

  it('coverage, buckets, stand-down flag, exactly', () => {
    expect(a.catalystCoverage).toEqual({ tagged: 5, total: 6, pct: 5 / 6 })
    expect(a.buckets).toEqual({ fitAll: 1, brokeAny: 2, incomplete: 3, total: 6 })
    expect(a.catalystDefsUnavailable).toBe(false)
  })

  it('both pnl aggregates, exactly', () => {
    expect(a.pnl.fitAll).toEqual({
      trade_count: 1, net_pnl: 100, winners: 1, losers: 0,
      win_rate: 1, avg_winner: 100, avg_loser: null,
    })
    expect(a.pnl.brokeAny).toEqual({
      trade_count: 2, net_pnl: -25, winners: 1, losers: 1,
      win_rate: 0.5, avg_winner: 25, avg_loser: -50,
    })
  })
})

describe('D1 the golden pin — require-catalyst OFF', () => {
  const a = computeDnaAdherence(BOOK, CONFIG_OFF, DEFS)

  it('buckets reclassify T5 and T6 as complete four-pillar fits', () => {
    expect(a.buckets).toEqual({ fitAll: 3, brokeAny: 2, incomplete: 1, total: 6 })
  })

  it('the catalyst pillar is still MEASURED, unchanged', () => {
    expect(a.perPillar.catalyst).toEqual({ passed: 2, n: 4, pct: 0.5 })
    expect(a.catalystCoverage).toEqual({ tagged: 5, total: 6, pct: 5 / 6 })
  })

  it('pnl over the wider fitAll set, exactly', () => {
    expect(a.pnl.fitAll).toEqual({
      trade_count: 3, net_pnl: 135, winners: 2, losers: 1,
      win_rate: 2 / 3, avg_winner: 70, avg_loser: -5,
    })
  })
})

describe('D1 the golden pin — required but the vocabulary is unavailable', () => {
  const a = computeDnaAdherence(BOOK, CONFIG, [])

  it('the pillar stands down: four-pillar buckets, flag raised', () => {
    expect(a.catalystDefsUnavailable).toBe(true)
    expect(a.buckets).toEqual({ fitAll: 3, brokeAny: 2, incomplete: 1, total: 6 })
    // with no vocabulary nothing resolves — the catalyst stat is honestly empty
    expect(a.perPillar.catalyst).toEqual({ passed: 0, n: 0, pct: null })
  })
})
