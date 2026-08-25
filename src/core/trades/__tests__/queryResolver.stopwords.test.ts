// v0.2.7 — FILLER IS NOT VOCABULARY.
//
// THE DEFECT, observed on screen and reproduced as pure core: typing
// "show me trades of stocks under 10 dollars" applied CATALYST OFFERING /
// DILUTION and took the book to zero of one hundred forty. The source token
// was "of" — a two-character prefix of "offering / dilution".
//
// "of" was ALREADY in the resolver's stopword list. The list was simply
// consulted AFTER the match had already been attempted, and only when nothing
// matched, so a filler word that happened to resemble a vocabulary entry never
// reached its own declaration. Four of the twenty-seven declared stopwords
// applied a filter; three more went ambiguous.
//
// THE RULING these guards enforce:
//   Stopwords are consulted BEFORE the fuzzy tiers, not after.
//   An EXACT match still wins. ALL is Allstate and ON is a real ticker — a
//     whole token equal to a whole vocabulary key is not a resemblance, and
//     refusing it would be a second bug wearing the first one's clothes.
//   The tier floors do NOT move. Prefix at two characters and substring at
//     three stay exactly as they are; both are deliberate and separately
//     guarded, and this beat must not quietly narrow them.

import { describe, expect, it } from 'vitest'
import { resolveQuery, STOPWORDS, type ResolverVocabulary } from '../queryResolver'
import { emptyFilters } from '../tradesFilter'

const NOW = new Date('2026-08-22T15:00:00')

/** The demo book's own vocabulary, the shape that produced the defect: the
 *  catalyst and mistake names come from the DEF TABLES, so they are present
 *  whether or not a single trade carries them. */
const BOOK: ResolverVocabulary = {
  symbols: ['NRVA', 'ZYPH', 'QMTX', 'VYRN', 'TKSI', 'HLPX'],
  regions: ['USA'],
  countries: [{ iso: 'US', name: 'United States' }],
  sectors: [],
  industries: [],
  playbooks: [
    { id: 1, name: '1-min Pullback', tier: 'A+' },
    { id: 2, name: '5-min Pullback', tier: 'A' },
    { id: 3, name: 'Bull Flag', tier: 'A' },
    { id: 4, name: 'Micro Pullback', tier: 'A+' },
    { id: 5, name: 'First Pullback to VWAP', tier: 'B' },
    { id: 9, name: 'No Setup', tier: null },
  ],
  catalystTypes: [
    'Earnings', 'News / PR', 'Offering / Dilution', 'M&A / Buyout',
    'Uplisting', 'Other', 'Technical / No Catalyst',
  ],
  mistakes: [
    { axis: 'psychological', name: 'Hold-and-hope (held a loser too long)' },
    { axis: 'technical', name: 'Chased extension (too far from 9 EMA)' },
    { axis: 'technical', name: 'Chased extended' },
  ],
}

const r = (text: string, vocab: ResolverVocabulary = BOOK) =>
  resolveQuery(text, vocab, NOW)

// --- G1 ---------------------------------------------------------------------

describe('G1 the observed defect', () => {
  it('"show me trades of stocks under 10 dollars" applies NOTHING', () => {
    const out = r('show me trades of stocks under 10 dollars')
    expect(
      out.applied,
      `a filter was applied from filler: ${out.applied.join(' | ')}`,
    ).toEqual([])
  })

  it('and leaves the state identical to empty filters', () => {
    const out = r('show me trades of stocks under 10 dollars')
    expect(out.state).toEqual(emptyFilters())
  })

  it('specifically: no catalyst is ever applied from that sentence', () => {
    const out = r('show me trades of stocks under 10 dollars')
    expect(out.state.catalystTypes).toEqual([])
  })
})

// --- G2 ---------------------------------------------------------------------

describe('G2 the bare culprit token', () => {
  it('"of" alone resolves to nothing', () => {
    const out = r('of')
    expect(out.applied).toEqual([])
    expect(out.state).toEqual(emptyFilters())
  })

  it('and it is filler, so it is not reported as unresolved either', () => {
    // A declared stopword carries no meaning by definition. Returning it as
    // unresolved would invite the model seam to try to make sense of "of".
    expect(r('of').unresolved).toEqual([])
  })
})

// --- G3 ---------------------------------------------------------------------

describe('G3 EVERY declared stopword is inert', () => {
  // Iterated from the EXPORTED list, never hand-copied: a hand copy silently
  // stops covering the list the day someone edits it.
  const words = [...STOPWORDS]

  it('the list is non-empty and exported (the battery has something to iterate)', () => {
    expect(words.length).toBeGreaterThan(0)
  })

  it.each(words)('%s applies no filter', (word) => {
    const out = r(word)
    expect(
      out.applied,
      `"${word}" applied: ${out.applied.join(' | ')}`,
    ).toEqual([])
  })

  it.each(words)('%s goes nowhere ambiguous', (word) => {
    const out = r(word)
    expect(
      out.ambiguous,
      `"${word}" was offered as: ${out.ambiguous.map((a) => a.candidates.join(' / ')).join(' ; ')}`,
    ).toEqual([])
  })

  it.each(words)('%s leaves the state untouched', (word) => {
    expect(r(word).state).toEqual(emptyFilters())
  })
})

// --- G4 ---------------------------------------------------------------------

describe('G4 an EXACT match still wins over the stopword list', () => {
  // Constructed, deliberately: the demo book holds no such ticker, and a guard
  // that depends on a particular book having one would rot the moment the book
  // changed. ALL is Allstate; ON is a real listed ticker too.
  const WITH_TICKERS: ResolverVocabulary = {
    ...BOOK,
    symbols: [...BOOK.symbols, 'ALL', 'ON'],
  }

  it('"all" is a stopword AND a ticker -- the ticker wins', () => {
    const out = r('all', WITH_TICKERS)
    expect(out.state.symbol, 'an exact ticker was swallowed by the filler list').toBe('ALL')
    expect(out.applied.length).toBe(1)
  })

  it('"on" likewise', () => {
    const out = r('on', WITH_TICKERS)
    expect(out.state.symbol).toBe('ON')
  })

  it('but the same word still applies NOTHING when no entry equals it exactly', () => {
    // "of" is not a ticker anywhere -- only a prefix of a catalyst.
    expect(r('of', WITH_TICKERS).applied).toEqual([])
  })

  it('an exact match is not the fuzzy tier in disguise: a PREFIX of a ticker is still refused for filler', () => {
    // "all" exactly equals ALL, so it resolves; "al" is only a prefix of it
    // and is not a stopword, so it must still reach the prefix tier.
    expect(r('al', WITH_TICKERS).state.symbol).toBe('ALL')
  })
})

// --- G5 ---------------------------------------------------------------------

describe('G5 the substring tier survives untouched', () => {
  it('a contained word still reaches a multi-word entry', () => {
    const out = r('pullback')
    // Several playbooks contain it, so the honest result is an offer, not a
    // pick -- what matters is that the substring tier still FIRES.
    const fired = out.applied.length > 0 || out.ambiguous.length > 0
    expect(fired, 'the substring tier stopped matching entirely').toBe(true)
    expect(out.unresolved).toEqual([])
  })

  it('a non-filler substring of a single entry resolves outright', () => {
    const out = r('micro')
    expect(out.state.playbookIds).toEqual([4])
  })

  it('the prefix tier at two characters still fires for non-filler', () => {
    const out = r('nr')
    expect(out.state.symbol).toBe('NRVA')
  })
})

// --- G6 ---------------------------------------------------------------------

describe('G6 the shipped two-character ambiguity behaviour is unchanged', () => {
  const COLLIDE: ResolverVocabulary = {
    ...BOOK,
    symbols: ['ASTC', 'ASND'],
  }

  it('a colliding two-char prefix returns BOTH candidates and picks neither', () => {
    const out = r('as', COLLIDE)
    expect(out.state).toEqual(emptyFilters())
    expect(out.ambiguous).toEqual([{ text: 'as', candidates: ['ASTC', 'ASND'] }])
    expect(out.unresolved).toEqual([])
  })
})
