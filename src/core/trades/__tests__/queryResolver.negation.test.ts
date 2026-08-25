// v0.2.7 — NEGATION STOPS INVERTING.
//
// THE DEFECT, measured on four phrasings out of four: the negator was dropped
// as unresolved and the thing being negated was APPLIED. "not china" applied
// region China. "without mistakes" applied MISTAKES ONLY. "excluding losers"
// applied outcome LOSERS. Not a gap in understanding -- the opposite answer,
// delivered confidently, with no sign to the user that anything was misread.
//
// THE RULING these guards enforce:
//   A negated term is NOT APPLIED. Refusal, not exclusion. Real exclusion
//     needs the ask to grow a shape it does not have, and that is a later
//     beat; this one only has to stop lying.
//   The negator AND what it governs land in UNRESOLVED, named. Swallowing
//     them silently would be the same defect in a quieter place -- that is the
//     module's own G2, and the whole point of a named unresolved result.
//   The SUBSTRING floor rises from three characters to FOUR. One constant.
//     It kills "are" reaching sector Healthcare and "but" offering two
//     industries, and it keeps "pullback" reaching a multi-word playbook.
//     Prefix stays at two; exact is untouched and has no floor.
//
// THE SCOPE RULE, chosen by MEASUREMENT rather than taste: across the seven
// phrasings on record the negator is separated from the term it governs by
// ZERO stopwords (not china / no china / without mistakes / excluding losers)
// or exactly ONE (not FROM hong kong, in three phrasings). So a negator
// governs the next token span that is not a stopword, skipping any number of
// stopwords on the way.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { emptyFilters } from '../tradesFilter'

const NOW = new Date('2026-08-22T15:00:00')

/** The 528 book's shape -- the only book that can express the campaign
 *  sentence, since it is the only one with more than one region. */
const BOOK: ResolverVocabulary = {
  symbols: ['NRVA', 'ATRA', 'ATPC'],
  regions: ['USA', 'China', 'Hong Kong', 'Israel', 'Japan'],
  countries: [
    { iso: 'CN', name: 'China' },
    { iso: 'HK', name: 'Hong Kong' },
    { iso: 'US', name: 'United States' },
  ],
  sectors: ['Healthcare', 'Technology'],
  industries: ['Medical - Distribution', 'Technology Distributors'],
  playbooks: [
    { id: 4, name: 'Micro Pullback', tier: 'A+' },
    { id: 5, name: 'First Pullback to VWAP', tier: 'B' },
    { id: 9, name: 'No Setup', tier: null },
  ],
  catalystTypes: ['Earnings', 'News / PR'],
  mistakes: [
    { axis: 'technical', name: 'Float or RVOL criteria not met' },
    { axis: 'technical', name: 'Chased extended' },
  ],
}

const r = (text: string, vocab: ResolverVocabulary = BOOK) => resolveQuery(text, vocab, NOW)

const CAMPAIGN =
  "show me the 10 stocks that I've lost money that are Chinese but not from Hong Kong"

// --- G1 ---------------------------------------------------------------------

// v0.2.7 — INVERTED IN PLACE, not deleted. This block shipped asserting that
// all four phrasings REFUSE: apply nothing, and come back named. That was the
// honest floor while the ask had no shape for an exclusion -- refusal was
// never the answer, only the end of the lie. The exclusion beat gave the ask
// seven exclude sides, so three of the four now EXCLUDE.
//
// What the block guards is unchanged and is what still matters: a negated term
// must NEVER be applied positively. That assertion is now explicit on every
// case, and it is the one that would have caught the original defect.
describe('G1 the four recorded phrasings exclude, or refuse when they cannot', () => {
  /** term, the field it excludes into, the expected value. `null` = no exclude
   *  side exists for that term, so refusal still stands. */
  const CASES: [string, keyof typeof FIELDS | null, unknown][] = [
    ['not china', 'regions', ['China']],
    ['no china', 'regions', ['China']],
    ['excluding earnings', 'catalystTypes', ['Earnings']],
    // mistakesOnly is a FLAG, not one of the seven array fields, so it has no
    // exclude side and the refusal behaviour is still correct for it.
    ['without mistakes', null, null],
  ]
  const FIELDS = {
    regions: 'excludeRegions',
    catalystTypes: 'excludeCatalystTypes',
  } as const

  it.each(CASES)('%s never applies the term POSITIVELY', (q) => {
    const out = r(q as string)
    const positives = [
      ...out.state.regions,
      ...out.state.catalystTypes,
      ...out.state.playbookIds,
      ...out.state.sectors,
      ...out.state.industries,
      ...out.state.countries,
    ]
    expect(
      positives,
      `"${q}" applied the negated term as an inclusion: ${JSON.stringify(positives)}`,
    ).toEqual([])
  })

  it.each(CASES)('%s excludes it, or refuses when no exclude side exists', (q, field, value) => {
    const out = r(q as string)
    if (field === null) {
      expect(out.state, `"${q}" applied something it should refuse`).toEqual(emptyFilters())
      return
    }
    expect(out.state[FIELDS[field]]).toEqual(value)
  })

  it.each(CASES)('%s never silently drops the term', (q, field) => {
    const out = r(q as string)
    // Either it was understood (it shows in the applied line) or it was
    // refused (it comes back named). Silence is the one thing forbidden.
    const spoke = field === null ? out.unresolved.length > 0 : out.applied.length > 0
    expect(spoke, `"${q}" said nothing at all`).toBe(true)
  })
})

// --- G2 ---------------------------------------------------------------------

describe('G2 the campaign sentence', () => {
  it('applies outcome losers and region China, and NOTHING else', () => {
    const out = r(CAMPAIGN)
    expect(out.state.outcome).toBe('losers')
    expect(out.state.regions).toEqual(['China'])
  })

  it('no sector is applied -- "are" must not reach Healthcare', () => {
    expect(r(CAMPAIGN).state.sectors).toEqual([])
  })

  it('no mistake is applied -- "not" must not reach a mistake name', () => {
    expect(r(CAMPAIGN).state.mistakeKeys).toEqual([])
  })

  it('Hong Kong is NOT added to regions', () => {
    expect(
      r(CAMPAIGN).state.regions,
      'the excluded region was applied instead of refused',
    ).not.toContain('Hong Kong')
  })

  it('nothing is ambiguous -- "but" must not offer two industries', () => {
    const out = r(CAMPAIGN)
    expect(
      out.ambiguous,
      `an ambiguity prompt survived: ${JSON.stringify(out.ambiguous)}`,
    ).toEqual([])
  })

  it('and the whole applied set is exactly those two things', () => {
    const out = r(CAMPAIGN)
    // v0.2.7 — THREE now, not two: the limit beat taught the resolver that
    // "the 10" in this sentence is a row count. The sentence has said it all
    // along and it was unresolved until then.
    // v0.2.7 — FOUR now: the exclusion beat turned "but not from hong kong"
    // from an ignored phrase into an applied EXCLUSION. The sentence has meant
    // that from the first beat of the campaign; it is the last piece to land.
    expect(out.applied).toHaveLength(4)
    expect(out.state.limit).toBe(10)
  })
})

// --- G3 ---------------------------------------------------------------------

describe('G3 the substring floor is FOUR', () => {
  it('"are" resolves to nothing -- it must not reach Healthcare', () => {
    const out = r('are')
    expect(out.applied).toEqual([])
    expect(out.state).toEqual(emptyFilters())
  })

  it('"but" resolves to nothing AND raises no ambiguity', () => {
    const out = r('but')
    expect(out.applied).toEqual([])
    expect(
      out.ambiguous,
      `"but" still offers: ${JSON.stringify(out.ambiguous)}`,
    ).toEqual([])
  })

  it('a genuine THREE-letter exact hit still resolves -- the floor is not on exact', () => {
    // Constructed rather than depending on a book that happens to hold one.
    const WITH_TLA: ResolverVocabulary = { ...BOOK, symbols: [...BOOK.symbols, 'IBM'] }
    expect(r('ibm', WITH_TLA).state.symbol).toBe('IBM')
  })

  it('a three-character SUBSTRING no longer reaches anything', () => {
    // "eal" sits inside "healthcare" and used to be a legal substring hit.
    expect(r('eal').applied).toEqual([])
  })

  it('and the PREFIX floor is untouched at two', () => {
    expect(r('nr').state.symbol).toBe('NRVA')
  })
})

// --- G4 ---------------------------------------------------------------------

describe('G4 the substring tier still works at four', () => {
  it('"pullback" reaches the multi-word playbooks', () => {
    const out = r('pullback')
    const fired = out.applied.length > 0 || out.ambiguous.length > 0
    expect(fired, 'the substring tier stopped matching at four characters').toBe(true)
    expect(out.unresolved).toEqual([])
  })

  it('"micro" resolves outright to the one playbook containing it', () => {
    expect(r('micro').state.playbookIds).toEqual([4])
  })
})

// --- G5 ---------------------------------------------------------------------

describe('G5 a lone negator', () => {
  it('applies nothing', () => {
    expect(r('not').applied).toEqual([])
    expect(r('not').state).toEqual(emptyFilters())
  })

  it('and comes back as unresolved rather than vanishing', () => {
    expect(r('not').unresolved.join(' ')).toContain('not')
  })

  it('a negator followed by gibberish leaves both unresolved', () => {
    const out = r('not qwzzk')
    expect(out.applied).toEqual([])
    const joined = out.unresolved.join(' ')
    expect(joined).toContain('not')
    expect(joined).toContain('qwzzk')
  })
})

// --- G6 : THE POSITIVE CONTROL ----------------------------------------------

describe('G6 nothing WITHOUT a negator loses reach', () => {
  it('"china" still applies the region', () => {
    expect(r('china').state.regions).toEqual(['China'])
  })

  it('"chinese" still applies the region through the demonym', () => {
    expect(r('chinese').state.regions).toEqual(['China'])
  })

  it('"losers" still applies the outcome', () => {
    expect(r('losers').state.outcome).toBe('losers')
  })

  it('"mistakes" still applies the mistakes-only flag', () => {
    expect(r('mistakes').state.mistakesOnly).toBe(true)
  })

  it('"micro pullback" still applies the playbook', () => {
    expect(r('micro pullback').state.playbookIds).toEqual([4])
  })

  it('"hong kong" ALONE still applies -- only a negated one is refused', () => {
    expect(r('hong kong').state.regions).toEqual(['Hong Kong'])
  })

  it('"no setup" is a PLAYBOOK NAME, not a negation of "setup"', () => {
    // The exact tier wins over the negator rule, exactly as it wins over the
    // filler rule: a whole span equal to a whole vocabulary key is not a
    // resemblance and is not a negation.
    expect(
      r('no setup').state.playbookIds,
      'a real playbook name was read as a negation',
    ).toEqual([9])
  })
})
