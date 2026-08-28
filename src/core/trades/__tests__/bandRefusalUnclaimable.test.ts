// v0.2.7 — A REFUSED WORD IS NOT A FREE WORD.
//
// Beat one hundred and thirty-one taught the band pass to REFUSE the twenty EMA,
// because the seven-band scheme was derived for the nine and the app's own spec
// gives the twenty "binary crossover only". The refusal was right. What it did
// with the word was not: it ran a bare `continue`, which leaves every token of
// the phrase FREE, and a free word is claimed by whichever later pass can reach
// it.
//
// MEASURED ON BOTH BOOKS, and the reported case was the smallest of them:
//   "extended from the 20 ema"      -> mistake "Chased extended"     (demo)
//   "very extended from the 20 ema" -> mistake "Chased extended"     (demo)
//   "blow off from the 20 ema"      -> catalyst "Offering / Dilution" (BOTH)
//   "parabolic from the 20 ema"     -> playbook "Parabolic Short"     (BOTH)
// Four of seven words on the demo book, two of seven on the larger one. A
// trader asking about a blow-off relative to the twenty was shown their
// OFFERINGS, with an applied line that said so and an empty ignored clause.
//
// THIS IS THE FOURTH INSTANCE OF ONE SHAPE. Beat one hundred and nine found an
// ungoverned negator matching the playbook "No Setup"; beat one hundred and
// seventeen and beat one hundred and twenty found the same class in the filler
// and stopword tiers. Beat one hundred and nine also built the cure: a SECOND
// array, `unclaimable`, that says "not matchable" while `marks` still says
// "free", so the word cannot be taken by another pass AND still comes back
// named in `unresolved`. Two meanings, two arrays. This beat reuses that seam
// rather than inventing one.
//
// THE SCOPE IS THE BAND WORD, NOT THE PHRASE. The indicator tokens keep the
// reading they already had — a bare "20 ema" is still read as a count, which is
// this file's oldest wart and is explicitly out of scope. Marking them would
// change a behaviour no ruling asked to change.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { applyTradesFilters, emptyFilters } from '../tradesFilter'
import type { TradeListRow } from '@shared/trades-types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const NOW = new Date('2026-08-22T15:00:00')

/** THE CLAIMERS ARE IN THE BOOK ON PURPOSE. A vocabulary without them would let
 *  every assertion below pass against the defect itself: nothing would take the
 *  freed word because nothing COULD. These three are the exact entries measured
 *  taking it on the real books. */
const BOOK: ResolverVocabulary = {
  symbols: ['NRVA'],
  regions: ['USA'],
  countries: [{ iso: 'US', name: 'United States' }],
  sectors: [],
  industries: [],
  playbooks: [
    { id: 8, name: 'Parabolic Short', tier: 'A' },
    { id: 4, name: 'Micro Pullback', tier: 'A+' },
  ],
  catalystTypes: ['Offering / Dilution'],
  mistakes: [{ axis: 'technical', name: 'Chased extended' }],
} as unknown as ResolverVocabulary

const r = (text: string) => resolveQuery(text, BOOK, NOW, emptyFilters())

/** THE SEVEN WORDS ARE PARSED FROM THE SHIPPED MODULE, never listed here. Beat
 *  eighty-five's law has bitten at eight beats now, always the same way: a hand
 *  written list covers what its author remembered. An eighth band word joins
 *  these assertions the day it is declared. */
const SRC = readFileSync(
  resolve(__dirname, '..', 'queryResolver.ts'),
  'utf8',
)
const NL = String.fromCharCode(10)
const BAND_WORDS: string[] = (() => {
  const openAt = SRC.indexOf('= {', SRC.indexOf('const BAND_WORDS'))
  const block = SRC.slice(openAt, SRC.indexOf(NL + '}', openAt))
  const out: string[] = []
  for (const line of block.split(NL)) {
    const m = line.match(/^\s+'?([a-z ]+?)'?:\s*\{ idx:/)
    if (m) out.push(m[1])
  }
  return out
})()

/** The out-of-scope reading that survives: "20" is a count to the bare-count
 *  pass, and no ruling here changes that. Every refused phrase must land on
 *  EXACTLY this and nothing else. */
const COUNT_ONLY = {
  ...emptyFilters(),
  limit: 20,
  sort: { colId: 'open_time', dir: 'desc' },
}

const PHRASINGS = (w: string) => [`${w} the 20 ema`, `${w} from the 20 ema`]

const ROWS = [-9, -3, 0, 2, 5, 8].map((d, i) => ({
  id: i + 1, date: '2026-08-20', symbol: 'NRVA', side: 'long', is_open: false,
  open_time: '2026-08-20T13:30:00Z', close_time: '2026-08-20T13:40:00Z',
  net_pnl: 10, playbook_id: null, mistakes: [], mistakeTags: [],
  catalyst_type: null, region: null, country: null, sector: null, industry: null,
  tf_1m_ema9_dist_pct: d, tf_1m_ema20_dist_pct: d,
})) as unknown as TradeListRow[]

// --- RB0 : THE LIST ITSELF ---------------------------------------------------

describe('RB0 the words under test come from the shipped module', () => {
  it('parses all seven, so an eighth cannot be forgotten', () => {
    expect(BAND_WORDS).toEqual([
      'at', 'near', 'extended', 'very extended', 'blow off', 'blowoff', 'parabolic',
    ])
  })

  it('the refusal marks the span UNCLAIMABLE -- beat 109 seam, not a new one', () => {
    const at = SRC.indexOf('if (refused) {')
    expect(at, 'the BAND_NO_SCHEME refusal no longer marks anything').toBeGreaterThan(-1)
    // Slice to the block's OWN closing brace rather than a byte count. A fixed
    // window measured the comment, not the code, and went red on a correct
    // cure the moment the comment outgrew it.
    const close = SRC.indexOf(NL + '    }', at)
    expect(close, 'the refusal block never closes').toBeGreaterThan(at)
    const block = SRC.slice(at, close)
    expect(block, 'the refusal does not use the unclaimable array').toContain('unclaimable[q] = true')
  })
})

// --- RB1 : NOTHING RESOLVES, AND THE WHOLE STATE SAYS SO ---------------------

/** R177: the WHOLE state, never one clause. A check on `ranges` alone passed at
 *  beat one hundred and thirty-one and missed every case in this file. */
describe('RB1 every band word times the refused indicator resolves NOTHING', () => {
  for (const w of BAND_WORDS) {
    for (const q of PHRASINGS(w)) {
      it(`"${q}" leaves the whole state at the bare count`, () => {
        expect(r(q).state).toEqual(COUNT_ONLY)
      })
    }
  }
})

describe('RB1b and the refused word comes back NAMED', () => {
  for (const w of BAND_WORDS) {
    for (const q of PHRASINGS(w)) {
      it(`"${q}" names ${w} in unresolved`, () => {
        expect(r(q).unresolved).toContain(w)
      })
    }
  }
})

// --- RB2 : ROW COUNTS, AS CORROBORATION ONLY ---------------------------------

/** NAMED AS CORROBORATION, not as the assertion. Beat one hundred and thirty-two
 *  measured a row count of zero on BOTH sides of a real difference, on the
 *  larger book, and a count-only check would have called that agreement. */
describe('RB2 corroboration: nothing was filtered, so the book is whole', () => {
  for (const w of BAND_WORDS) {
    it(`"${w} from the 20 ema" returns every row`, () => {
      expect(applyTradesFilters(ROWS, r(`${w} from the 20 ema`).state)).toHaveLength(ROWS.length)
    })
  }
})

// --- RB3 : R175, THE SCOPE IS THE REFUSED SPAN -------------------------------

describe('RB3 the words keep working everywhere they were not refused', () => {
  it('"extended" alone still resolves to the NINE', () => {
    expect(r('extended').state.ranges).toEqual({ ema9_dist_pct: { min: 5, max: null } })
  })

  it('"extended from vwap" still resolves to VWAP', () => {
    expect(r('extended from vwap').state.ranges).toEqual({ vwap_dist_pct: { min: 5, max: null } })
  })

  it('"blow off the 9 ema" still resolves -- the NINE is not refused', () => {
    expect(r('blow off the 9 ema').state.ranges).toEqual({ ema9_dist_pct: { min: 20, max: null } })
  })

  it('"near vwap" and "very extended" keep their bands', () => {
    expect(r('near vwap').state.ranges).toEqual({ vwap_dist_pct: { min: 0.5, max: 2 } })
    expect(r('very extended').state.ranges).toEqual({ ema9_dist_pct: { min: 10, max: 20 } })
  })
})

// --- RB4 : THE DISCRIMINATING COMPANION --------------------------------------

/** WITHOUT THIS BLOCK, RB1 passes for a cure that simply made the vocabulary
 *  pool unreachable -- a new defect wearing a fix. Each of these is an entry the
 *  refused word was measured STEALING, asked for by its own name. */
describe('RB4 the entries the freed word was stealing are still reachable', () => {
  it('"offering" still reaches the catalyst that "blow off" was taking', () => {
    expect(r('offering').state.catalystTypes).toEqual(['Offering / Dilution'])
  })

  it('"micro pullback" still reaches its playbook', () => {
    expect(r('micro pullback').state.playbookIds).toEqual([4])
  })

  it('a NON-band word is still claimed by the pool inside a 20 ema phrase', () => {
    // "offering" is not a band word, so the refusal must not touch it: the
    // indicator is still refused and the catalyst still applies.
    const res = r('offering from the 20 ema')
    expect(res.state.catalystTypes).toEqual(['Offering / Dilution'])
    expect(res.state.ranges).toEqual({})
  })
})

/** RECORDED, NOT REPAIRED. The mistake "Chased extended" is unreachable by its
 *  own full name and always has been: pass 1a runs before the vocabulary pool
 *  and claims "extended" as a band first. That is beat one hundred and
 *  twenty-five's deliberate precedence, it is UNCHANGED by this beat, and it is
 *  asserted here so the next person meets it as a fact rather than a surprise. */
describe('RB4b a pre-existing shadow, pinned rather than fixed', () => {
  it('"chased extended" gives its band word to the BAND, not to the tag', () => {
    expect(r('chased extended').state.ranges).toEqual({ ema9_dist_pct: { min: 5, max: null } })
  })

  /** WHAT HAPPENS TO THE LEFTOVER "chased" IS A DIFFERENT RULE and is NOT
   *  asserted here. In this minimal book it substring-matches exactly one tag
   *  and applies; on both real books two tags contain it, so the tier returns a
   *  CHOICE instead. That arity is the substring tier's own behaviour, it is
   *  identical before and after this beat, and pinning a fixture-specific
   *  outcome would be pinning the fixture rather than the resolver. */
})

// --- RB5 : THE RESPONSE NAMES WHAT IT DID NOT READ ---------------------------

describe('RB5 the user is told which words went unread', () => {
  it('"extended from the 20 ema" names extended AND the indicator', () => {
    expect(r('extended from the 20 ema').unresolved).toEqual(['extended', 'ema'])
  })

  it('"blow off from the 20 ema" names the whole two-word band', () => {
    expect(r('blow off from the 20 ema').unresolved).toEqual(['blow off', 'ema'])
  })

  it('and nothing is applied beyond the bare count', () => {
    expect(r('parabolic from the 20 ema').applied).toEqual(['showing 20, newest first'])
  })
})

// --- RB6 : SCOPE, THE TWENTY AS A RANGE IS UNTOUCHED -------------------------

describe('RB6 beat 131 range forms are untouched', () => {
  const CASES: [string, unknown][] = [
    ['ema20 over 5', { ema20_dist_pct: { min: 5, max: null } }],
    ['above the 20 ema', { ema20_dist_pct: { min: 0, max: null } }],
    ['below the 20 ema', { ema20_dist_pct: { min: null, max: 0 } }],
  ]
  for (const [q, want] of CASES) {
    it(`"${q}" still resolves`, () => {
      expect(r(q).state.ranges).toEqual(want)
    })
  }
})

// --- RB7 : SCOPE, THE EARLIER BEATS HOLD -------------------------------------

describe('RB7 beats 124 through 131 hold, by STATE not by count', () => {
  it('"above vwap" and "vwap over -5"', () => {
    expect(r('above vwap').state.ranges).toEqual({ vwap_dist_pct: { min: 0, max: null } })
    expect(r('vwap over -5').state.ranges).toEqual({ vwap_dist_pct: { min: -5, max: null } })
  })

  it('"micro pullback losers" keeps both halves', () => {
    const s = r('micro pullback losers').state
    expect(s.playbookIds).toEqual([4])
    expect(s.outcome).toBe('losers')
  })

  it('an ungoverned negator is STILL unclaimable and STILL named', () => {
    // beat 109's own case, driven here so this beat cannot break the seam it
    // is borrowing.
    expect(r('no').state).toEqual(emptyFilters())
    expect(r('no').unresolved).toEqual(['no'])
  })
})
