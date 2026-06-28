import { describe, it, expect } from 'vitest'
import { applyTradesFilters, emptyFilters, isFiltering } from '../tradesFilter'
import type { TradeListRow } from '@shared/trades-types'
import type { PlaybookTier } from '@shared/playbook-types'
import type { MistakeAxis } from '@shared/mistakes-types'

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
    secondary_tag_count: 0,
    deleted_at: null,
    mae: null, mfe: null, daily_change_pct: null, rvol: null,
    ...over,
  }
}

function tradeWithTier(id: number, tier: PlaybookTier | null): TradeListRow {
  return trade({ id, playbook_tier: tier })
}

function tradeWithPlaybook(id: number, playbook_id: number | null): TradeListRow {
  return trade({ id, playbook_id })
}

function tradeWithMistakes(
  id: number,
  tags: { axis: MistakeAxis; name: string }[],
): TradeListRow {
  // The predicate reads mistakeTags (axis-aware); the flat `mistakes` mirror is
  // populated to match the real list read (mistakes = mistakeTags.map(name)).
  return trade({ id, mistakeTags: tags, mistakes: tags.map((t) => t.name) })
}

function tradeWithCatalyst(id: number, catalyst_type: string | null): TradeListRow {
  return trade({ id, catalyst_type })
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

describe('applyTradesFilters — Playbook filter (playbookIds)', () => {
  it('empty playbookIds does not filter (all trades pass)', () => {
    const list = [
      tradeWithPlaybook(1, 10),
      tradeWithPlaybook(2, null),
      tradeWithPlaybook(3, 20),
    ]
    const out = applyTradesFilters(list, { ...emptyFilters(), playbookIds: [] })
    expect(out.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('a single id keeps only trades with that primary playbook_id', () => {
    const list = [
      tradeWithPlaybook(1, 10),
      tradeWithPlaybook(2, 20),
      tradeWithPlaybook(3, 10),
    ]
    const out = applyTradesFilters(list, { ...emptyFilters(), playbookIds: [10] })
    expect(out.map((t) => t.id)).toEqual([1, 3])
  })

  it('multiple ids match as OR (any of the selected playbooks)', () => {
    const list = [
      tradeWithPlaybook(1, 10),
      tradeWithPlaybook(2, 20),
      tradeWithPlaybook(3, 30),
      tradeWithPlaybook(4, 10),
    ]
    const out = applyTradesFilters(list, { ...emptyFilters(), playbookIds: [10, 30] })
    expect(out.map((t) => t.id)).toEqual([1, 3, 4])
  })

  it('null in the array matches truly-untagged trades (playbook_id === null)', () => {
    const list = [
      tradeWithPlaybook(1, 10),
      tradeWithPlaybook(2, null),
      tradeWithPlaybook(3, null),
    ]
    const out = applyTradesFilters(list, { ...emptyFilters(), playbookIds: [null] })
    expect(out.map((t) => t.id)).toEqual([2, 3])
  })

  it('null + a real id matches untagged OR that playbook', () => {
    const list = [
      tradeWithPlaybook(1, 10),
      tradeWithPlaybook(2, null),
      tradeWithPlaybook(3, 20),
    ]
    const out = applyTradesFilters(list, { ...emptyFilters(), playbookIds: [null, 20] })
    expect(out.map((t) => t.id)).toEqual([2, 3])
  })

  it('the "No Setup" system playbook is a normal id (matches when its id is selected)', () => {
    // No Setup is a seeded SYSTEM playbook with a real numeric id (e.g. 1).
    // It is NOT the same bucket as an untagged trade (playbook_id === null).
    const NO_SETUP_ID = 1
    const list = [
      tradeWithPlaybook(1, NO_SETUP_ID),
      tradeWithPlaybook(2, null),
      tradeWithPlaybook(3, 20),
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      playbookIds: [NO_SETUP_ID],
    })
    expect(out.map((t) => t.id)).toEqual([1])
  })

  it('null (untagged) and the No Setup id are distinct buckets', () => {
    const NO_SETUP_ID = 1
    const list = [
      tradeWithPlaybook(1, NO_SETUP_ID),
      tradeWithPlaybook(2, null),
    ]
    // Selecting only null matches the untagged trade, NOT the No-Setup-tagged one.
    const out = applyTradesFilters(list, { ...emptyFilters(), playbookIds: [null] })
    expect(out.map((t) => t.id)).toEqual([2])
  })

  it('composes with another dimension as AND (side + playbook)', () => {
    const list = [
      trade({ id: 1, side: 'long', playbook_id: 10 }),
      trade({ id: 2, side: 'short', playbook_id: 10 }),
      trade({ id: 3, side: 'long', playbook_id: 20 }),
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      side: 'long',
      playbookIds: [10],
    })
    expect(out.map((t) => t.id)).toEqual([1])
  })
})

describe('isFiltering — playbook dimension', () => {
  it('is false for empty filters', () => {
    expect(isFiltering(emptyFilters())).toBe(false)
  })

  it('is true when any playbook is selected', () => {
    expect(isFiltering({ ...emptyFilters(), playbookIds: [10] })).toBe(true)
  })

  it('is true when only the untagged (null) bucket is selected', () => {
    expect(isFiltering({ ...emptyFilters(), playbookIds: [null] })).toBe(true)
  })
})

describe('applyTradesFilters — Mistakes filter (mistakeKeys)', () => {
  it('empty mistakeKeys does not filter (all trades pass)', () => {
    const list = [
      tradeWithMistakes(1, [{ axis: 'technical', name: 'Chased extension' }]),
      tradeWithMistakes(2, []),
      tradeWithMistakes(3, [{ axis: 'psychological', name: 'FOMO' }]),
    ]
    const out = applyTradesFilters(list, { ...emptyFilters(), mistakeKeys: [] })
    expect(out.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('a single key keeps only trades whose mistakeTags include that exact axis+name', () => {
    const list = [
      tradeWithMistakes(1, [{ axis: 'technical', name: 'Chased extension' }]),
      tradeWithMistakes(2, [{ axis: 'psychological', name: 'FOMO' }]),
      tradeWithMistakes(3, [
        { axis: 'technical', name: 'Chased extension' },
        { axis: 'psychological', name: 'Revenge trade' },
      ]),
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      mistakeKeys: [{ axis: 'technical', name: 'Chased extension' }],
    })
    expect(out.map((t) => t.id)).toEqual([1, 3])
  })

  it('multiple keys match as OR (any of the selected mistakes)', () => {
    const list = [
      tradeWithMistakes(1, [{ axis: 'technical', name: 'Chased extension' }]),
      tradeWithMistakes(2, [{ axis: 'psychological', name: 'FOMO' }]),
      tradeWithMistakes(3, [{ axis: 'technical', name: 'Entered too early' }]),
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      mistakeKeys: [
        { axis: 'technical', name: 'Chased extension' },
        { axis: 'psychological', name: 'FOMO' },
      ],
    })
    expect(out.map((t) => t.id)).toEqual([1, 2])
  })

  it('a trade with no mistakeTags is excluded when a key is selected (?? [] guard)', () => {
    const list = [
      tradeWithMistakes(1, [{ axis: 'technical', name: 'Chased extension' }]),
      trade({ id: 2 }), // no mistakeTags at all — exercises the ?? [] guard
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      mistakeKeys: [{ axis: 'technical', name: 'Chased extension' }],
    })
    expect(out.map((t) => t.id)).toEqual([1])
  })

  it('AXIS DISTINCTION — same name on a different axis does NOT match (axis-qualified, not name-alone)', () => {
    const list = [
      tradeWithMistakes(1, [{ axis: 'technical', name: 'FOMO' }]),
      tradeWithMistakes(2, [{ axis: 'psychological', name: 'FOMO' }]),
    ]
    // Selecting the PSYCHOLOGICAL 'FOMO' matches only the psychological-tagged trade.
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      mistakeKeys: [{ axis: 'psychological', name: 'FOMO' }],
    })
    expect(out.map((t) => t.id)).toEqual([2])
  })

  it('composes with another dimension as AND (side + mistake)', () => {
    const list = [
      trade({
        id: 1,
        side: 'long',
        mistakeTags: [{ axis: 'technical', name: 'Chased extension' }],
        mistakes: ['Chased extension'],
      }),
      trade({
        id: 2,
        side: 'short',
        mistakeTags: [{ axis: 'technical', name: 'Chased extension' }],
        mistakes: ['Chased extension'],
      }),
      trade({
        id: 3,
        side: 'long',
        mistakeTags: [{ axis: 'psychological', name: 'FOMO' }],
        mistakes: ['FOMO'],
      }),
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      side: 'long',
      mistakeKeys: [{ axis: 'technical', name: 'Chased extension' }],
    })
    expect(out.map((t) => t.id)).toEqual([1])
  })
})

describe('isFiltering — mistakes dimension', () => {
  it('is false for empty filters', () => {
    expect(isFiltering(emptyFilters())).toBe(false)
  })

  it('is true when any mistake is selected', () => {
    expect(
      isFiltering({
        ...emptyFilters(),
        mistakeKeys: [{ axis: 'technical', name: 'FOMO' }],
      }),
    ).toBe(true)
  })
})

describe('applyTradesFilters — Catalyst filter (catalystTypes)', () => {
  it('empty catalystTypes does not filter (all trades pass)', () => {
    const list = [
      tradeWithCatalyst(1, 'News / PR'),
      tradeWithCatalyst(2, null),
      tradeWithCatalyst(3, 'Earnings'),
    ]
    const out = applyTradesFilters(list, { ...emptyFilters(), catalystTypes: [] })
    expect(out.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('a single name keeps only trades with that exact catalyst_type', () => {
    const list = [
      tradeWithCatalyst(1, 'News / PR'),
      tradeWithCatalyst(2, 'Earnings'),
      tradeWithCatalyst(3, 'News / PR'),
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      catalystTypes: ['News / PR'],
    })
    expect(out.map((t) => t.id)).toEqual([1, 3])
  })

  it('multiple names match as OR (any of the selected catalysts)', () => {
    const list = [
      tradeWithCatalyst(1, 'News / PR'),
      tradeWithCatalyst(2, 'Earnings'),
      tradeWithCatalyst(3, 'Halt Resume'),
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      catalystTypes: ['News / PR', 'Halt Resume'],
    })
    expect(out.map((t) => t.id)).toEqual([1, 3])
  })

  it('null matches untagged trades (catalyst_type === null)', () => {
    const list = [
      tradeWithCatalyst(1, 'News / PR'),
      tradeWithCatalyst(2, null),
      tradeWithCatalyst(3, null),
    ]
    const out = applyTradesFilters(list, { ...emptyFilters(), catalystTypes: [null] })
    expect(out.map((t) => t.id)).toEqual([2, 3])
  })

  it('null + a name matches untagged OR that catalyst', () => {
    const list = [
      tradeWithCatalyst(1, 'News / PR'),
      tradeWithCatalyst(2, null),
      tradeWithCatalyst(3, 'Earnings'),
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      catalystTypes: [null, 'Earnings'],
    })
    expect(out.map((t) => t.id)).toEqual([2, 3])
  })

  it('a trade with a different catalyst is excluded when a specific name is selected', () => {
    const list = [
      tradeWithCatalyst(1, 'News / PR'),
      tradeWithCatalyst(2, 'Earnings'),
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      catalystTypes: ['News / PR'],
    })
    expect(out.map((t) => t.id)).toEqual([1])
  })

  it('composes with another dimension as AND (side + catalyst)', () => {
    const list = [
      trade({ id: 1, side: 'long', catalyst_type: 'News / PR' }),
      trade({ id: 2, side: 'short', catalyst_type: 'News / PR' }),
      trade({ id: 3, side: 'long', catalyst_type: 'Earnings' }),
    ]
    const out = applyTradesFilters(list, {
      ...emptyFilters(),
      side: 'long',
      catalystTypes: ['News / PR'],
    })
    expect(out.map((t) => t.id)).toEqual([1])
  })
})

describe('isFiltering — catalyst dimension', () => {
  it('is false for empty filters', () => {
    expect(isFiltering(emptyFilters())).toBe(false)
  })

  it('is true when any catalyst is selected', () => {
    expect(isFiltering({ ...emptyFilters(), catalystTypes: ['News / PR'] })).toBe(true)
  })

  it('is true when only the untagged (null) bucket is selected', () => {
    expect(isFiltering({ ...emptyFilters(), catalystTypes: [null] })).toBe(true)
  })
})
