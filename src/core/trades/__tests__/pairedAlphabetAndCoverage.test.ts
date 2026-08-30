// v0.2.7 — ONE ALPHABET ON BOTH SIDES, AND A RESEMBLANCE MUST EARN THE APPLY.
//
// TWO RULES THAT DO NOT SHIP APART, and beats one hundred eighty-one and one
// hundred eighty-two measured why.
//
//   THE COVERAGE RULE. A single token reaching a many-word entry on a fuzzy
//   tier is a guess. "traded" is under a quarter of "Traded on tilt - didn't
//   walk away" and reached it as a whole word at the front, so no boundary rule
//   could ever have caught it: beat one hundred eighty-one measured boundary at
//   the start, boundary at both ends, and whole-word-in-the-entry, and all
//   three fixed ZERO of the three named defects. What separates a word that
//   means what it reached from one that does not is HOW MUCH OF THE ENTRY IT
//   COVERS. Below the floor the resolver ASKS instead of answering.
//
//   THE ALPHABET. candidatesFor compared the tokenised ask, punctuation already
//   stripped, against the RAW user-authored key. For a name written with a
//   slash, a bracket or an ampersand those two strings cannot be made equal.
//   One hundred twenty-seven entry names across three books could not be
//   reached by their own full name.
//
// THEY DO NOT SHIP APART because each one alone makes the product worse. The
// coverage rule alone took twenty-nine entry names down with it -- typing a
// mistake's own stored name stopped working, because that name was only ever
// resolving on its FIRST TOKEN by prefix, which is the same defect wearing a
// respectable coat. The alphabet alone leaves every silent wrong in place: on
// the founder's own sentence it still answers zero while carrying a mistake tag
// nobody asked for.
//
// THE ONE THING A PROTOTYPE GOT WRONG, PINNED HERE FOREVER. Beat one hundred
// eighty-two's first build normalised the tiers inside candidatesFor and left
// the CALLER recomputing the tier against the raw key. Every newly reached name
// was then classed a substring hit and OFFERED rather than applied, so the cure
// silently became a question. RP8 fails if either side is changed alone.

import { describe, expect, it } from 'vitest'
import { COVERAGE_FLOOR, resolveQuery, type ResolverVocabulary } from '../queryResolver'
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

/** EVERY NAME HERE SHARES ITS FIRST TOKEN WITH ANOTHER NAME. That is
 *  deliberate: a book where first tokens are unique cannot tell the difference
 *  between reaching a name and reaching its first word, and a guard that cannot
 *  tell the difference is not a guard. */
const BOOK = vocab({
  industries: [
    'Medical - Devices',
    'Medical - Care Facilities',
    'Rental & Leasing Services',
    'Rental Property Management',
    'Oil & Gas Equipment & Services',
    'Oil Refining',
  ],
  catalystTypes: ['FDA / Clinical', 'FDA Warning Letter'],
  mistakes: [
    mistake('Greed - held too long / moved target'),
    mistake('Greed check skipped'),
    mistake('Greedy'),
    mistake('Cut winner too early (fear)'),
    mistake('Cut position in half'),
    mistake("Traded on tilt - didn't walk away"),
    mistake('Overtrading Spiral'),
  ],
})

const r = (q: string) => resolveQuery(q, BOOK, NOW, emptyFilters())
const applied = (q: string) => r(q).applied.join(' | ')
const chips = (q: string) => r(q).ambiguous.flatMap((a) => a.candidates)

describe('RP1 a name longer than three tokens reaches itself', () => {
  it('six tokens, typed as the trader stores it', () => {
    expect(applied('Greed - held too long / moved target')).toBe(
      'mistake Greed - held too long / moved target',
    )
  })
  it('and typed naturally, punctuation omitted', () => {
    expect(applied('Greed held too long moved target')).toBe(
      'mistake Greed - held too long / moved target',
    )
  })
})

describe('RP2 a name carrying a slash reaches itself', () => {
  it('as stored, slash and all', () => {
    expect(applied('FDA / Clinical')).toBe('catalyst FDA / Clinical')
  })
  it('and with the slash dropped', () => {
    expect(applied('FDA Clinical')).toBe('catalyst FDA / Clinical')
  })
})

describe('RP3 a name carrying parentheses reaches itself', () => {
  it('as stored, brackets and all', () => {
    expect(applied('Cut winner too early (fear)')).toBe('mistake Cut winner too early (fear)')
  })
  it('and with the brackets dropped', () => {
    expect(applied('Cut winner too early fear')).toBe('mistake Cut winner too early (fear)')
  })
})

describe('RP4 a name carrying an ampersand reaches itself, typed either way', () => {
  it('as stored, with the ampersand', () => {
    expect(applied('Rental & Leasing Services')).toBe('industry Rental & Leasing Services')
  })
  it('and spoken, with the word and', () => {
    expect(applied('Rental and Leasing Services')).toBe('industry Rental & Leasing Services')
  })
  it('two ampersands, spoken', () => {
    expect(applied('Oil and Gas Equipment and Services')).toBe(
      'industry Oil & Gas Equipment & Services',
    )
  })
})

describe('RP5 a single token below the coverage floor ASKS, it does not answer', () => {
  it('"traded" offers its mistake instead of applying it', () => {
    expect(applied('traded')).toBe('')
    expect(chips('traded')).toContain("Traded on tilt - didn't walk away")
  })
  it('"greed" offers instead of applying', () => {
    expect(applied('greed')).toBe('')
    expect(chips('greed')).toContain('Greed - held too long / moved target')
  })
  it('"cut" offers instead of applying', () => {
    expect(applied('cut')).toBe('')
  })
})

describe('RP6 a single token AT or ABOVE the floor still applies', () => {
  it('"greedy" is most of "Greedy" and still answers', () => {
    expect(applied('greedy')).toBe('mistake Greedy')
  })
  it('"overtrading" is most of "Overtrading Spiral" and still answers', () => {
    // A PREFIX hit, which is the tier the coverage rule gates. A SUBSTRING hit
    // has asked rather than answered since long before this rule and is not
    // what RP6 is about.
    expect(applied('overtrading')).toBe('mistake Overtrading Spiral')
  })
})

describe('RP7 the coverage floor is a named exported constant', () => {
  it('and it is three tenths', () => {
    expect(COVERAGE_FLOOR).toBe(0.3)
  })
  it('a token below it and one above it fall on opposite sides', () => {
    // "traded" is six of twenty-six alphanumeric characters, under the floor.
    // "overtrading" is eleven of seventeen, over it. If the constant moves,
    // one of these two changes side and the pair cannot both hold.
    expect(applied('traded')).toBe('')
    expect(applied('overtrading')).toBe('mistake Overtrading Spiral')
  })
})

describe('RP8 the caller and candidatesFor judge in the SAME alphabet', () => {
  // THE DEFECT THIS PINS. If candidatesFor is normalised and the caller is not,
  // a punctuated name is FOUND and then classed a substring hit, so it is
  // offered rather than applied. The row count never changes, the response
  // still names something, and only this shape of assertion catches it.
  it('a punctuated name APPLIES rather than merely being offered', () => {
    expect(applied('Rental & Leasing Services')).toBe('industry Rental & Leasing Services')
    expect(chips('Rental & Leasing Services')).toEqual([])
  })
  it('and so does a long one typed naturally', () => {
    expect(applied('Greed held too long moved target')).toBe(
      'mistake Greed - held too long / moved target',
    )
    expect(chips('Greed held too long moved target')).toEqual([])
  })
})

describe('RP9 the founder sentence resolves without the mistake nobody asked for', () => {
  // THE ROW COUNTS LIVE WHERE THE BOOKS ARE, not here: this suite has no
  // trades, so it pins the STATE the sentence resolves to. Seventeen on the
  // five hundred twenty-eight book and one on the human book are driven in the
  // harness and recorded in the beat.
  const SENTENCE =
    'stocks i have traded that i have won price 2 to 10 float under 1000000'
  const WITHOUT = 'won price 2 to 10 float under 1000000'
  it('"traded" no longer applies a mistake inside the sentence', () => {
    expect(r(SENTENCE).applied.some((a) => a.startsWith('mistake'))).toBe(false)
  })
  it('and the sentence agrees with the same sentence without the word', () => {
    expect(r(SENTENCE).applied).toEqual(r(WITHOUT).applied)
  })
})
