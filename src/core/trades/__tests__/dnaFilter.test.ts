// @vitest-environment jsdom
// v0.2.7 — D5/D6/D7: THE FIVE PILLARS BECOME A FILTER.
//
// The state stores THE ASK — a minimum score and a completeness bucket — and
// never the thresholds. Thresholds live in settings; the score is derived onto
// the rows before the filter runs, so the same stored ask means something
// different the day the user tightens their scan profile. That is the point:
// the ask is "trades that fit my profile", not "trades that fit the profile I
// had in August".
//
// THE HONESTY CONSTRAINT, ruled: minScore matches over COMPLETE trades only.
// An incomplete trade never matches a score ask — and never fails one. It is
// its own bucket, reachable BY NAME, because on the real book it is most of
// the answer (change/rvol at thirty percent coverage, catalyst at zero).

import { beforeEach, describe, expect, it } from 'vitest'
import { applyTradesFilters, emptyFilters, isFiltering } from '../tradesFilter'
import { withDnaScores, type DnaConfig } from '@/core/dna/adherence'
import {
  readTradesFilters,
  writeTradesFilters,
  filterPrefsKey,
  TRADES_FILTER_PREFS_VERSION,
} from '@/lib/prefs/tradesFilters'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'
import type { CatalystDef } from '@shared/catalyst-types'

const ALL = 'all' as const
beforeEach(() => localStorage.clear())

const CONFIG: DnaConfig = {
  dna_price_min: 2, dna_price_max: 20, dna_change_min: 10, dna_rvol_min: 5,
  dna_float_min: 0, dna_float_max: 20_000_000, dna_require_catalyst: true,
}
const def = (id: number, name: string, kind: CatalystDef['kind']): CatalystDef => ({
  id, name, sort_position: id, is_custom: false, is_archived: false, kind,
})
const DEFS = [def(1, 'News / PR', 'news'), def(2, 'Technical / No Catalyst', 'none')]

const t = (over: Partial<TradeListRow>): TradeListRow => makeTrade(over as never)

/** id 1 = 5/5 China loser · id 2 = 0/5 · id 3 = 3/5 China winner ·
 *  id 4 = incomplete China · id 5 = incomplete USA. */
const RAW: TradeListRow[] = [
  t({ id: 1, region: 'China', country: 'CN', net_pnl: -80, side: 'long', avg_buy_price: 5, daily_change_pct: 12, rvol: 6, float_shares: 10_000_000, catalyst_type: 'News / PR' }),
  t({ id: 2, region: 'USA', country: 'US', net_pnl: 60, side: 'long', avg_buy_price: 50, daily_change_pct: 2, rvol: 1, float_shares: 50_000_000, catalyst_type: 'Technical / No Catalyst' }),
  t({ id: 3, region: 'China', country: 'CN', net_pnl: 45, side: 'long', avg_buy_price: 10, daily_change_pct: 15, rvol: 2, float_shares: 10_000_000, catalyst_type: 'Technical / No Catalyst' }),
  t({ id: 4, region: 'China', country: 'CN', net_pnl: -20, side: 'long', avg_buy_price: 10, daily_change_pct: null, rvol: null, float_shares: 10_000_000, catalyst_type: 'News / PR' }),
  t({ id: 5, region: 'USA', country: 'US', net_pnl: 10, side: 'long', avg_buy_price: 10, daily_change_pct: 15, rvol: 6, float_shares: 10_000_000, catalyst_type: null }),
]
const BOOK = withDnaScores(RAW, CONFIG, DEFS)

// ─── D5 ──────────────────────────────────────────────────────────────────────

describe('D5 the filter narrows', () => {
  it('minScore matches complete trades at or above the bar — never incomplete ones', () => {
    const out = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      dna: { minScore: 3, maxScore: null, bucket: 'any' },
    })
    expect(out.map((x) => x.id), 'minScore leaked an incomplete trade').toEqual([1, 3])
  })

  it('the incomplete bucket returns exactly the incomplete set', () => {
    const out = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      dna: { minScore: null, maxScore: null, bucket: 'incomplete' },
    })
    expect(out.map((x) => x.id)).toEqual([4, 5])
  })

  it('the complete bucket is its mirror', () => {
    const out = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      dna: { minScore: null, maxScore: null, bucket: 'complete' },
    })
    expect(out.map((x) => x.id)).toEqual([1, 2, 3])
  })

  it('composes with region and outcome per the AND-across idiom', () => {
    const out = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      regions: ['China'],
      outcome: 'losers',
      dna: { minScore: 3, maxScore: null, bucket: 'any' },
    })
    expect(out.map((x) => x.id)).toEqual([1])
  })

  it('the empty ask filters nothing and is not "filtering"', () => {
    expect(applyTradesFilters(BOOK, emptyFilters()).length).toBe(5)
    expect(isFiltering(emptyFilters())).toBe(false)
    expect(isFiltering({ ...emptyFilters(), dna: { minScore: 3, maxScore: null, bucket: 'any' } })).toBe(true)
    expect(isFiltering({ ...emptyFilters(), dna: { minScore: null, maxScore: null, bucket: 'incomplete' } })).toBe(true)
  })

  it('an unaugmented row under an active ask counts as incomplete — the honest default', () => {
    const out = applyTradesFilters(RAW, {
      ...emptyFilters(),
      dna: { minScore: null, maxScore: null, bucket: 'incomplete' },
    })
    expect(out.length, 'rows nobody scored were treated as scored').toBe(5)
  })
})

// ─── D6 ──────────────────────────────────────────────────────────────────────

describe('D6 the prefs blob carries the ask, additively at version one', () => {
  it('round-trips', () => {
    writeTradesFilters(ALL, { ...emptyFilters(), dna: { minScore: 4, maxScore: null, bucket: 'complete' } })
    expect(readTradesFilters(ALL).dna).toEqual({ minScore: 4, maxScore: null, bucket: 'complete' })
  })

  it('an old blob without the field upgrades to the empty ask, keeping what it had', () => {
    localStorage.setItem(
      filterPrefsKey(ALL),
      JSON.stringify({
        v: TRADES_FILTER_PREFS_VERSION,
        state: { symbol: 'ASTC', regions: ['China'] },
      }),
    )
    const back = readTradesFilters(ALL)
    expect(back.dna).toEqual({ minScore: null, maxScore: null, bucket: 'any' })
    expect(back.symbol).toBe('ASTC')
    expect(back.regions).toEqual(['China'])
  })

  it('garbage is coerced, never trusted', () => {
    localStorage.setItem(
      filterPrefsKey(ALL),
      JSON.stringify({
        v: TRADES_FILTER_PREFS_VERSION,
        state: { dna: { minScore: 'four', bucket: 'sideways', extra: true } },
      }),
    )
    expect(readTradesFilters(ALL).dna).toEqual({ minScore: null, maxScore: null, bucket: 'any' })
  })

  it('a fractional or out-of-band minScore is dropped', () => {
    for (const bad of [2.5, -1, 99]) {
      localStorage.setItem(
        filterPrefsKey(ALL),
        JSON.stringify({ v: TRADES_FILTER_PREFS_VERSION, state: { dna: { minScore: bad, bucket: 'any' } } }),
      )
      expect(readTradesFilters(ALL).dna.minScore, `minScore ${bad} survived`).toBeNull()
    }
  })
})

// ─── D7 ──────────────────────────────────────────────────────────────────────

describe('D7 thresholds are NOT stored — the ask re-resolves against settings', () => {
  it('the blob carries no dna_* threshold key and no threshold number', () => {
    writeTradesFilters(ALL, { ...emptyFilters(), dna: { minScore: 3, maxScore: null, bucket: 'complete' } })
    const blob = localStorage.getItem(filterPrefsKey(ALL))!
    expect(blob).not.toMatch(/dna_(price|change|rvol|float|require)/)
    const stored = JSON.parse(blob).state.dna
    // THE KEY SET, NOT A SUBSET, and it grew by exactly one: maxScore. This
    // stays an equality rather than a contains-check because the case exists
    // to catch a THRESHOLD leaking into the blob, and a contains-check would
    // not notice one arriving.
    expect(Object.keys(stored).sort()).toEqual(['bucket', 'maxScore', 'minScore'])
  })

  it('the same stored ask matches a different set under a tightened profile', () => {
    writeTradesFilters(ALL, { ...emptyFilters(), dna: { minScore: 5, maxScore: null, bucket: 'any' } })
    const ask = readTradesFilters(ALL)

    const relaxed = applyTradesFilters(withDnaScores(RAW, CONFIG, DEFS), ask)
    // Tighten rvol so id 1's rvol=6 fails: 5/5 -> 4/5, under the 5-of-5 bar.
    const tightened = applyTradesFilters(
      withDnaScores(RAW, { ...CONFIG, dna_rvol_min: 7 }, DEFS),
      ask,
    )
    expect(relaxed.map((x) => x.id)).toEqual([1])
    expect(tightened.map((x) => x.id), 'the stored ask froze the thresholds').toEqual([])
  })
})
