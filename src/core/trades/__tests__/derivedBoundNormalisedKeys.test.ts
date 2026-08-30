// v0.2.7 — THE BOUND IS THE BOOK'S, AND THE TWO SIDES SPEAK ONE ALPHABET.
//
// TWO INDEPENDENT CONSTRAINTS kept user-authored names unreachable, and each
// one alone was enough to keep them so. Beats one hundred sixty-five and one
// hundred sixty-six measured them separately, each time by removing only one:
//
//   THE BOUND. The span reservation probed three tokens and two. A trader who
//   names a mistake in six words has a name the reservation cannot construct,
//   so the phrase is never compared to anything. Raising the bound ALONE moved
//   nothing measurable, because of:
//
//   THE ALPHABET. vocabKeys holds the RAW lowercased name, punctuation intact,
//   while every reader compares it against TOKENISED text, which has had its
//   punctuation stripped. For a name written with a slash, a dash or a bracket
//   the two strings are not merely unequal -- they cannot be made equal.
//   Fixing the alphabet ALONE moved four asks, all of them short names.
//
// TOGETHER they move eleven of the twelve measured captures, every one of them
// to a CORRECT answer rather than to a refusal, at a measured price of nothing:
// no correct answer became a refusal, no new silent wrong appeared, and four
// hundred five ordinary sentences did not move a byte on any of three books.
//
// THE BOUND IS DERIVED, NEVER WRITTEN DOWN. It is the longest key in THIS
// BOOK'S own vocabulary. A trader who names a setup in eight words raises it; a
// book of two-word names leaves it at two and the scan does no more work than
// it did before. A literal here would be a number that happens to fit the books
// that were measured, which is not the same thing as being right -- so RK-D3
// pins an EIGHT token name, which no literal drawn from those books would pass.
//
// SINGLE TOKENS STILL NEVER RESERVE. RK4 is untouched and is asserted here as
// well as in spanReservation, because the sequence now descends from a derived
// number and a reader must be able to see where it stops.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { emptyFilters } from '../tradesFilter'

const NOW = new Date('2026-06-15T15:00:00')

const vocab = (over: Partial<ResolverVocabulary>): ResolverVocabulary =>
  ({
    symbols: [],
    regions: [],
    countries: [],
    sectors: [],
    industries: [],
    playbooks: [],
    catalystTypes: [],
    mistakes: [],
    ...over,
  }) as unknown as ResolverVocabulary

const mistake = (name: string) =>
  ({ axis: 'psychological', name }) as unknown as ResolverVocabulary['mistakes'][number]

/** The long book: every name that the two constraints kept unreachable, as the
 *  three measured books actually store them -- slashes, brackets and all. */
const LONG_BOOK = vocab({
  regions: ['Other'],
  playbooks: [{ id: 1, name: 'Micro Pullback', tier: null }],
  catalystTypes: ['Partnership / Contract', 'Technical / No Catalyst', 'Other'],
  mistakes: [
    mistake('Cut winner too early (fear)'),
    mistake('Greed - held too long / moved target'),
    mistake('Chased extension (too far from 9 EMA)'),
    mistake('Hold-and-hope (held a loser too long)'),
    mistake('Added to a loser / averaged down'),
    mistake('Averaged down'),
  ],
})

/** A book of its OWN for the eight token probe. It is kept apart deliberately:
 *  dropped into the long book, "held a loser far too long after bell" shares a
 *  sub-span with "Hold-and-hope (held a loser too long)" and both entries then
 *  apply -- a collision manufactured by the fixture, not by the resolver. The
 *  real books carry no such pair, and a guard that had been relaxed to swallow
 *  one would have stopped measuring what it was written to measure. */
const EIGHT_BOOK = vocab({
  mistakes: [mistake('held a loser far too long after bell')],
})

/** The short book: the SAME functional words are reachable, but the longest key
 *  is two tokens. Its bound is therefore two, and a six token span reserves
 *  nothing at all. Same ask, different book, different answer -- which is what
 *  makes the bound the BOOK'S and not the code's. */
const SHORT_BOOK = vocab({
  playbooks: [{ id: 1, name: 'Micro Pullback', tier: null }],
  countries: [{ iso: 'MY', name: 'Malaysia' }],
})

/** A book carrying a ONE WORD entry that is ALSO a functional word. This is the
 *  Malaysia argument made observable: if a single token could reserve, "long"
 *  would be withheld from the state pass and the side would never be set. */
const COLLIDING_BOOK = vocab({
  playbooks: [{ id: 1, name: 'Long', tier: null }],
})

const r = (text: string, book: ResolverVocabulary = LONG_BOOK) =>
  resolveQuery(text, book, NOW, emptyFilters())

const applied = (text: string, book?: ResolverVocabulary) =>
  r(text, book).applied.join(' | ')

/** mistakeKeys carries {axis, name} pairs; every assertion here is about
 *  WHICH ENTRY was reached, so the names are what get compared. */
const mistakeNames = (text: string, book?: ResolverVocabulary) =>
  r(text, book).state.mistakeKeys.map((k) => k.name)

describe('RK-D1 a name carrying a slash reaches its entry, typed either way', () => {
  it('as the trader stores it, slash and all', () => {
    const res = r('partnership / contract')
    expect(res.state.catalystTypes).toEqual(['Partnership / Contract'])
    expect(applied('partnership / contract')).toBe('catalyst Partnership / Contract')
  })

  it('typed naturally, the slash simply not typed', () => {
    const res = r('partnership contract')
    expect(res.state.catalystTypes).toEqual(['Partnership / Contract'])
    expect(applied('partnership contract')).toBe('catalyst Partnership / Contract')
  })
})

describe('RK-D2 a name carrying brackets reaches its entry, typed either way', () => {
  it('as the trader stores it, brackets and all', () => {
    expect(mistakeNames('cut winner too early (fear)')).toEqual(['Cut winner too early (fear)'])
    expect(applied('cut winner too early (fear)')).toBe('mistake Cut winner too early (fear)')
  })

  it('typed naturally, the brackets simply not typed', () => {
    expect(mistakeNames('cut winner too early fear')).toEqual(['Cut winner too early (fear)'])
    expect(applied('cut winner too early fear')).toBe('mistake Cut winner too early (fear)')
  })
})

describe('RK-D3 the bound is the BOOK\'S longest key, not a number in the source', () => {
  it('a six token name wins over the side word inside it', () => {
    const res = r('greed held too long moved target')
    expect(mistakeNames('greed held too long moved target')).toEqual(['Greed - held too long / moved target'])
    expect(res.state.side).toBe('all')
    expect(applied('greed held too long moved target'))
      .toBe('mistake Greed - held too long / moved target')
  })

  it('THE SAME ASK on a book whose longest key is two tokens reaches nothing', () => {
    // The discriminating pair: the ask above and this one are the SAME STRING.
    // On a book that carries the six token name it resolves to that entry; on a
    // book whose longest key is two tokens there is nothing for a long span to
    // equal, and the whole ask comes back unread and unapplied. That difference
    // is the bound being the BOOK'S rather than the code's.
    //
    // NOT asserted here: that "long" becomes a side. It does not, and measuring
    // said so before this was written -- the word sits inside an unresolved run
    // and beat one hundred thirty-three's boundary discards the run entire.
    const res = r('greed held too long moved target', SHORT_BOOK)
    expect(mistakeNames('greed held too long moved target', SHORT_BOOK)).toEqual([])
    expect(res.applied).toEqual([])
    expect(res.unresolved.length).toBeGreaterThan(0)
  })

  it('an EIGHT token name still wins, which no literal from the measured books would allow', () => {
    const res = r('held a loser far too long after bell', EIGHT_BOOK)
    expect(mistakeNames('held a loser far too long after bell', EIGHT_BOOK))
      .toEqual(['held a loser far too long after bell'])
    expect(res.state.side).toBe('all')
    expect(res.state.outcome).toBe('all')
  })
})

describe('RK-D4 single tokens NEVER reserve -- RK4 stands under a derived bound', () => {
  it('a one word ask cannot reserve, and the country still resolves as a country', () => {
    const res = r('my', SHORT_BOOK)
    expect(mistakeNames('my', SHORT_BOOK)).toEqual([])
    expect(res.state.playbookIds).toEqual([])
  })

  it('a ONE WORD entry does not withhold its word from the state pass', () => {
    // ADDED AFTER THE RED PHASE, and it was green the moment it was written --
    // which is exactly why it is here. The first assertion in this block cannot
    // tell a reserving single token from a non-reserving one: a country resolves
    // the same either way. This one can. A playbook named "Long" is a one word
    // entry that collides with a side word, and the side must still win, because
    // the span sequence stops above one. It is proven live by the third plant,
    // not by the red phase, and saying so is the point of the note.
    const res = r('long trades', COLLIDING_BOOK)
    expect(res.state.side).toBe('long')
    expect(res.state.playbookIds).toEqual([])
  })
})

describe('RK-D5 the measured conversions, pinned as literals', () => {
  it('the nine EMA mistake no longer takes its own nine for a row count', () => {
    const res = r('chased extension too far from 9 ema')
    expect(mistakeNames('chased extension too far from 9 ema')).toEqual(['Chased extension (too far from 9 EMA)'])
    expect(res.state.limit).toBeNull()
    expect(applied('chased extension too far from 9 ema'))
      .toBe('mistake Chased extension (too far from 9 EMA)')
  })

  it('the hold-and-hope mistake no longer filters the book to losers', () => {
    const res = r('Hold-and-hope (held a loser too long)')
    expect(mistakeNames('Hold-and-hope (held a loser too long)')).toEqual(['Hold-and-hope (held a loser too long)'])
    expect(res.state.outcome).toBe('all')
  })

  it('the greed mistake no longer filters the book to longs', () => {
    const res = r('Greed - held too long / moved target')
    expect(mistakeNames('Greed - held too long / moved target')).toEqual(['Greed - held too long / moved target'])
    expect(res.state.side).toBe('all')
  })
})

// ---------------------------------------------------------------------------
// RK-D6 -- WHAT IS STILL WRONG, PINNED SO A LATER BEAT SEES IT CHANGE.
//
// These two are NOT fixed by the bound or by the alphabet, and pretending
// otherwise by leaving them unasserted is how a known defect becomes a
// forgotten one. Both were measured on real books and both survive this cure.
// A future beat that fixes either will find these tests red, which is the
// notification this file exists to give.
// ---------------------------------------------------------------------------
describe('RK-D6 the two defects this cure does NOT reach', () => {
  it('a name wholly containing another name now applies the LONGER one alone', () => {
    // REVERSED BY BEAT ONE HUNDRED EIGHTY-FOUR. WAS: BOTH names applied --
    // "Averaged down" is a live entry in its own right AND a tail of "Added to
    // a loser / averaged down", and two mistake filters landed where one was
    // asked.
    //
    // THIS GUARD DID ITS JOB BY FAILING. Beat one hundred sixty-seven wrote it
    // to pin a defect that cure could not reach, so that a later beat would
    // find it red rather than forget it. Once both sides speak one alphabet
    // the whole six-token name matches on the EXACT tier, the longest span
    // wins, and the tail never gets its turn.
    const res = r('Added to a loser / averaged down')
    expect(mistakeNames('Added to a loser / averaged down')).toEqual([
      'Added to a loser / averaged down',
    ])
    expect(res.state.outcome).toBe('all')
  })

  it('a word carried by two kinds still resolves to the wrong kind, silently', () => {
    // Measured on the largest book: "Other" is BOTH a region and a catalyst.
    // A single token cannot reserve, so nothing here changes, and the region
    // wins on kind order with no sign to the reader that a choice was made.
    const res = r('other')
    expect(res.state.regions).toEqual(['Other'])
    expect(res.state.catalystTypes).toEqual([])
  })
})
