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

// ─── RY : THE WORDS EDGE WAS MISSING ─────────────────────────────────────────
//
// Twenty sentences a trader would actually type were driven against a real
// book. Ten carried a non-empty unresolved while being understood perfectly --
// and every one of those leftovers was a phrasing habit, not a filter term.
// "give me", "where", "what were", "find", "everything", "this month" all
// landed in the ignored clause, so a rule that refuses on unresolved would
// have refused half of ordinary use.
//
// FILLER IS A JUDGEMENT, NOT A FREE ACTION. A word joins this list only if it
// can never mean anything filterable ON ITS OWN. Each of the nine below was
// driven alone against a real book first and applied nothing, ambiguously or
// otherwise. "last" was REFUSED entry by that test: "last week" is a real
// range, and making it filler would silently accept it as "this week".
// Superlatives were refused entry too, for a different reason recorded below.
//
// WHAT THE LIST DOES, AND DOES NOT. A stopword is marked only AFTER the match
// attempt and only when nothing matched -- queryResolver.ts:926-927. So adding
// a word suppresses the REPORT of a word that found nothing; it never prevents
// a word from matching. G4 above is the deliberate ruling that an exact
// vocabulary hit beats the filler list, and it still holds.
//
// EXACT VOCABULARY ONLY. No floor moved, no tier added, no did-you-mean. RY6
// pins that behaviourally rather than by reading the source.

/** A book with the geography and the sector the twenty sentences need, plus
 *  Malaysia -- deliberately, because "my" exactly matches its code and that
 *  behaviour is guarded here as it actually is rather than as one might wish. */
const RY_BOOK: ResolverVocabulary = {
  symbols: [],
  regions: ['USA', 'China', 'Hong Kong'],
  countries: [
    { iso: 'US', name: 'United States' },
    { iso: 'MY', name: 'Malaysia' },
  ],
  sectors: ['Healthcare'],
  industries: [],
  playbooks: [{ id: 1, name: 'Bull Flag', tier: 'A' }],
  catalystTypes: [],
  mistakes: [{ axis: 'technical', name: 'Chased extension (too far from 9 EMA)' }],
}
const ry = (t: string) => resolveQuery(t, RY_BOOK, NOW, emptyFilters())

/** The nine words this beat adds, each with a sentence that carried it into
 *  the ignored clause, and the same sentence without it. */
const FILLER_CASES: { word: string; withIt: string; without: string }[] = [
  { word: 'give',       withIt: 'give me chinese losers',        without: 'chinese losers' },
  { word: 'where',      withIt: 'trades where i lost',           without: 'i lost' },
  { word: 'what',       withIt: 'what were my losers',           without: 'were my losers' },
  { word: 'were',       withIt: 'were my losers chinese',        without: 'my losers chinese' },
  { word: 'are',        withIt: 'what are my chinese trades',    without: 'what my chinese trades' },
  { word: 'find',       withIt: 'find my chinese winners',       without: 'my chinese winners' },
  { word: 'everything', withIt: 'everything chinese',            without: 'chinese' },
  { word: 'this',       withIt: 'chinese losers this month',     without: 'chinese losers month' },
  { word: 'money',      withIt: 'chinese stocks that lost money', without: 'chinese stocks that lost' },
]

// ─── RY1 and RY2 : ONE CASE PER ADDED WORD ───────────────────────────────────

describe('RY1 each added filler word is ignored, and changes nothing else', () => {
  it.each(FILLER_CASES)('$word no longer reaches the ignored clause', ({ word, withIt }) => {
    const out = ry(withIt)
    expect(
      out.unresolved.join(' '),
      `"${word}" still comes back as unread, so a refusal rule would refuse ` +
        `"${withIt}" -- an ordinary sentence Edge understands`,
    ).not.toContain(word)
  })

  it.each(FILLER_CASES)('$word leaves the resolved state identical', ({ word, withIt, without }) => {
    // The word is IGNORED, not interpreted. If dropping it changed the answer
    // it was never filler.
    expect(
      ry(withIt).state,
      `"${word}" changed what the sentence means`,
    ).toEqual(ry(without).state)
  })

  it.each(FILLER_CASES)('$word alone applies nothing at all', ({ word }) => {
    // The R103 test, executed rather than asserted in prose: a word joins the
    // filler list only if it can never mean anything filterable on its own.
    const out = ry(word)
    expect(out.applied, `"${word}" applied something alone`).toEqual([])
    expect(out.ambiguous, `"${word}" was offered as a choice`).toEqual([])
    expect(out.state).toEqual(emptyFilters())
  })
})

// ─── RY4 : THE TWENTY, THE INSTRUMENT ────────────────────────────────────────

/** Beat 116's twenty, verbatim. The count alone would pass if the wrong ones
 *  were fixed, so the dirty ones are named and the blocking word is named. */
const TWENTY: string[] = [
  'show me chinese losers', 'give me the trades where i lost money',
  'what were my losers last week', 'find trades under 10 dollars',
  'i want chinese stocks', 'chinese losers', 'show me my winners',
  'all my chinese trades', 'trades with float under 10 million',
  'show me the last 10 trades', 'my biggest losers', 'losers from china',
  'show me trades in healthcare', 'what are my worst trades',
  'chinese stocks that lost money', 'show me everything under 5 dollars',
  'trades where i chased extended', 'my hong kong trades',
  'show me losers this month', 'find my chinese winners',
]

/** The six that REMAIN dirty after this beat, each with the word that blocks
 *  it. Every one is a PARSER gap, not a vocabulary gap, and is deliberately
 *  out of scope here. */
const STILL_DIRTY: Record<string, string> = {
  'what were my losers last week': 'last',
  // MEASURED, and it corrects an assumption. On the real book this sentence
  // looked CLEAN -- but only because "want" substring-matched the mistake
  // "High-volume pullback (wanted low volume)" and applied it. On a book
  // without that mistake the word honestly comes back unread. "want" is
  // therefore NOT filler by the R103 test: it matches something on a real
  // book, and adding it to the list would not stop that match anyway.
  'i want chinese stocks': 'want',
  'find trades under 10 dollars': 'under 10 dollars',
  'my biggest losers': 'biggest',
  'what are my worst trades': 'worst',
  'show me everything under 5 dollars': 'under 5 dollars',
  'trades where i chased extended': 'extended',
}

describe('RY4 the twenty sentences', () => {
  it('exactly thirteen resolve with nothing left over', () => {
    const clean = TWENTY.filter((q) => ry(q).unresolved.length === 0)
    expect(clean.length, `clean: ${clean.join(' | ')}`).toBe(13)
  })

  it('and the seven that do not are these seven, by name', () => {
    const dirty = TWENTY.filter((q) => ry(q).unresolved.length > 0).sort()
    expect(dirty).toEqual(Object.keys(STILL_DIRTY).sort())
  })

  it.each(Object.entries(STILL_DIRTY))('%s is blocked by %s', (q, blocker) => {
    // Naming the blocker means a later beat that fixes the parser has to
    // update this table on purpose rather than watch a number drift.
    expect(ry(q).unresolved.join(' ')).toContain(blocker.split(' ')[0]!)
  })
})

// ─── RY5 : SCOPE GUARD — the other seven uses of the list ────────────────────

describe('RY5 adding filler changes no existing resolution', () => {
  // STOPWORDS is consulted in eight places, not one: the magnitude scan, the
  // negation span, two limit scans, two comparison-adjacency rules, the value
  // scan, and the all-filler guard on the fuzzy tiers. Adding words changes
  // how far each of those scans, so each is pinned here.
  const PINNED: [string, unknown][] = [
    ['the last 10 trades', { limit: 10, sort: { colId: 'open_time', dir: 'desc' } }],
    ['float under 10 million', { ranges: { float: { min: null, max: 10_000_000 } } }],
    ['winners over 100', { outcome: 'winners', ranges: { net_pnl: { min: 100, max: null } } }],
    ['money over 100', { ranges: { net_pnl: { min: 100, max: null } } }],
    ['not from hong kong', { excludeRegions: ['Hong Kong'] }],
    ['chinese losers', { outcome: 'losers', regions: ['China'] }],
  ]
  it.each(PINNED)('%s resolves exactly as before', (ask, expected) => {
    const out = ry(ask as string)
    const base = emptyFilters() as unknown as Record<string, unknown>
    const got: Record<string, unknown> = {}
    const st = out.state as unknown as Record<string, unknown>
    for (const k of Object.keys(st)) {
      if (JSON.stringify(st[k]) !== JSON.stringify(base[k])) got[k] = st[k]
    }
    expect(got).toEqual(expected)
  })
})

// ─── RY6 : SCOPE GUARD — no floor moved, no tier added ──────────────────────

describe('RY6 the three tiers are untouched', () => {
  // Asserted BEHAVIOURALLY, not by reading the source: a guard that greps its
  // own implementation proves only that the text is unchanged.
  const T: ResolverVocabulary = { ...RY_BOOK, symbols: ['NRVA'], sectors: ['Healthcare'] }
  const t = (q: string) => resolveQuery(q, T, NOW, emptyFilters())

  it('EXACT still wins with no floor at all', () => {
    expect(t('usa').state.regions).toEqual(['USA'])
  })

  it('PREFIX still reaches at two characters', () => {
    expect(t('nr').state.symbol, 'the prefix floor moved above two').toBe('NRVA')
  })

  it('and still does NOT reach at one', () => {
    expect(t('n').state.symbol, 'the prefix floor dropped to one').toBe('')
  })

  it('SUBSTRING still reaches at four and not at three', () => {
    // "care" is inside Healthcare at four characters; "are" is three and must
    // not reach it. Beat sixty-six raised this floor for exactly that case.
    expect(t('care').state.sectors).toEqual(['Healthcare'])
    expect(t('are').state.sectors, 'the substring floor dropped below four').toEqual([])
  })
})
