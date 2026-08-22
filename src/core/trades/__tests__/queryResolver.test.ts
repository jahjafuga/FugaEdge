// v0.2.7 — THE QUERY RESOLVER. Text in, TradesFilterState out. Pure.
//
// THE LAWS, ruled before a line of the cure existed:
//   G1  BOOK-DERIVED ONLY. A token applies only against vocabulary the book or
//       def tables actually hold. "a+" is a playbook LOOKUP, not a tier flag:
//       with no playbook by that name it lands in unresolved.
//   G2  UNRESOLVED IS A NAMED RESULT. resolve() returns {state, applied,
//       unresolved, ambiguous}; gibberish leaves the state untouched. The
//       unresolved text is the seam a model fills later.
//   G3  AMBIGUITY IS RETURNED, NEVER GUESSED. A prefix hitting two symbols
//       names both. The UI offers; the core never picks.
//   G4  SIGN SEMANTICS. "losers over 100" means net BELOW minus one hundred.
//       Magnitude-of-loss, not signed value — get it wrong and the filter
//       lies politely.
//
// Every expectation below is a hand-written exact object.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { emptyFilters } from '../tradesFilter'
import { resolveDatePreset } from '../datePreset'

const NOW = new Date('2026-08-22T15:00:00')

const VOCAB: ResolverVocabulary = {
  symbols: ['SPRC', 'ASTC', 'ASND', 'BABA'],
  regions: ['China', 'Hong Kong', 'USA', 'Israel'],
  countries: [
    { iso: 'CN', name: 'China' },
    { iso: 'HK', name: 'Hong Kong' },
    { iso: 'US', name: 'United States' },
  ],
  sectors: ['Healthcare', 'Industrials'],
  industries: ['Biotechnology', 'Marine Shipping'],
  playbooks: [{ id: 7, name: 'A+', tier: null }],
  catalystTypes: ['News / PR'],
  mistakes: [{ axis: 'technical', name: 'Chased extended' }],
}

const r = (text: string, vocab: ResolverVocabulary = VOCAB) =>
  resolveQuery(text, vocab, NOW)

// ─── the battery ─────────────────────────────────────────────────────────────

describe('the battery, each result hand-written', () => {
  it('"chinese companies i have lost" -> regions China + losers; Hong Kong NOT included', () => {
    const out = r('chinese companies i have lost')
    expect(out.state).toEqual({ ...emptyFilters(), regions: ['China'], outcome: 'losers' })
    // The literal rule, pinned: HK is its own region and a demonym for China
    // must not sweep it in.
    expect(out.state.regions).not.toContain('Hong Kong')
    expect(out.unresolved).toEqual([])
    expect(out.ambiguous).toEqual([])
  })

  it('"show me the last 10 trades with chinese companies that i have lost" -> the seam is NAMED', () => {
    const out = r('show me the last 10 trades with chinese companies that i have lost')
    expect(out.state).toEqual({ ...emptyFilters(), regions: ['China'], outcome: 'losers' })
    // No limit field exists. "last 10" is returned by name — the model seam —
    // never silently dropped.
    expect(out.unresolved).toEqual(['last 10'])
  })

  it('"float under 10m" -> ranges.float max ten million', () => {
    const out = r('float under 10m')
    expect(out.state).toEqual({
      ...emptyFilters(),
      ranges: { float: { min: null, max: 10_000_000 } },
    })
    expect(out.unresolved).toEqual([])
  })

  it('G4: "losers over $100" -> outcome losers AND net BELOW minus one hundred', () => {
    const out = r('losers over $100')
    expect(out.state).toEqual({
      ...emptyFilters(),
      outcome: 'losers',
      ranges: { net_pnl: { min: null, max: -100 } },
    })
  })

  it('G4 mirror: "winners over $100" -> net ABOVE plus one hundred', () => {
    const out = r('winners over $100')
    expect(out.state).toEqual({
      ...emptyFilters(),
      outcome: 'winners',
      ranges: { net_pnl: { min: 100, max: null } },
    })
  })

  it('"rvol over 5" -> ranges.rvol min 5', () => {
    const out = r('rvol over 5')
    expect(out.state).toEqual({
      ...emptyFilters(),
      ranges: { rvol: { min: 5, max: null } },
    })
  })

  it('"healthcare losers today" -> sector + outcome + preset compose', () => {
    const out = r('healthcare losers today')
    expect(out.state).toEqual({
      ...emptyFilters(),
      sectors: ['Healthcare'],
      outcome: 'losers',
      datePreset: 'today',
      ...resolveDatePreset('today', NOW),
    })
  })

  it('"sprc" -> the symbol, exact', () => {
    const out = r('sprc')
    expect(out.state).toEqual({ ...emptyFilters(), symbol: 'SPRC' })
    expect(out.ambiguous).toEqual([])
  })

  it('G3: a two-char prefix colliding -> ambiguous, both named, NO pick', () => {
    const out = r('as')
    expect(out.state).toEqual(emptyFilters())
    expect(out.ambiguous).toEqual([{ text: 'as', candidates: ['ASTC', 'ASND'] }])
    expect(out.unresolved).toEqual([])
  })

  it('"incomplete" -> the dna bucket', () => {
    const out = r('incomplete')
    expect(out.state).toEqual({
      ...emptyFilters(),
      dna: { minScore: null, bucket: 'incomplete' },
    })
  })

  it('full gibberish -> state untouched, all of it unresolved', () => {
    const out = r('qwzzk blorp vantabulate')
    expect(out.state).toEqual(emptyFilters())
    expect(out.unresolved).toEqual(['qwzzk blorp vantabulate'])
    expect(out.applied).toEqual([])
  })
})

// ─── G1 — book-derived only ──────────────────────────────────────────────────

describe('G1 nothing is invented', () => {
  it('"a+" resolves ONLY because a playbook by that name exists', () => {
    const out = r('a+')
    expect(out.state).toEqual({ ...emptyFilters(), playbookIds: [7] })
  })

  it('the same text with no such playbook lands in unresolved, aPlus untouched', () => {
    const out = r('a+', { ...VOCAB, playbooks: [] })
    expect(out.state).toEqual(emptyFilters())
    expect(out.state.aPlus, 'the tier flag was flipped without a vocabulary hit').toBe(false)
    expect(out.unresolved).toEqual(['a+'])
  })

  it('a region the book does not hold is unresolved even though it is a real place', () => {
    const out = r('brazilian companies', { ...VOCAB, regions: ['USA'] })
    expect(out.state).toEqual(emptyFilters())
    expect(out.unresolved).toEqual(['brazilian'])
  })
})

// ─── G5 — composition ────────────────────────────────────────────────────────

describe('G5 arrays add, scalars replace and say so', () => {
  it('a second region ADDS', () => {
    const base = { ...emptyFilters(), regions: ['USA'] as (string | null)[] }
    const out = resolveQuery('chinese', VOCAB, NOW, base)
    expect(out.state.regions).toEqual(['USA', 'China'])
  })

  it('a second symbol REPLACES and the applied line says so', () => {
    const base = { ...emptyFilters(), symbol: 'BABA' }
    const out = resolveQuery('sprc', VOCAB, NOW, base)
    expect(out.state.symbol).toBe('SPRC')
    expect(out.applied.some((a) => a.includes('replaced'))).toBe(true)
  })

  it('a preset goes through the beat-35 exclusivity — explicit dates are cleared into the derived pair', () => {
    const base = { ...emptyFilters(), dateFrom: '2026-01-01', dateTo: '2026-01-31' }
    const out = resolveQuery('today', VOCAB, NOW, base)
    expect(out.state.datePreset).toBe('today')
    expect(out.state.dateFrom).toBe('2026-08-22')
    expect(out.state.dateTo).toBe('2026-08-22')
  })
})

// ─── G6 — units ──────────────────────────────────────────────────────────────

describe('G6 units', () => {
  it('k / m / b multiply; the dollar sign is optional', () => {
    expect(r('cap under 50m').state.ranges.market_cap).toEqual({ min: null, max: 50_000_000 })
    expect(r('float over 1.5b').state.ranges.float).toEqual({ min: 1_500_000_000, max: null })
    expect(r('fees under $5').state.ranges.fees).toEqual({ min: null, max: 5 })
  })

  it('bare Nx belongs to rvol — the only column whose label owns the suffix', () => {
    expect(r('over 5x').state.ranges.rvol).toEqual({ min: 5, max: null })
  })
})

// ─── purity ──────────────────────────────────────────────────────────────────

describe('the resolver never mutates its inputs', () => {
  it('base state and vocabulary come back untouched', () => {
    const base = { ...emptyFilters(), regions: ['USA'] as (string | null)[] }
    const frozen = JSON.stringify(base)
    const vocabFrozen = JSON.stringify(VOCAB)
    resolveQuery('chinese losers float under 10m', VOCAB, NOW, base)
    expect(JSON.stringify(base)).toBe(frozen)
    expect(JSON.stringify(VOCAB)).toBe(vocabFrozen)
  })
})
