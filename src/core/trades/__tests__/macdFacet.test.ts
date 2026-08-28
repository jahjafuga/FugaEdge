// v0.2.7 — MACD BECOMES A FACET.
//
// THE DEFECT WAS NOT AN INVERSION, IT WAS AN EMPTY BOOK. "macd positive"
// applied the mistake "MACD negative at entry" -- the wrong sense, which is bad
// enough -- and that mistake is tagged on ZERO trades of both books. So the ask
// returned nothing, with a clean applied line and an empty ignored clause. The
// trader asked for forty-six trades on one book and eighty-three on the other
// and got none, and nothing on screen said so.
//
// THE SHAPE IS A CATEGORICAL LIST, and the reason is the null member. Four
// hundred and thirty-nine of five hundred and twenty-eight trades have no
// computed MACD at all. The array machinery's null is ALREADY the documented
// untagged bucket -- "matched explicitly so it can never collide with a real
// value" -- so "not computed" is a value the user can name and see. A boolean
// cannot say unknown at all, and a range would need the parser to turn
// "positive" into greater-than-zero and could never express open or rising.
// The exclude twin comes free with the pattern.
//
// TWO-WORD VALUES, AND THAT IS MEASURED RATHER THAN CHOSEN. A single entry
// keyed "macd" loses "macd negative" to the mistake: the two-word span is a
// PREFIX of "macd negative at entry" and longer spans are tried first. Keyed as
// pairs, both resolve at tier one and beat the mistake outright, and a bare
// "macd" offers the choice instead of guessing. Re-proven at HEAD before any
// code, because the pass order moved four beats after the first proof.
//
// ONE MINUTE, SAID OUT LOUD. Both existing technicals row fields are
// one-minute; that is the precedent. The two timeframes disagree on
// forty-seven per cent of demo trades, so the answer names which one it used.
//
// THE POSITIVE AXIS ONLY. Open and rising are separate facets and the
// two-by-two grid is NOT applied silently -- the user asked one axis.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { applyTradesFilters, emptyFilters, MACD_STATE_CHOICES } from '../tradesFilter'
import type { TradeListRow } from '@shared/trades-types'

const NOW = new Date('2026-08-22T15:00:00')

/** The three states the page supplies, and the mistake that used to win.
 *  The mistake is deliberately present: a facet that only works on a book
 *  without it would prove nothing about the books that have it. */
// READ FROM THE SHIPPED CONSTANT, not copied. A plant that deleted the null
// member from MACD_STATE_CHOICES left this file entirely green while the panel
// and the page lost the bucket -- the guard was testing a copy of the answer.
// Reading the real list is what makes the deletion visible here.
const MACD_STATES = MACD_STATE_CHOICES.map((c) => ({
  key: c.key,
  display: c.display,
  value: c.value,
}))

// "MACD NOT COMPUTED" IS NOT A KEY, and the reason is measured. "not" is a
// NEGATOR, so that phrase makes the negation mask fire: it governs "computed",
// leaves "macd" to be offered on its own, and the ask splits in half. The
// DISPLAY matters just as much -- an offer is taken by substituting the
// candidate back into the sentence, so a display the resolver cannot read
// would loop, which is the boundary an earlier beat measured and recorded.

const BOOK: ResolverVocabulary = {
  symbols: ['NRVA'],
  regions: ['USA'],
  countries: [{ iso: 'US', name: 'United States' }],
  sectors: [],
  industries: [],
  playbooks: [],
  catalystTypes: [],
  mistakes: [{ axis: 'technical', name: 'MACD negative at entry' }],
  macdStates: MACD_STATES,
} as unknown as ResolverVocabulary

const r = (text: string) => resolveQuery(text, BOOK, NOW, emptyFilters())
const state = (text: string) => r(text).state

/** Ten rows: four positive, three negative, three uncomputed. Chosen so no two
 *  of the three answers share a count -- a facet that returned the wrong bucket
 *  would still be caught. */
const ROWS = [
  true, true, true, true,
  false, false, false,
  null, null, null,
].map((v, i) => ({
  id: i + 1, date: '2026-08-20', symbol: 'NRVA', side: 'long', is_open: false,
  open_time: '2026-08-20T13:30:00Z', close_time: '2026-08-20T13:40:00Z',
  net_pnl: 10, playbook_id: null, mistakes: [], mistakeTags: [],
  catalyst_type: null, region: null, country: null, sector: null, industry: null,
  tf_1m_macd_positive: v,
})) as unknown as TradeListRow[]

const count = (text: string) => applyTradesFilters(ROWS, r(text).state).length

// --- RH1 : THE FACET REPLACES THE MISTAKE ----------------------------------

describe('RH1 "macd positive" resolves to the facet, not the mistake', () => {
  it('writes the macd state and NOT a mistake', () => {
    const s = state('macd positive')
    expect(s.macdStates, 'the facet was not written').toEqual(['positive'])
    expect(
      s.mistakeKeys,
      'the mistake "MACD negative at entry" still won -- the wrong sense, on zero trades',
    ).toEqual([])
  })

  it('and reads every word of itself', () => {
    expect(r('macd positive').unresolved).toEqual([])
  })

  it('a whole sentence around it resolves the same way', () => {
    const s = state('show me the trades where macd was positive')
    expect(s.macdStates).toEqual(['positive'])
    expect(s.mistakeKeys).toEqual([])
  })
})

// --- RH2 : THE ROWS ---------------------------------------------------------

describe('RH2 the facet narrows the actual rows', () => {
  it('"macd positive" keeps only the positive rows', () => {
    expect(count('macd positive')).toBe(4)
  })

  it('and it is NOT the whole set, and NOT empty', () => {
    // The two ways this could pass while being wrong.
    expect(count('macd positive')).toBeLessThan(ROWS.length)
    expect(count('macd positive')).toBeGreaterThan(0)
  })
})

// --- RH3 : THE NEGATIVE SIDE ------------------------------------------------

describe('RH3 "macd negative" resolves to the facet too', () => {
  it('writes the negative state and no mistake', () => {
    const s = state('macd negative')
    expect(
      s.macdStates,
      'the mistake beat the facet -- its name is a PREFIX of this phrase',
    ).toEqual(['negative'])
    expect(s.mistakeKeys).toEqual([])
  })

  it('and keeps only the negative rows', () => {
    expect(count('macd negative')).toBe(3)
  })
})

// --- RH4 : UNKNOWN IS A VALUE THE USER CAN NAME -----------------------------

describe('RH4 the uncomputed rows are reachable', () => {
  it('"macd unknown" writes the null member', () => {
    expect(state('macd unknown').macdStates).toEqual([null])
  })

  it('"macd uncomputed" is the same ask', () => {
    expect(state('macd uncomputed').macdStates).toEqual([null])
  })

  it('and it selects exactly the rows with no computed value', () => {
    expect(count('macd unknown')).toBe(3)
  })

  it('the three answers partition the book exactly', () => {
    // The invariant that makes "unknown" honest rather than decorative.
    expect(count('macd positive') + count('macd negative') + count('macd unknown'))
      .toBe(ROWS.length)
  })

  it('and "macd not computed" is deliberately NOT a key -- "not" is a negator', () => {
    // Pinned so the omission is a decision. Typing it does not write the null
    // member; the mask splits the phrase. If a later beat wants that wording it
    // has to solve the negator collision first.
    expect(state('macd not computed').macdStates).toEqual([])
  })
})

// --- RH5 : THE EXCLUDE TWIN -------------------------------------------------

describe('RH5 the eighth exclude array behaves like the other seven', () => {
  it('"not macd positive" excludes rather than refusing', () => {
    const s = state('not macd positive')
    expect(s.excludeMacdStates, 'the negated term was refused').toEqual(['positive'])
    expect(s.macdStates, 'the negated term was applied POSITIVELY').toEqual([])
  })

  it('and it leaves the UNCOMPUTED rows alone', () => {
    // Beat 104's measurement: null is the untagged bucket, and excluding a real
    // value does not remove the untagged. Six rows survive -- three negative
    // and three uncomputed -- not three.
    expect(count('not macd positive')).toBe(6)
  })

  it('PROOF THIS CAN FIRE: excluding the null member DOES remove them', () => {
    // The presence beside the absence. Without it, the assertion above would
    // pass on an engine that had stopped excluding anything at all.
    expect(count('not macd unknown')).toBe(7)
  })
})

// --- RH6 : THE RESPONSE NAMES COVERAGE AND TIMEFRAME ------------------------

describe('RH6 the applied line says one-minute and says what it left out', () => {
  // R153: "eighty-three trades" alone repeats today's silent lie with a
  // different number. R154: the two timeframes disagree on nearly half the
  // demo book, so the answer must name which one it used.
  it('the positive line names the timeframe AND the exclusion', () => {
    const line = r('macd positive').applied.join(' | ')
    expect(line, `applied line was: ${line}`).toBe('macd positive (1-minute, uncomputed excluded)')
  })

  it('the negative line likewise', () => {
    expect(r('macd negative').applied.join(' | ')).toBe('macd negative (1-minute, uncomputed excluded)')
  })

  it('and the unknown line names the timeframe but claims no exclusion', () => {
    // It IS the uncomputed rows, so saying it excluded them would be false.
    expect(r('macd unknown').applied.join(' | ')).toBe('macd unknown (1-minute)')
  })

  it('the exclude side names the timeframe too', () => {
    expect(r('not macd positive').applied.join(' | ')).toBe('excluding macd positive (1-minute)')
  })
})

// --- RH7 : THE MISTAKE IS STILL REACHABLE -----------------------------------

describe('RH7 the existing mistake tag did not become unreachable', () => {
  // The facet must not cost the trader a tag they already use. Its full name
  // still wins, because it is an EXACT match and the facet keys are not.
  it('"macd negative at entry" still applies the mistake', () => {
    const s = state('macd negative at entry')
    expect(s.mistakeKeys, 'the facet swallowed an existing tag').toEqual([
      { axis: 'technical', name: 'MACD negative at entry' },
    ])
    expect(s.macdStates, 'the facet applied as well as the mistake').toEqual([])
  })

  it('PROOF THIS CAN FIRE: the shorter phrase does NOT reach the mistake', () => {
    // Absence proven by the presence beside it -- the pair is the guard.
    expect(state('macd negative').mistakeKeys).toEqual([])
  })
})

// --- RH11 : A BARE "macd" ASKS RATHER THAN GUESSING -------------------------
//
// Not in the brief; added because the two-word shape makes a bare "macd"
// genuinely ambiguous, and the offer mechanism already exists to say so.

describe('RH11 a bare "macd" offers the choice', () => {
  it('applies nothing and names the three readings', () => {
    const out = r('macd')
    expect(out.state.macdStates, 'a bare "macd" picked a side').toEqual([])
    expect(out.state.mistakeKeys, 'a bare "macd" fell back to the mistake').toEqual([])
    const offer = out.ambiguous.find((a) => a.text === 'macd')
    expect(offer, 'no choice was offered').toBeTruthy()
    expect(offer!.candidates).toContain('macd positive')
    expect(offer!.candidates).toContain('macd negative')
  })
})

// --- RH10 : SCOPE GUARD — the other facets are untouched --------------------

describe('RH10 nothing else moved', () => {
  it('the seven original arrays still resolve', () => {
    expect(state('usa').regions).toEqual(['USA'])
  })

  it('and an unrelated ask is unchanged', () => {
    expect(state('winners').outcome).toBe('winners')
  })

  it('R155: only the POSITIVE axis is written -- open and rising are untouched', () => {
    const s = state('macd positive') as unknown as Record<string, unknown>
    expect(s['macdOpen'], 'the two-by-two grid was applied silently').toBeUndefined()
    expect(s['macdRising'], 'the two-by-two grid was applied silently').toBeUndefined()
  })
})

// --- RJ3 : THE KIND REORDER IS A GLOBAL CHANGE ------------------------------
//
// MACD took kind seven and the mistakes moved to eight, so that a bare "macd"
// prefers the facet over a PREFIX hit on a tag name. That is a change to the
// precedence every kind of vocabulary shares, not a MACD-local one, so it is
// guarded as a global change: the mistake vocabulary must still be fully
// reachable at its new kind.
//
// A DIFFERENT AXIS ON PURPOSE. Asserting only "MACD negative at entry" would
// pin one string and could pass while every other mistake had become
// unreachable. A psychological tag with no MACD word in it exercises the KIND
// rather than the collision.

const REORDER_BOOK: ResolverVocabulary = {
  ...BOOK,
  mistakes: [
    { axis: 'technical', name: 'MACD negative at entry' },
    { axis: 'psychological', name: 'Revenge trade (after a loss)' },
    { axis: 'technical', name: 'Chased extension (too far from 9 EMA)' },
  ],
} as unknown as ResolverVocabulary
const reordered = (text: string) => resolveQuery(text, REORDER_BOOK, NOW, emptyFilters())

describe('RJ3 the mistake vocabulary survives its new kind', () => {
  it('a PSYCHOLOGICAL mistake still resolves by its full name', () => {
    expect(
      reordered('revenge trade (after a loss)').state.mistakeKeys,
      'the kind reorder cost the mistake vocabulary its reach',
    ).toEqual([{ axis: 'psychological', name: 'Revenge trade (after a loss)' }])
  })

  it('and a second technical one, with no MACD word in it', () => {
    expect(reordered('chased extension (too far from 9 ema)').state.mistakeKeys).toEqual([
      { axis: 'technical', name: 'Chased extension (too far from 9 EMA)' },
    ])
  })

  it('a mistake still resolves by a PREFIX when nothing else claims it', () => {
    // Kind only decides between competing kinds. With no MACD word in the way,
    // the weaker tiers must still reach a tag exactly as they did before.
    expect(reordered('revenge trade').state.mistakeKeys).toEqual([
      { axis: 'psychological', name: 'Revenge trade (after a loss)' },
    ])
  })

  it('and the MACD tag still wins its own full name over the facet', () => {
    expect(reordered('macd negative at entry').state.mistakeKeys).toEqual([
      { axis: 'technical', name: 'MACD negative at entry' },
    ])
    expect(reordered('macd negative at entry').state.macdStates).toEqual([])
  })

  it('the facet wins the SHORTER phrase -- by TIER, not by kind', () => {
    // MEASURED, and the name is corrected from what it first claimed. A plant
    // that reverted the kind reorder left this case GREEN: "macd negative" is
    // an EXACT hit on the facet key and only a PREFIX of the tag, and tier is
    // checked before kind. So this proves the tier rule, not the ordering.
    expect(reordered('macd negative').state.macdStates).toEqual(['negative'])
    expect(reordered('macd negative').state.mistakeKeys).toEqual([])
  })

  it('PROOF THE ORDER IS WHAT DOES IT: a BARE "macd" prefers the facet', () => {
    // The case the kind actually decides. Bare "macd" is a PREFIX of both the
    // facet keys and the tag name, so no tier separates them and the lower kind
    // wins. Reverting the reorder reddens exactly this and the sentence case
    // below it -- which is how the plant found the mis-named assertion above.
    const out = reordered('macd')
    expect(out.state.mistakeKeys, 'the tag beat the facet on a bare word').toEqual([])
    const offer = out.ambiguous.find((a) => a.text === 'macd')
    expect(offer, 'no choice was offered').toBeTruthy()
    expect(offer!.candidates).toContain('macd positive')
  })
})
