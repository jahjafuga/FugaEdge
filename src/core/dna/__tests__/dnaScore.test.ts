// v0.2.7 — D2/D3/D4: THE PER-TRADE SCORER.
//
// computeDnaAdherence classifies every trade internally — the bucket loop
// decides incomplete / fit / broke per row — and then exposes only the counts.
// The filter needs the per-trade verdict itself. These guards specify the
// extracted scorer BEFORE it exists: hand-computed scores, the honesty
// contract (missing input = INCOMPLETE, a kind, never a zero), and the
// denominator following dna_require_catalyst.

import { describe, expect, it } from 'vitest'
import { scoreTradeDna, withDnaScores, type DnaConfig } from '../adherence'
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
const OFF: DnaConfig = { ...CONFIG, dna_require_catalyst: false }

const def = (id: number, name: string, kind: CatalystDef['kind']): CatalystDef => ({
  id, name, sort_position: id, is_custom: false, is_archived: false, kind,
})
const DEFS = [def(1, 'News / PR', 'news'), def(2, 'Technical / No Catalyst', 'none')]

const t = (over: Partial<TradeListRow>): TradeListRow => makeTrade(over as never)

// ─── D2 ──────────────────────────────────────────────────────────────────────

describe('D2 a complete trade scores N of D, hand-computed', () => {
  it('all five pass -> 5/5', () => {
    const s = scoreTradeDna(
      t({ side: 'long', avg_buy_price: 5, daily_change_pct: 12, rvol: 6, float_shares: 10_000_000, catalyst_type: 'News / PR' }),
      CONFIG, DEFS,
    )
    expect(s).toEqual({ kind: 'scored', passed: 5, of: 5 })
  })

  it('all five fail -> 0/5', () => {
    const s = scoreTradeDna(
      t({ side: 'long', avg_buy_price: 50, daily_change_pct: 2, rvol: 1, float_shares: 50_000_000, catalyst_type: 'Technical / No Catalyst' }),
      CONFIG, DEFS,
    )
    expect(s).toEqual({ kind: 'scored', passed: 0, of: 5 })
  })

  it('a middle case -> 3/5 (price, change, float pass; rvol, catalyst fail)', () => {
    const s = scoreTradeDna(
      t({ side: 'long', avg_buy_price: 10, daily_change_pct: 15, rvol: 2, float_shares: 10_000_000, catalyst_type: 'Technical / No Catalyst' }),
      CONFIG, DEFS,
    )
    expect(s).toEqual({ kind: 'scored', passed: 3, of: 5 })
  })

  it('a SHORT is judged on its entry side — the sell price', () => {
    // avg_buy 50 would fail; the short entered at 10, which passes.
    const s = scoreTradeDna(
      t({ side: 'short', avg_buy_price: 50, avg_sell_price: 10, daily_change_pct: 15, rvol: 6, float_shares: 10_000_000, catalyst_type: 'News / PR' }),
      CONFIG, DEFS,
    )
    expect(s).toEqual({ kind: 'scored', passed: 5, of: 5 })
  })
})

// ─── D3 ──────────────────────────────────────────────────────────────────────

describe('D3 missing input means INCOMPLETE — a kind, never a numeric zero', () => {
  it('change and rvol missing -> incomplete, naming exactly what is missing', () => {
    const s = scoreTradeDna(
      t({ side: 'long', avg_buy_price: 10, daily_change_pct: null, rvol: null, float_shares: 10_000_000, catalyst_type: 'News / PR' }),
      CONFIG, DEFS,
    )
    expect(s.kind, 'a trade with missing inputs was scored').toBe('incomplete')
    if (s.kind === 'incomplete') expect(s.missing.sort()).toEqual(['change', 'rvol'])
  })

  it('an untagged catalyst under require-on is incomplete, not failed', () => {
    const s = scoreTradeDna(
      t({ side: 'long', avg_buy_price: 10, daily_change_pct: 15, rvol: 6, float_shares: 10_000_000, catalyst_type: null }),
      CONFIG, DEFS,
    )
    expect(s).toEqual({ kind: 'incomplete', missing: ['catalyst'] })
  })

  it('a tag the vocabulary cannot explain is unjudgeable -> incomplete', () => {
    const s = scoreTradeDna(
      t({ side: 'long', avg_buy_price: 10, daily_change_pct: 15, rvol: 6, float_shares: 10_000_000, catalyst_type: 'Renamed Away' }),
      CONFIG, DEFS,
    )
    expect(s).toEqual({ kind: 'incomplete', missing: ['catalyst'] })
  })

  it('and the incomplete verdict never carries a passed count', () => {
    const s = scoreTradeDna(
      t({ side: 'long', avg_buy_price: 10, daily_change_pct: null, rvol: 6, float_shares: 10_000_000, catalyst_type: 'News / PR' }),
      CONFIG, DEFS,
    )
    expect('passed' in s, 'incomplete leaked a score').toBe(false)
  })
})

// ─── D4 ──────────────────────────────────────────────────────────────────────

describe('D4 the denominator follows dna_require_catalyst', () => {
  const COMPLETE = t({
    side: 'long', avg_buy_price: 10, daily_change_pct: 15, rvol: 6,
    float_shares: 10_000_000, catalyst_type: 'Technical / No Catalyst',
  })

  it('the same trade is N-of-5 with it on and N-of-4 with it off', () => {
    // none-kind catalyst FAILS the pillar when enforced; drops out when not.
    expect(scoreTradeDna(COMPLETE, CONFIG, DEFS)).toEqual({ kind: 'scored', passed: 4, of: 5 })
    expect(scoreTradeDna(COMPLETE, OFF, DEFS)).toEqual({ kind: 'scored', passed: 4, of: 4 })
  })

  it('an untagged trade is incomplete at 5 and scored at 4', () => {
    const untagged = t({ side: 'long', avg_buy_price: 10, daily_change_pct: 15, rvol: 6, float_shares: 10_000_000, catalyst_type: null })
    expect(scoreTradeDna(untagged, CONFIG, DEFS)).toEqual({ kind: 'incomplete', missing: ['catalyst'] })
    expect(scoreTradeDna(untagged, OFF, DEFS)).toEqual({ kind: 'scored', passed: 4, of: 4 })
  })

  it('required but the vocabulary is unavailable -> the pillar stands down to 4', () => {
    // The aggregate's stand-down rule, mirrored: an empty vocabulary must not
    // sweep the whole book into incomplete.
    const tagged = t({ side: 'long', avg_buy_price: 10, daily_change_pct: 15, rvol: 6, float_shares: 10_000_000, catalyst_type: 'News / PR' })
    expect(scoreTradeDna(tagged, CONFIG, [])).toEqual({ kind: 'scored', passed: 4, of: 4 })
  })
})

// ─── withDnaScores ───────────────────────────────────────────────────────────

describe('withDnaScores augments rows without mutating them', () => {
  it('every row gains a dna verdict; the originals are untouched', () => {
    const rows = [
      t({ id: 1, side: 'long', avg_buy_price: 5, daily_change_pct: 12, rvol: 6, float_shares: 10_000_000, catalyst_type: 'News / PR' }),
      t({ id: 2, side: 'long', avg_buy_price: 10, daily_change_pct: null, rvol: null, float_shares: 10_000_000, catalyst_type: null }),
    ]
    const out = withDnaScores(rows, CONFIG, DEFS)
    expect(out[0].dna).toEqual({ kind: 'scored', passed: 5, of: 5 })
    expect(out[1].dna?.kind).toBe('incomplete')
    expect(rows[0].dna, 'the input rows were mutated').toBeUndefined()
    expect(out[0].id).toBe(1)
  })
})
