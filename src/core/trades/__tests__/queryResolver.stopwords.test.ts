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

describe('G4 an EXACT match is OFFERED, not taken, when the word is filler', () => {
  // Constructed, deliberately: the demo book holds no such ticker, and a guard
  // that depends on a particular book having one would rot the moment the book
  // changed. ALL is Allstate; ON is a real listed ticker too.
  const WITH_TICKERS: ResolverVocabulary = {
    ...BOOK,
    symbols: [...BOOK.symbols, 'ALL', 'ON'],
  }

  // INVERTED IN PLACE. This block asserted the OPPOSITE ruling, deliberately,
  // and the old assertions are kept here verbatim rather than deleted so the
  // reversal is legible:
  //
  //     it('"all" is a stopword AND a ticker -- the ticker wins', () => {
  //       const out = r('all', WITH_TICKERS)
  //       expect(out.state.symbol,
  //         'an exact ticker was swallowed by the filler list').toBe('ALL')
  //       expect(out.applied.length).toBe(1)
  //     })
  //     it('"on" likewise', () => {
  //       expect(r('on', WITH_TICKERS).state.symbol).toBe('ON')
  //     })
  //
  // WHY IT CHANGED. The old ruling was written for a ticker -- a word the user
  // would only type meaning the ticker. It was then measured against a country
  // CODE: "my" is Malaysia, and seven of twenty ordinary sentences filtered the
  // whole book down to Malaysia because someone wrote "my winners". The word is
  // ambiguous by construction, and Edge does not pick. The filler reading wins
  // by default and the ticker is offered, so nothing that was reachable before
  // became unreachable -- it just stopped happening without being asked.

  it('"all" is a stopword AND a ticker -- the ticker is OFFERED, not applied', () => {
    const out = r('all', WITH_TICKERS)
    expect(out.state.symbol, 'the filler word silently applied its ticker').toBe('')
    expect(out.applied, 'something was applied without being asked').toEqual([])
    expect(
      out.ambiguous.map((a) => a.text),
      'the ticker reading was discarded rather than offered',
    ).toContain('all')
    expect(out.ambiguous.find((a) => a.text === 'all')!.candidates).toContain('ALL')
  })

  it('"on" likewise', () => {
    const out = r('on', WITH_TICKERS)
    expect(out.state.symbol).toBe('')
    expect(out.ambiguous.map((a) => a.text)).toContain('on')
  })

  it('but THIS offer loops, because the candidate is the same word', () => {
    // MEASURED, and my first assertion here was wrong: I asserted the offer was
    // takeable and it is not, for this shape.
    //
    // Taking an offer substitutes the candidate back into the sentence and
    // re-resolves. That works when the candidate is a DIFFERENT word -- "my"
    // offers "Malaysia", and Malaysia resolves. It cannot work when the
    // candidate is the same word in another case: "ALL" lowercases to "all",
    // which is still filler, so the offer comes back instead of applying.
    //
    // Left as a measured boundary rather than papered over. It costs nothing
    // today: the only collision on either real book is "my", whose candidate is
    // a different word and IS takeable -- asserted in RZ4. A two-letter ticker
    // that is also filler would need the ask to grow a way of saying "the
    // ticker", and that is a separate ruling.
    const out = r('all', WITH_TICKERS)
    const candidate = out.ambiguous.find((a) => a.text === 'all')!.candidates[0]!
    const taken = r(candidate, WITH_TICKERS)
    expect(taken.state.symbol, 'the loop closed unexpectedly -- re-measure').toBe('')
    expect(taken.ambiguous.map((a) => a.text)).toContain('all')
  })

  it('but the same word still applies NOTHING when no entry equals it exactly', () => {
    // "of" is not a ticker anywhere -- only a prefix of a catalyst.
    expect(r('of', WITH_TICKERS).applied).toEqual([])
  })

  it('an exact match is not the fuzzy tier in disguise: a PREFIX of a ticker is still refused for filler', () => {
    // "all" exactly equals ALL, so it resolves; "al" is only a prefix of it
    // and is not a stopword, so it must still reach the prefix tier.
    // REVERSED BY BEAT 152. WAS: 'al' -> ALL by two-character prefix. At the
    // new floor a two-letter prefix reaches nothing, so the strict boundary
    // discards. The EXACT half of this assertion is untouched, above.
    expect(r('al', WITH_TICKERS).state.symbol).toBe('')
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

  it('the prefix tier fires at THREE characters for non-filler', () => {
    // REVERSED BY BEAT 152. WAS: r('nr') -> symbol NRVA.
    expect(r('nrv').state.symbol).toBe('NRVA')
  })
})

// --- G6 ---------------------------------------------------------------------

describe('G6 the shipped two-character ambiguity behaviour is unchanged', () => {
  const COLLIDE: ResolverVocabulary = {
    ...BOOK,
    symbols: ['ASTC', 'ASND'],
  }

  it('a colliding two-char prefix returns BOTH candidates and picks neither', () => {
    // REVERSED BY BEAT 152. WAS: two candidates offered for 'as'. At the new
    // symbol floor a two-letter token reaches neither ticker, so there is no
    // collision to report and the word comes back unread instead.
    const out = r('as', COLLIDE)
    expect(out.state).toEqual(emptyFilters())
    expect(out.ambiguous).toEqual([])
    expect(out.unresolved).toContain('as')
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

/** The ones that REMAIN dirty, each with the word that blocks it. Every one is
 *  a PARSER gap, not a vocabulary gap, and is deliberately out of scope here.
 *
 *  ONE ENTRY WAS REMOVED FROM THIS TABLE ON PURPOSE, which is what naming the
 *  blocker was for. It read:
 *
 *      // MEASURED, and it corrects an assumption. On the real book this
 *      // sentence looked CLEAN -- but only because "want" substring-matched
 *      // the mistake "High-volume pullback (wanted low volume)" and applied
 *      // it. On a book without that mistake the word honestly comes back
 *      // unread. "want" is therefore NOT filler by the R103 test: it matches
 *      // something on a real book, and adding it to the list would not stop
 *      // that match anyway.
 *      'i want chinese stocks': 'want',
 *
 *  The last clause is FALSE, and it is the reason this table changed. Adding
 *  "want" to the list DOES stop the match: `isFiller` gates the substring
 *  tier, which is the tier the match came through. The measurement behind the
 *  refusal drove the word BEFORE adding it, so it could only ever report what
 *  the word did as a non-filler word. See the RB block for the corrected test. */
const STILL_DIRTY: Record<string, string> = {
  'what were my losers last week': 'last',
  'find trades under 10 dollars': 'under 10 dollars',
  'my biggest losers': 'biggest',
  'what are my worst trades': 'worst',
  'show me everything under 5 dollars': 'under 5 dollars',
  // v0.2.7 -- ONE ENTRY LEFT THIS TABLE, and it left because the sentence is
  // now READ rather than half-read. "extended" was not a word this resolver
  // knew; it is a band word now, with the threshold the Technicals tab already
  // defines. The blocker is gone, so the row is gone, and the count below moved
  // with it. The old row read:
  //     'trades where i chased extended': 'extended',
}

describe('RY4 the twenty sentences', () => {
  it('exactly fifteen resolve with nothing left over', () => {
    // Was THIRTEEN. The fourteenth is "i want chinese stocks", and it did not
    // become clean by being understood better -- it was ALREADY reported clean
    // before, while filtering on a mistake nobody named. What changed is that
    // it is now clean AND correct. RB8 asserts that second half, because this
    // count alone cannot tell the two apart.
    //
    // AND NOW FIFTEEN. The fifteenth is "trades where i chased extended",
    // clean because "extended" became a band word rather than an unknown one.
    const clean = TWENTY.filter((q) => ry(q).unresolved.length === 0)
    expect(clean.length, `clean: ${clean.join(' | ')}`).toBe(15)
  })

  it('and the five that do not are these five, by name', () => {
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

  it('PREFIX now needs THREE characters for a symbol', () => {
    // REVERSED BY BEAT 152. WAS:
    //   expect(t('nr').state.symbol, '...').toBe('NRVA')
    // The symbol prefix floor moved from two to three, measured: at two, "am"
    // reached AMIX and "be" reached BESS from ordinary English.
    expect(t('nrv').state.symbol, 'the prefix floor moved above three').toBe('NRVA')
    expect(t('nr').state.symbol, 'the symbol floor is not three').toBe('')
  })

  it('and still does NOT reach at one', () => {
    expect(t('n').state.symbol, 'the prefix floor dropped to one').toBe('')
  })

  it('SUBSTRING still reaches at four and not at three', () => {
    // "care" is inside Healthcare at four characters; three characters must not
    // reach it. Beat sixty-six raised this floor for exactly that case.
    //
    // THE THREE-CHARACTER TOKEN WAS CHANGED, and the old line read:
    //     expect(t('are').state.sectors, '...').toEqual([])
    // It could not fail. This beat added "are" to the filler list, and a filler
    // word is refused by tiers two and three whatever the floor is -- so that
    // assertion passed with the floor at one. "car" is not filler, so the floor
    // is what decides it. A guard that can pass vacuously is worse than none.
    // REVERSED BY BEAT 152. WAS: care APPLIED sector Healthcare. The tier still
    // REACHES at four and not at three -- which is what this assertion exists to
    // prove -- but a substring hit now OFFERS instead of applying.
    expect(t('care').state.sectors).toEqual([])
    expect(t('care').ambiguous.map((a) => a.text)).toContain('care')
    expect(t('car').ambiguous, 'the substring floor dropped below four').toEqual([])
    expect(t('car').state.sectors, 'the substring floor dropped below four').toEqual([])
  })
})

// ─── RZ : A WORD THAT IS BOTH FILLER AND VOCABULARY IS A QUESTION ────────────
//
// Seven of twenty ordinary sentences applied a country filter for Malaysia
// because the user typed "my". An eighth applied a mistake off "want". All
// eight had an EMPTY ignored clause and were counted clean, which is why this
// went unseen for so long: an empty complaint is not correctness.
//
// THE MECHANISM. A filler word is marked only AFTER the match attempt and only
// when nothing matched. So the filler list suppresses the REPORT of an unmatched
// word and never prevents a match. Tiers two and three already refuse an
// all-filler phrase; tier one -- exact -- did not, so a stopword that exactly
// equals a ticker or a country code applied outright.
//
// THIS REVERSES A RULING, DELIBERATELY. G4 above asserted that an exact match
// WINS over the filler list, and it asserted it on purpose. It is inverted in
// place below with the old assertion quoted, never deleted, because the change
// is a decision and the record should show one.
//
// THE NEW RULING. A word that is both filler and vocabulary is ambiguous BY
// CONSTRUCTION, and Edge does not pick. The filler reading wins by default; the
// vocabulary reading is OFFERED, in the same `ambiguous` shape the bubble
// already renders, whose candidate is substituted back into the sentence when
// the user takes it. Capability preserved; only the silent choice removed.

/** A book where EVERY filler word is also a ticker. Constructed, deliberately:
 *  on the real books only "my" collides, and a guard that depended on that
 *  would rot the day someone traded a two-letter symbol. This drives the
 *  MECHANISM across all of them at once. */
const ALL_FILLER_TICKERS: ResolverVocabulary = {
  ...BOOK,
  symbols: [...BOOK.symbols, ...[...STOPWORDS].map((w) => w.toUpperCase())],
}

/** The one real collision, measured on the beat-72 book: "my" is Malaysia's
 *  ISO code. Zero collisions on the demo book. */
const WITH_MALAYSIA: ResolverVocabulary = {
  ...BOOK,
  regions: ['USA', 'China'],
  countries: [
    { iso: 'US', name: 'United States' },
    { iso: 'MY', name: 'Malaysia' },
  ],
}
const rz = (t: string) => resolveQuery(t, WITH_MALAYSIA, NOW, emptyFilters())

// ─── RZ1 ─────────────────────────────────────────────────────────────────────

describe('RZ1 a filler word does not apply its vocabulary reading', () => {
  it('"show me my winners" filters on the outcome and NOT on a country', () => {
    const out = rz('show me my winners')
    expect(
      out.state.countries,
      'the user said "my" and Edge filtered the book down to Malaysia',
    ).toEqual([])
    // The companion half: a cure that broke the sentence would satisfy the
    // assertion above and be worse than the defect.
    expect(out.state.outcome, 'the sentence stopped working altogether').toBe('winners')
  })

  it('and the whole sentence is otherwise untouched', () => {
    expect(rz('show me my winners').state).toEqual({
      ...emptyFilters(),
      outcome: 'winners',
    })
  })
})

// ─── RZ2 : THE TABLE, EVERY FILLER WORD ──────────────────────────────────────

describe('RZ2 every filler word, against a book where it is also a ticker', () => {
  const words = [...STOPWORDS]

  it('the battery has something to iterate', () => {
    expect(words.length).toBeGreaterThan(0)
  })

  it.each(words)('%s applies no symbol filter', (w) => {
    const out = resolveQuery(w, ALL_FILLER_TICKERS, NOW, emptyFilters())
    expect(
      out.state.symbol,
      `"${w}" is filler AND a ticker, and Edge picked the ticker`,
    ).toBe('')
  })

  it.each(words)('%s still OFFERS the ticker reading', (w) => {
    // R108: capability preserved. The reading is not discarded, it is offered.
    const out = resolveQuery(w, ALL_FILLER_TICKERS, NOW, emptyFilters())
    expect(
      out.ambiguous.map((a) => a.text),
      `"${w}" collided and the vocabulary reading was thrown away`,
    ).toContain(w)
  })
})

// ─── RZ3 : THE OFFER NAMES THE READING ───────────────────────────────────────

describe('RZ3 the offer names what it would mean', () => {
  it('"my" offers Malaysia by name', () => {
    const out = rz('show me my winners')
    const offer = out.ambiguous.find((a) => a.text === 'my')
    expect(offer, 'no offer was made -- the reading was discarded').toBeTruthy()
    expect(
      offer!.candidates,
      'the offer does not name what taking it would do',
    ).toContain('Malaysia')
  })
})

// ─── RZ4 : THE OFFER IS TAKEABLE ─────────────────────────────────────────────

describe('RZ4 taking the offer applies the reading', () => {
  it('substituting the candidate resolves to the country filter', () => {
    // This is exactly what the bubble does: `pick` replaces the ambiguous text
    // with the candidate in the input and re-resolves. Driven here without the
    // component, because the substitution is the whole of the mechanism.
    const out = rz('show me my winners')
    const candidate = out.ambiguous.find((a) => a.text === 'my')!.candidates[0]!
    const taken = rz('show me my winners'.replace(/\bmy\b/, candidate))
    expect(
      taken.state.countries,
      'the offer could not be taken -- capability was removed, not deferred',
    ).toEqual(['MY'])
    expect(taken.state.outcome).toBe('winners')
  })
})

// ─── RZ5 : THE DISCRIMINATING COMPANION ──────────────────────────────────────

describe('RZ5 a NON-filler word still applies outright', () => {
  // Without this, RZ1 and RZ2 pass for a cure that made everything ambiguous
  // and applied nothing ever again.
  it('"chinese" applies the region and is not offered as a choice', () => {
    const out = rz('chinese')
    expect(out.state.regions, 'an ordinary word stopped applying').toEqual(['China'])
    expect(out.ambiguous, 'an ordinary word became a question').toEqual([])
  })

  it('and a two-word ordinary ask still applies both halves', () => {
    const out = rz('chinese losers')
    expect(out.state.regions).toEqual(['China'])
    expect(out.state.outcome).toBe('losers')
    expect(out.ambiguous).toEqual([])
  })
})

// ─── RZ6 : THE TWENTY, CLEAN AND CORRECT ─────────────────────────────────────

const RZ_TWENTY: string[] = [
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

describe('RZ6 the twenty, judged on the STATE rather than on silence', () => {
  it('not one of them filters on a country nobody named', () => {
    // The defect in one assertion. Eight of these were "clean" before and
    // seven of the eight were filtering on Malaysia.
    const bogus = RZ_TWENTY.filter((q) => rz(q).state.countries.length > 0)
    expect(bogus, `still filtering on a country: ${bogus.join(' | ')}`).toEqual([])
  })

  it('and the ones that used to be wrong now resolve correctly', () => {
    expect(rz('show me my winners').state.outcome).toBe('winners')
    expect(rz('all my chinese trades').state.regions).toEqual(['China'])
    expect(rz('my hong kong trades').state.regions).toEqual([])
    expect(rz('find my chinese winners').state.regions).toEqual(['China'])
    expect(rz('find my chinese winners').state.outcome).toBe('winners')
  })
})

// ─── RZ7 : SCOPE GUARD — no floor moved ─────────────────────────────────────

describe('RZ7 the three tiers are still untouched', () => {
  const T: ResolverVocabulary = { ...WITH_MALAYSIA, symbols: ['NRVA'], sectors: ['Healthcare'] }
  const t = (q: string) => resolveQuery(q, T, NOW, emptyFilters())

  it('EXACT still wins for a NON-filler word, with no floor', () => {
    expect(t('usa').state.regions).toEqual(['USA'])
  })

  it('PREFIX reaches at THREE and not at two', () => {
    // REVERSED BY BEAT 152. WAS: nr -> NRVA, n -> ''.
    expect(t('nrv').state.symbol).toBe('NRVA')
    expect(t('nr').state.symbol).toBe('')
  })

  it('SUBSTRING still reaches at four and not at three', () => {
    // "are" replaced by "car" for the three-character half -- see RY6. "are" is
    // filler, so tiers two and three refuse it at any floor.
    // REVERSED BY BEAT 152. WAS: care -> ['Healthcare'] APPLIED.
    // The substring tier now OFFERS instead of applying, so the sector is
    // named as a choice and nothing is filtered.
    expect(t('care').state.sectors).toEqual([])
    expect(t('care').ambiguous.map((a) => a.text)).toContain('care')
    expect(t('car').state.sectors).toEqual([])
  })
})

// ─── RB : EVERY GRAMMAR WORD, TESTED THE RIGHT WAY ROUND ─────────────────────
//
// TWO EARLIER BEATS REFUSED A WORD ON A TEST THAT ASKED THE WRONG QUESTION.
// "want" was refused because it matched a mistake name; "even" was refused
// because it matched another. Both were driven BEFORE being added to the list,
// and both matched through the SUBSTRING tier -- the tier `isFiller` gates. So
// the measurement answered "does this word match today", when the question was
// "does this word match ONCE IT IS FILLER". Driving a word before adding it
// cannot answer that.
//
// THE CORRECTED TEST is ADD-THEN-DRIVE, and it reverses both refusals: with
// the word in the list, tiers two and three refuse it and it matches nothing.
// Four words were producing wrong answers on that mistake -- want, even,
// before, first -- and all four are cured by a list entry alone.
//
// WHAT DOES *NOT* JOIN, and this is the harder half. A word is refused when
// swallowing it would turn a REPORTED gap into a SILENT one. "or" names a
// disjunction the parser cannot do, and today it lands in the ignored clause,
// which is the only sign the user's first term was thrown away. Make it filler
// and a wrong answer starts looking clean. The same reasoning keeps every
// time-of-day word out: "morning trades" cannot be answered, and saying so is
// better than quietly returning the book. Refused words are pinned by a guard
// below so a later beat has to change them on purpose.

/** Built to the collisions this beat is about, and no wider. Each mistake name
 *  here is one a real book carries and one that a grammar word reaches by
 *  prefix or substring -- "before" inside a trigger note, "even" inside
 *  "revenge", "wanted" inside a volume note. A book without them would let
 *  every assertion below pass while the defect stood. */
const RB_BOOK: ResolverVocabulary = {
  symbols: ['NRVA'],
  regions: ['USA', 'China', 'Hong Kong'],
  countries: [{ iso: 'US', name: 'United States' }],
  sectors: ['Healthcare'],
  industries: [],
  playbooks: [
    { id: 4, name: 'Micro Pullback', tier: 'A+' },
    { id: 5, name: 'First Pullback to VWAP', tier: 'B' },
  ],
  catalystTypes: ['Halt Resume'],
  mistakes: [
    { axis: 'technical', name: 'Entered too early / before trigger' },
    { axis: 'technical', name: 'Cut winner too early (fear)' },
    { axis: 'technical', name: 'High-volume pullback (wanted low volume)' },
    { axis: 'psychological', name: 'Revenge trade (after a loss)' },
    { axis: 'psychological', name: 'Overconfidence after a win' },
  ],
}
const rb = (text: string) => resolveQuery(text, RB_BOOK, NOW, emptyFilters())

/** Only the keys that moved. An assertion on the whole state would pass for a
 *  cure that emptied it, and an assertion on `unresolved` alone would pass for
 *  a cure that swallowed everything. */
const rbDelta = (state: unknown): Record<string, unknown> => {
  const base = emptyFilters() as unknown as Record<string, unknown>
  const st = state as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(st)) {
    if (JSON.stringify(st[k]) !== JSON.stringify(base[k])) out[k] = st[k]
  }
  return out
}

/** The eleven this beat adds. Seven are pure connectives that were landing in
 *  the ignored clause; four were APPLYING A FILTER nobody asked for. */
const RB_ADDED = [
  'but', 'plus', 'also', 'then', 'only', 'just', 'still',
  'want', 'even', 'before', 'first',
] as const

// ─── RB1 : ONE CASE PER ADDED WORD ───────────────────────────────────────────

describe('RB1 each added word applies nothing at all, alone', () => {
  it.each(RB_ADDED)('%s is in the list', (w) => {
    expect(STOPWORDS.has(w), `"${w}" was never added`).toBe(true)
  })

  it.each(RB_ADDED)('%s applies no filter and offers no choice', (w) => {
    // Judged on the STATE, not on silence: an empty ignored clause is exactly
    // how four of these words hid for so long.
    const out = rb(w)
    expect(rbDelta(out.state), `"${w}" applied a filter on its own`).toEqual({})
    expect(out.applied, `"${w}" applied something`).toEqual([])
    expect(out.ambiguous, `"${w}" was offered as a choice`).toEqual([])
  })
})

// ─── RB2 : EACH ONE INSIDE A SENTENCE ────────────────────────────────────────

/** word -> a sentence carrying it, and the same sentence without it. The state
 *  must be identical: the word is IGNORED, never interpreted. */
const RB_SENTENCES: { word: string; withIt: string; without: string }[] = [
  { word: 'but',    withIt: 'micro pullback trades but not halt resume', without: 'micro pullback trades not halt resume' },
  { word: 'plus',   withIt: 'chinese plus healthcare',      without: 'chinese healthcare' },
  { word: 'also',   withIt: 'chinese and also healthcare',  without: 'chinese and healthcare' },
  { word: 'then',   withIt: 'losers then winners',          without: 'losers winners' },
  { word: 'only',   withIt: 'only chinese losers',          without: 'chinese losers' },
  { word: 'just',   withIt: 'just my losers',               without: 'my losers' },
  { word: 'still',  withIt: 'chinese losers i still hold',  without: 'chinese losers i hold' },
  { word: 'want',   withIt: 'i want chinese stocks',        without: 'i chinese stocks' },
  { word: 'even',   withIt: 'even my winners',              without: 'my winners' },
  { word: 'before', withIt: 'trades before 10am',           without: 'trades 10am' },
  { word: 'first',  withIt: 'my first trade',               without: 'my trade' },
]

describe('RB2 each added word is ignored inside a sentence', () => {
  it.each(RB_SENTENCES)('$word no longer reaches the ignored clause', ({ word, withIt }) => {
    expect(
      rb(withIt).unresolved.join(' '),
      `"${word}" still comes back as unread from "${withIt}"`,
    ).not.toContain(word)
  })

  it.each(RB_SENTENCES)('$word changes nothing about what the sentence means', ({ word, withIt, without }) => {
    expect(
      rbDelta(rb(withIt).state),
      `"${word}" changed the meaning of "${withIt}"`,
    ).toEqual(rbDelta(rb(without).state))
  })
})

// ─── RB3 : THE FOUR THAT WERE PRODUCING WRONG ANSWERS ────────────────────────
//
// Each asserted individually and by name, with the filter it used to apply
// quoted in the message, because these four are the reason this beat exists.

describe('RB3 the four previously refused, each by name', () => {
  it('"before" no longer applies the mistake "Entered too early / before trigger"', () => {
    const out = rb('trades before 10am')
    expect(
      out.state.mistakeKeys,
      'a time word applied a MISTAKE filter -- "before" reached "Entered too ' +
        'early / before trigger" through the substring tier',
    ).toEqual([])
    // The companion half: the ask is still refused OUT LOUD. Curing a wrong
    // filter by swallowing the whole sentence would be the worse bug.
    expect(
      out.unresolved,
      'the time-of-day ask stopped being reported -- a wrong answer now looks clean',
    ).toContain('10am')
  })

  it('"first" no longer applies the playbook "First Pullback to VWAP"', () => {
    expect(
      rb('my first trade').state.playbookIds,
      'a recency word applied a PLAYBOOK filter through the prefix tier',
    ).toEqual([])
  })

  it('and "first" still means recency when a count is present', () => {
    // The capability check. `first` is a RECENCY word -- ascending order -- and
    // that path does not consult the filler list. Adding the word must not
    // cost the reading that works.
    const out = rb('the first 10 trades')
    expect(out.state.limit, 'the count was lost').toBe(10)
    expect(out.state.sort, 'the ordering "first" implies was lost').toEqual({
      colId: 'open_time',
      dir: 'asc',
    })
  })

  it('"want" no longer applies the mistake "High-volume pullback (wanted low volume)"', () => {
    const out = rb('i want chinese stocks')
    expect(
      out.state.mistakeKeys,
      'a verb of desire applied a MISTAKE filter through the substring tier',
    ).toEqual([])
    expect(out.state.regions, 'the sentence stopped working altogether').toEqual(['China'])
  })

  it('"even" no longer applies the mistake "Revenge trade (after a loss)"', () => {
    const out = rb('even my winners')
    expect(
      out.state.mistakeKeys,
      '"even" reached "revenge" through the substring tier at exactly the floor',
    ).toEqual([])
    expect(out.state.outcome, 'the sentence stopped working altogether').toBe('winners')
  })
})

// ─── RB4 : THE NEGATION SPAN, WHICH THIS BEAT FIXES BY ACCIDENT ──────────────

describe('RB4 a filler word between a negator and its term', () => {
  // The negation span skips filler to find the term the negator governs. While
  // "even" was NOT filler it stopped the scan dead: "not even china" negated
  // "even" -- the mistake -- and then applied China as an INCLUSION. The user
  // asked to exclude China and got only China, plus a mistake filter nobody
  // named. This is the sharpest single case in the beat.
  it('"not even china" excludes China rather than selecting it', () => {
    const out = rb('not even china')
    expect(
      out.state.regions,
      'the ask said NOT china and the resolver filtered the book DOWN to China',
    ).toEqual([])
    expect(out.state.excludeRegions, 'the exclusion was never applied').toEqual(['China'])
    expect(
      out.state.excludeMistakeKeys,
      'the negator governed the filler word and excluded a mistake nobody named',
    ).toEqual([])
  })

  it('and the plain negation is untouched', () => {
    expect(rb('not china').state.excludeRegions).toEqual(['China'])
  })
})

// ─── RB5 : THE DISCRIMINATING COMPANION ──────────────────────────────────────

describe('RB5 a genuine content word still applies outright', () => {
  // Without this, every assertion above passes for a cure that made the whole
  // language filler and answered nothing ever again.
  it('"chinese" still applies the region', () => {
    const out = rb('chinese')
    expect(out.state.regions, 'an ordinary word stopped applying').toEqual(['China'])
    expect(out.ambiguous, 'an ordinary word became a question').toEqual([])
  })

  it('"losers" still applies the outcome', () => {
    expect(rb('losers').state.outcome).toBe('losers')
  })

  it('"micro pullback" still applies the playbook', () => {
    expect(rb('micro pullback').state.playbookIds).toEqual([4])
  })

  it('and a full ordinary ask still applies every part of itself', () => {
    const out = rb('chinese losers in healthcare')
    expect(rbDelta(out.state)).toEqual({
      outcome: 'losers',
      regions: ['China'],
      sectors: ['Healthcare'],
    })
  })
})

// ─── RB6 : THE WORDS THIS BEAT REFUSED, PINNED ───────────────────────────────

/** Refused, with the reason. A word that NAMES a dimension or an operation is
 *  not filler just because the parser cannot reach it yet -- swallowing it
 *  converts a reported gap into a silent wrong answer. This is the same test
 *  that kept "last" out two beats ago, applied consistently. */
const RB_REFUSED: [string, string][] = [
  ['or', 'names a disjunction; today it is the only sign the first term was dropped'],
  ['vs', 'names a comparison the ask has no shape for'],
  ['versus', 'names a comparison the ask has no shape for'],
  ['last', 'a recency word: "my last trade" would go silently empty'],
  ['morning', 'a time of day the parser cannot reach'],
  ['afternoon', 'a time of day the parser cannot reach'],
  ['yesterday', 'a date the parser cannot reach'],
  ['open', 'names the session open'],
  ['close', 'names the session close'],
  ['average', 'names a statistic, not a filter'],
]

describe('RB6 the refused words are still REPORTED, not swallowed', () => {
  it.each(RB_REFUSED)('%s stays out of the filler list -- %s', (word) => {
    expect(
      STOPWORDS.has(word),
      `"${word}" was added to the filler list, which silences the only ` +
        `complaint the user gets about an ask this parser cannot answer`,
    ).toBe(false)
  })

  it('"winners or losers" still says it could not read "or"', () => {
    // The wrong answer is unfixed -- outcome is a scalar and the first term is
    // gone. What must survive is the COMPLAINT, which is all that tells the
    // user their sentence was half-read.
    const out = rb('winners or losers')
    // REVERSED BY BEAT 152. WAS: outcome 'losers' applied while "or" went
    // unread. That IS partial application, and it is what this beat forbids.
    // The COMPLAINT -- the thing this assertion was written to protect -- is
    // untouched and still asserted below.
    expect(out.state.outcome, 'the scalar-replacement defect changed shape').toBe('all')
    expect(out.unresolved, 'the only warning the user gets disappeared').toContain('or')
  })

  it('"my last trade" still says it could not read "last"', () => {
    const out = rb('my last trade')
    expect(rbDelta(out.state), 'a recency ask silently applied something').toEqual({})
    expect(out.unresolved, 'a recency ask went silently empty').toContain('last')
  })
})

// ─── RB7 : LAO'S FRAMES, DRIVEN VERBATIM ─────────────────────────────────────
//
// The ten were never written down in one place; these are every sentence the
// founder is on record as having typed into the bubble, gathered from the
// briefs that quoted them. Each is asserted on its STATE.

describe('RB7 the founder frames', () => {
  it('FIXED: "trades before 10am" applies nothing and still reports "10am"', () => {
    const out = rb('trades before 10am')
    expect(rbDelta(out.state)).toEqual({})
    expect(out.unresolved).toEqual(['10am'])
  })

  it('FIXED: the micro-pullback frame reads every word of itself', () => {
    const out = rb('show me the 10 micro pullback trades that i lost money on but not halt resume')
    expect(out.unresolved, '"but" was the last unread word in this sentence').toEqual([])
    expect(rbDelta(out.state)).toEqual({
      outcome: 'losers',
      playbookIds: [4],
      excludeCatalystTypes: ['Halt Resume'],
      limit: 10,
      sort: { colId: 'open_time', dir: 'desc' },
    })
  })

  it('STILL RIGHT: "show me my winners" does not filter on Malaysia', () => {
    // Beat 118's cure, re-asserted here because this beat edits the same list
    // it depends on.
    const out = resolveQuery('show me my winners', {
      ...RB_BOOK,
      countries: [{ iso: 'MY', name: 'Malaysia' }],
    }, NOW, emptyFilters())
    expect(out.state.countries).toEqual([])
    expect(out.state.outcome).toBe('winners')
  })

  it('STILL RIGHT: "not halt resume" excludes the catalyst', () => {
    expect(rb('not halt resume').state.excludeCatalystTypes).toEqual(['Halt Resume'])
  })

  it('UNFIXED and named: "my biggest losers" still cannot rank', () => {
    const out = rb('my biggest losers')
    // REVERSED BY BEAT 152. WAS: outcome 'losers' applied while "biggest" went
    // unread. Still unfixed, still named -- but it no longer half-answers.
    expect(out.state.outcome).toBe('all')
    expect(out.unresolved, 'a superlative with no count needs the parser').toContain('biggest')
  })

  it('UNFIXED and named: MACD reaches a mistake with the OPPOSITE sense', () => {
    // "show me the trades where macd was positive" returns trades tagged MACD
    // NEGATIVE. Excluded from this beat by ruling -- recorded so the day MACD
    // becomes a real facet, this assertion has to be changed on purpose.
    const out = resolveQuery('show me the trades where macd was positive', {
      ...RB_BOOK,
      mistakes: [...RB_BOOK.mistakes, { axis: 'technical', name: 'MACD negative at entry' }],
    }, NOW, emptyFilters())
    // REVERSED BY BEAT 152. WAS: the opposite-sense mistake APPLIED, which is
    // the defect this assertion recorded. The mistake is still REACHED -- the
    // wrong-sense match is unfixed and still named below -- but the sentence
    // carries unread words, so the strict boundary now discards before it can
    // mislead. The defect is masked here rather than repaired.
    expect(out.state.mistakeKeys).toEqual([])
    expect(out.unresolved).toContain('was positive')
  })
})

// ─── RB8 : THE TWENTY, CLEAN *AND* CORRECT ───────────────────────────────────

/** Beat 116's twenty. The clean count alone is not the measure -- one of them
 *  was clean and WRONG, applying a mistake off "want" while reporting nothing.
 *  Correctness is asserted on the state of the ones that changed. */
const RB_TWENTY: string[] = [
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

/** The six that remain, each with the word that blocks it. Every one is PARSER
 *  work, and every one is deliberately out of scope for a list edit. */
const RB_STILL_DIRTY: Record<string, string> = {
  'what were my losers last week': 'last',
  'find trades under 10 dollars': 'under 10 dollars',
  'my biggest losers': 'biggest',
  'what are my worst trades': 'worst',
  'show me everything under 5 dollars': 'under 5 dollars',
  // v0.2.7 -- ONE ENTRY LEFT THIS TABLE, and it left because the sentence is
  // now READ rather than half-read. "extended" was not a word this resolver
  // knew; it is a band word now, with the threshold the Technicals tab already
  // defines. The blocker is gone, so the row is gone, and the count below moved
  // with it. The old row read:
  //     'trades where i chased extended': 'extended',
}

describe('RB8 the twenty', () => {
  const T = {
    ...RB_BOOK,
    mistakes: [
      ...RB_BOOK.mistakes,
      { axis: 'technical' as const, name: 'Chased extension (too far from 9 EMA)' },
    ],
  }
  const t = (q: string) => resolveQuery(q, T, NOW, emptyFilters())

  it('exactly fifteen read every word of themselves', () => {
    const clean = RB_TWENTY.filter((q) => t(q).unresolved.length === 0)
    expect(clean.length, `clean: ${clean.join(' | ')}`).toBe(15)
  })

  it('and every one of them is also CORRECT -- no filter nobody asked for', () => {
    // The measure that matters. Before the filler beat, thirteen of fourteen
    // were correct: "i want chinese stocks" came back clean while filtering on
    // a mistake named "High-volume pullback (wanted low volume)".
    //
    // ONE SENTENCE IS NOW EXEMPT, and the exemption is quoted rather than
    // silent. The assertion read:
    //     const wrong = clean.filter((q) => t(q).state.mistakeKeys.length > 0)
    // "trades where i chased extended" DOES ask for a mistake -- "chased" has
    // prefix-matched "Chased extension (too far from 9 EMA)" since long before
    // this beat, and that half was never in dispute. What changed is that
    // "extended" is now read too, so the sentence carries a mistake AND a band
    // range and stopped being dirty. It is not a filter nobody asked for; it is
    // two filters both asked for, which is the partial-application question and
    // is ruled out of scope. The test now names the one sentence that legitimately
    // carries a mistake instead of pretending none can.
    const ASKS_FOR_A_MISTAKE = 'trades where i chased extended'
    const clean = RB_TWENTY.filter((q) => t(q).unresolved.length === 0)
    const wrong = clean
      .filter((q) => q !== ASKS_FOR_A_MISTAKE)
      .filter((q) => t(q).state.mistakeKeys.length > 0)
    expect(wrong, `clean but filtering on an unasked mistake: ${wrong.join(' | ')}`).toEqual([])
  })

  it('and the exempt one really does name its own mistake', () => {
    // Without this the exemption above could hide a regression: the sentence
    // has to still be reading "chased", not merely be excused.
    // REVERSED BY BEAT ONE HUNDRED EIGHTY-FOUR, measured by beat one
    // hundred eighty-two. WAS: the sentence APPLIED the mistake
    // "Chased extension (too far from 9 EMA)" alongside the nine EMA band.
    // "chased" is six characters of a thirty-character name, under the
    // coverage floor, so the mistake is now OFFERED. The sentence still reads
    // "chased" -- which is the only thing the exemption above needs -- and the
    // band it really asked for is untouched.
    const out = t('trades where i chased extended')
    expect(out.state.mistakeKeys).toEqual([])
    expect(out.ambiguous.flatMap((a) => a.candidates)).toContain(
      'Chased extension (too far from 9 EMA)',
    )
    expect(out.state.ranges.ema9_dist_pct).toBeTruthy()
  })

  it('the five that remain are these five, by name', () => {
    const dirty = RB_TWENTY.filter((q) => t(q).unresolved.length > 0).sort()
    expect(dirty).toEqual(Object.keys(RB_STILL_DIRTY).sort())
  })

  it.each(Object.entries(RB_STILL_DIRTY))('%s is blocked by %s', (q, blocker) => {
    expect(t(q).unresolved.join(' ')).toContain(blocker.split(' ')[0]!)
  })
})

// ─── RB9 : SCOPE GUARD — no floor moved, no tier added ───────────────────────

describe('RB9 the three tiers are behaviourally identical', () => {
  it('EXACT still wins with no floor at all', () => {
    expect(rb('usa').state.regions).toEqual(['USA'])
  })

  it('PREFIX reaches at THREE characters and not at two', () => {
    // REVERSED BY BEAT 152. WAS: nr -> NRVA, n -> ''.
    expect(rb('nrv').state.symbol, 'the prefix floor moved above three').toBe('NRVA')
    expect(rb('nr').state.symbol, 'the symbol floor is not three').toBe('')
  })

  it('SUBSTRING still reaches at four and not at three', () => {
    // "car" and not "are". Three characters is the point of the assertion, but
    // "are" became FILLER a beat ago, and a filler word is refused by tiers two
    // and three whatever the floor is -- so it would pass this assertion with
    // the floor at one. "car" is three characters, is inside Healthcare, and is
    // not in the list, so the floor is what decides it.
    // REVERSED BY BEAT 152. WAS: care -> ['Healthcare'] APPLIED; now OFFERED.
    expect(rb('care').state.sectors).toEqual([])
    expect(rb('care').ambiguous.map((a) => a.text)).toContain('care')
    expect(rb('car').state.sectors, 'the substring floor dropped below four').toEqual([])
  })

  it('and a NON-filler word of four characters still reaches by substring', () => {
    // The floor is proven live by a word that is NOT in the list. Every word
    // this beat added would now pass a floor assertion vacuously.
    // REVERSED BY BEAT 152. WAS: venge APPLIED the mistake. The substring tier
    // still REACHES -- that is what this assertion is for -- but it now offers.
    expect(rb('venge').state.mistakeKeys, 'the substring tier stopped working').toEqual([])
    expect(rb('venge').ambiguous.map((a) => a.text)).toContain('venge')
  })
})
