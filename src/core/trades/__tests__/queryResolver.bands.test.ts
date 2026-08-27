// v0.2.7 — THE TRADER'S WORDS.
//
// Of ten sentences a momentum trader would type about indicators, ZERO worked
// and SEVEN applied something else. The columns were never the problem:
// "vwap over 10" and "ema9 over 10" both resolve and always did. The WORDS
// were missing -- "extended", "near", "below" -- and those are the words a
// trader actually says.
//
// THE THRESHOLDS ARE THE APP'S OWN, AND THEY ARE IMPORTED RATHER THAN COPIED.
// EMA_BUCKETS (emaBuckets.ts:52-60) and VWAP_BUCKETS (vwapBuckets.ts:51-59)
// carry seven bands each with identical edges, locked bucket-for-bucket by
// bucketSchemeParity.test.ts. The resolver reads those tables directly, so a
// second definition of "extended" cannot come into existence and drift.
//
// ONE MERGE, AND IT IS ALSO THE APP'S. Bare "extended" means AT OR BEYOND the
// extended band's lower edge, not the band alone -- ema9DistanceBuckets.ts:43-50:
//
//     "an entry is "extended" when its SIGNED 9-EMA distance is at or beyond
//      the EXTENDED band's lower edge (+5.0%)"
//
// That predicate is already product-level: electron/analytics/get.ts:365 uses
// it for the clean-vs-extended split. A trader asking for extended entries
// means the blow-off ones too.
//
// BARE "extended" MEANS THE NINE EMA. A product ruling, not a measurement:
// the nine is the pullback reference you enter off and talk about without
// naming it; VWAP is the level you are above or below. The app's own extended
// predicate is nine-EMA-only, which is the same instinct written down earlier.
// "extended from vwap" still resolves to VWAP, and a guard holds the two
// readings apart so neither can quietly become the other.
//
// AN EXACT VOCABULARY MATCH STILL WINS, by the precedent already in the file:
// pass zero hands a recency word back when the book names a setup after it
// ("a playbook named 'Last' is the trader's own name for a setup"). A band
// word does the same. What it does NOT yield to is a SUBSTRING match -- on the
// demo book "extended" reaches a mistake called "Chased extended" that way,
// and a first-class band word losing to a substring is the theft this campaign
// exists to stop.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { applyTradesFilters, emptyFilters } from '../tradesFilter'
import { EMA_BUCKETS } from '@/core/technicals/emaBuckets'
import { VWAP_BUCKETS } from '@/core/technicals/vwapBuckets'
import type { TradeListRow } from '@shared/trades-types'

const NOW = new Date('2026-08-22T15:00:00')

/** No playbook, mistake or catalyst named for an indicator or a band -- the
 *  collisions are guarded separately and deliberately, not smuggled in here. */
const BOOK: ResolverVocabulary = {
  symbols: ['NRVA'],
  regions: ['USA'],
  countries: [{ iso: 'US', name: 'United States' }],
  sectors: ['Healthcare'],
  industries: [],
  playbooks: [{ id: 4, name: 'Micro Pullback', tier: 'A+' }],
  catalystTypes: ['Earnings'],
  mistakes: [{ axis: 'technical', name: 'Stop too wide / risk undefined' }],
}
const r = (text: string, vocab: ResolverVocabulary = BOOK) =>
  resolveQuery(text, vocab, NOW, emptyFilters())
const ranges = (text: string, vocab: ResolverVocabulary = BOOK) => r(text, vocab).state.ranges

/** The bounds THIS GUARD expects, derived from the same tables the cure reads.
 *  Written as a lookup rather than as literals so a change to the canonical
 *  scheme fails the parity test first and this file second, never silently. */
const fin = (n: number) => (Number.isFinite(n) ? n : null)
const ema = (i: number) => ({ min: fin(EMA_BUCKETS[i]!.lo), max: fin(EMA_BUCKETS[i]!.hi) })
const vwap = (i: number) => ({ min: fin(VWAP_BUCKETS[i]!.lo), max: fin(VWAP_BUCKETS[i]!.hi) })

/** word -> band index, and whether the word MERGES upward. Only "extended"
 *  merges, and only because the app already says it does. */
const BANDS: { word: string; idx: number; merged?: true }[] = [
  // ONE ROW LEFT THIS TABLE, and it is quoted rather than deleted:
  //     { word: 'below', idx: 0 },
  // "below" is no longer a band word. It is a direction word now, and a
  // direction word with no value means the indicator itself -- max zero, the
  // same rule "above" follows. The lowest band keeps its meaning and loses its
  // bare word; RG4 proves it is still reachable by number.
  { word: 'at', idx: 1 },
  { word: 'near', idx: 2 },
  { word: 'extended', idx: 4, merged: true },
  { word: 'very extended', idx: 5 },
  { word: 'blow off', idx: 6 },
]
const expectedFor = (b: { idx: number; merged?: true }, which: 'ema' | 'vwap') => {
  const raw = which === 'ema' ? ema(b.idx) : vwap(b.idx)
  return b.merged ? { min: raw.min, max: null } : raw
}

// --- RE1 : ONE CASE PER BAND PER INDICATOR ----------------------------------

describe('RE1 every band word writes the app-canonical range, on both indicators', () => {
  it.each(BANDS)('"$word from the 9 ema" is the EMA band', (b) => {
    expect(ranges(`${b.word} from the 9 ema`)).toEqual({
      ema9_dist_pct: expectedFor(b, 'ema'),
    })
  })

  it.each(BANDS)('"$word from vwap" is the VWAP band', (b) => {
    expect(ranges(`${b.word} from vwap`)).toEqual({
      vwap_dist_pct: expectedFor(b, 'vwap'),
    })
  })

  it('and the two tables really do agree, so the guard above is not two guards', () => {
    // If the parity test ever loosened, the assertions above would still pass
    // while meaning different things per indicator. This says so out loud.
    expect(EMA_BUCKETS.map((x) => [x.lo, x.hi])).toEqual(VWAP_BUCKETS.map((x) => [x.lo, x.hi]))
  })
})

// --- RE2 : THE BAND REACHES THE ROWS ----------------------------------------

/** One row per canonical band plus the edges, so every band has something to
 *  find and something to exclude. A state assertion cannot tell a correct band
 *  from a correctly-shaped empty one. */
const DISTANCES = [-9, -0.6, -0.5, 0, 0.5, 1.2, 2, 3, 5, 7, 10, 15, 20, 33]
const rowsAt = (col: 'tf_1m_ema9_dist_pct' | 'tf_1m_vwap_dist_pct') =>
  DISTANCES.map((d, i) => ({
    id: i + 1, date: '2026-08-20', symbol: 'NRVA', side: 'long', is_open: false,
    open_time: '2026-08-20T13:30:00Z', close_time: '2026-08-20T13:40:00Z',
    net_pnl: 10, playbook_id: null, mistakes: [], mistakeTags: [],
    catalyst_type: null, region: null, country: null, sector: null, industry: null,
    [col]: d,
  })) as unknown as TradeListRow[]

/** Counted from the DISTANCES list by the same edges the cure reads. */
const expectedCount = (b: { idx: number; merged?: true }) => {
  const e = expectedFor(b, 'ema')
  return DISTANCES.filter((d) => (e.min === null || d >= e.min) && (e.max === null || d <= e.max)).length
}

describe('RE2 each band narrows the actual rows', () => {
  it.each(BANDS)('"$word from the 9 ema" keeps the right rows', (b) => {
    const n = applyTradesFilters(rowsAt('tf_1m_ema9_dist_pct'), r(`${b.word} from the 9 ema`).state).length
    expect(n, `"${b.word}" matched ${n} of ${DISTANCES.length}`).toBe(expectedCount(b))
  })

  it.each(BANDS)('"$word from vwap" keeps the right rows', (b) => {
    const n = applyTradesFilters(rowsAt('tf_1m_vwap_dist_pct'), r(`${b.word} from vwap`).state).length
    expect(n).toBe(expectedCount(b))
  })

  it('and the bands are not all the same set', () => {
    // Without this every RE2 row could pass on a cure that ignored the word.
    const counts = BANDS.map((b) => expectedCount(b))
    expect(new Set(counts).size, `all bands matched the same count: ${counts}`).toBeGreaterThan(1)
  })
})

// --- RE3 : BARE "extended" IS THE NINE EMA ----------------------------------

describe('RE3 a bare band word defaults to the nine EMA', () => {
  it('"extended" alone writes the 9 EMA range and no VWAP range', () => {
    const g = ranges('extended')
    expect(g.ema9_dist_pct, 'bare "extended" did not reach the 9 EMA').toEqual({
      min: EMA_BUCKETS[4]!.lo, max: null,
    })
    expect(g.vwap_dist_pct, 'bare "extended" reached VWAP as well as the 9 EMA').toBeUndefined()
  })

  it('and so does a whole sentence around it', () => {
    expect(ranges('show me the trades that are extended')).toEqual({
      ema9_dist_pct: { min: EMA_BUCKETS[4]!.lo, max: null },
    })
  })

  it('an unambiguous band word defaults the same way', () => {
    expect(ranges('near').ema9_dist_pct).toEqual(ema(2))
    expect(ranges('blow off').ema9_dist_pct).toEqual(ema(6))
  })

  it('but "at" needs the indicator said out loud', () => {
    // MEASURED. "at" is the tail of the column phrase "sold at", so reading a
    // bare one as a band would take "sold at 5" away from the reading it
    // already has, which RE7 asserts. Said with an indicator it works like the
    // others.
    //
    // "below" WAS IN THIS CASE and has left it. The old line read:
    //     expect(ranges('below vwap')).toEqual({ vwap_dist_pct: vwap(0) })
    // It is a direction word now, not a band word, so it goes through the zero
    // rule instead and RG1 owns it. A BARE "below" is still nothing at all,
    // for the same reason it always was: no column, no comparison.
    expect(ranges('at'), 'a bare column-phrase tail was read as a band').toEqual({})
    expect(ranges('below'), 'a bare direction word invented a column').toEqual({})
    expect(ranges('at the 9 ema')).toEqual({ ema9_dist_pct: ema(1) })
  })
})

// --- RE4 : THE DISCRIMINATING COMPANION -------------------------------------

describe('RE4 naming VWAP still means VWAP', () => {
  // Without this, RE3 passes for a cure that made every band mean the nine.
  it('"extended from vwap" is the VWAP range and no EMA range', () => {
    const g = ranges('extended from vwap')
    expect(g.vwap_dist_pct, 'the explicit indicator was ignored').toEqual({
      min: VWAP_BUCKETS[4]!.lo, max: null,
    })
    expect(g.ema9_dist_pct, 'the default was applied on top of the explicit ask').toBeUndefined()
  })

  it('"below vwap" too -- the phrasing a trader actually types', () => {
    // INVERTED IN PLACE. The old line read:
    //     expect(ranges('below vwap')).toEqual({ vwap_dist_pct: vwap(0) })
    // What this case is FOR is unchanged -- naming VWAP must still select VWAP
    // and not the nine -- so it keeps testing that and only the bound moved.
    expect(ranges('below vwap')).toEqual({ vwap_dist_pct: { min: null, max: 0 } })
    expect(ranges('below vwap').ema9_dist_pct, 'the default leaked in').toBeUndefined()
  })

  it('and "near the 9 ema" is not the VWAP band', () => {
    expect(ranges('near the 9 ema').vwap_dist_pct).toBeUndefined()
  })
})

// --- RE5 : THE RESPONSE NAMES THE INDICATOR AND THE BAND --------------------

describe('RE5 the applied line says which indicator and which band', () => {
  // R139: the default is a RULING, so the user has to be able to see it was
  // applied and disagree with it. An applied line reading only "extended"
  // would hide exactly the choice this beat made on their behalf.
  it('bare "extended" names the nine EMA', () => {
    const line = r('extended').applied.join(' | ')
    expect(line, `applied line was: ${line}`).toContain('9 EMA')
    expect(line).toContain('extended')
  })

  it('"extended from vwap" names VWAP', () => {
    const line = r('extended from vwap').applied.join(' | ')
    expect(line).toContain('VWAP')
    expect(line).toContain('extended')
  })

  it('and a bounded band names its numbers', () => {
    const line = r('near the 9 ema').applied.join(' | ')
    expect(line).toContain('9 EMA')
    expect(line).toContain('near')
  })
})

// --- RE6 : THE MISSING dist PHRASES -----------------------------------------

describe('RE6 the distance phrasings a trader types now resolve', () => {
  it('"vwap dist over 10" reaches the VWAP distance column', () => {
    expect(ranges('vwap dist over 10')).toEqual({ vwap_dist_pct: { min: 10, max: null } })
  })

  it('"vwap distance over 10" likewise', () => {
    expect(ranges('vwap distance over 10')).toEqual({ vwap_dist_pct: { min: 10, max: null } })
  })

  it('"ema9 dist over 10" likewise', () => {
    expect(ranges('ema9 dist over 10')).toEqual({ ema9_dist_pct: { min: 10, max: null } })
  })

  it('and the number-bearing forms reach it too', () => {
    // PROVEN reachable by a scratch entry before it was added: with an operator
    // and a value the comparison pass claims the phrase before the bare-count
    // pass can take the number.
    expect(ranges('9 ema over 5')).toEqual({ ema9_dist_pct: { min: 5, max: null } })
    expect(ranges('ema 9 over 5')).toEqual({ ema9_dist_pct: { min: 5, max: null } })
  })
})

// --- RE7 : SCOPE GUARD — what already worked is untouched -------------------

describe('RE7 the phrasings that already worked are unchanged', () => {
  it('"vwap over 10" and "ema9 over 10" resolve exactly as before', () => {
    expect(ranges('vwap over 10')).toEqual({ vwap_dist_pct: { min: 10, max: null } })
    expect(ranges('ema9 over 10')).toEqual({ ema9_dist_pct: { min: 10, max: null } })
  })

  it('"ema distance over 10" and "ema9 distance over 10" too', () => {
    expect(ranges('ema distance over 10')).toEqual({ ema9_dist_pct: { min: 10, max: null } })
    expect(ranges('ema9 distance over 10')).toEqual({ ema9_dist_pct: { min: 10, max: null } })
  })

  it('a bare count is still a limit', () => {
    expect(r('show me the last 10 trades').state.limit).toBe(10)
  })

  it('AN EXACT vocabulary match still beats a band word', () => {
    // The precedent pass zero already sets for recency words. A book that names
    // a setup "Extended" means the setup, not the band.
    const NAMED: ResolverVocabulary = {
      ...BOOK,
      playbooks: [...BOOK.playbooks, { id: 13, name: 'Extended', tier: 'A' }],
    }
    expect(r('extended', NAMED).state.playbookIds, 'the band word stole the trader’s own setup name').toEqual([13])
    expect(ranges('extended', NAMED), 'a band was applied as well as the playbook').toEqual({})
  })

  it('but a SUBSTRING match does not', () => {
    // "Chased extended" contains "extended". A first-class band word losing to
    // a substring is the theft this campaign exists to stop.
    const SUBSTR: ResolverVocabulary = {
      ...BOOK,
      mistakes: [...BOOK.mistakes, { axis: 'technical', name: 'Chased extended' }],
    }
    expect(ranges('extended', SUBSTR)).toEqual({
      ema9_dist_pct: { min: EMA_BUCKETS[4]!.lo, max: null },
    })
    expect(r('extended', SUBSTR).state.mistakeKeys).toEqual([])
  })
})

// --- RE8 : SCOPE GUARD — beat 124's signed reads still work -----------------

describe('RE8 a written negative bound still reads', () => {
  it('"vwap under -0.5" is still minus a half', () => {
    expect(ranges('vwap under -0.5')).toEqual({ vwap_dist_pct: { min: null, max: -0.5 } })
  })

  it('and the written bound is now a DIFFERENT question from the word', () => {
    // INVERTED IN PLACE. The old assertion read:
    //     const byWord = applyTradesFilters(rows, r('below vwap').state).length
    //     const byHand = applyTradesFilters(rows, r('vwap under -0.5').state).length
    //     expect(byWord,
    //       'the band word and the explicit bound disagree').toBe(byHand)
    // It was true while "below vwap" WAS the band. The word now means below
    // zero and the written bound still means below minus a half, so they are
    // two different questions and must give two different answers. Asserting
    // they still agree would be asserting the cure did not happen.
    //
    // This is the guard a plant caught a beat ago by driving what a block
    // named for something else happened to read.
    const rows = rowsAt('tf_1m_vwap_dist_pct')
    const byWord = applyTradesFilters(rows, r('below vwap').state).length
    const byHand = applyTradesFilters(rows, r('vwap under -0.5').state).length
    expect(byWord, 'the word and the written bound collapsed together').toBeGreaterThan(byHand)
  })
})

// --- RE9 : "above" MEANS ABOVE ZERO -----------------------------------------

describe('RE9 "above vwap" is the trader reading, not the band', () => {
  // INVERTED IN PLACE. This block asserted the OPPOSITE, deliberately, and the
  // old assertions are kept here verbatim rather than deleted so the reversal
  // is legible:
  //
  //     it('"above vwap" applies no range at all', () => {
  //       expect(ranges('above vwap'),
  //         '"above" was quietly given a meaning').toEqual({})
  //     })
  //     it('and says so rather than going silent', () => {
  //       expect(r('above vwap').unresolved.join(' ')).toContain('above')
  //     })
  //
  // WHY IT CHANGED, and the reason is a ruling rather than a measurement. The
  // canonical band "Above VWAP (trending)" is +2.0% to +5.0%; a trader saying
  // "above VWAP" means simply more than zero. Both readings are defensible and
  // only one can ship, so the previous beat shipped neither and said so. The
  // founder has now ruled for the trader: this is the most common VWAP question
  // in small-cap momentum, and answering a fifth of it is worse than refusing.
  //
  // THE LABEL COLLISION IS RECORDED AND NOT RESOLVED. The Technicals tab still
  // shows a band called "Above VWAP" meaning +2 to +5, and Edge's "above vwap"
  // does not mean that. Whether the band gets a word of its own is a separate
  // ruling and is not made here.
  it('"above vwap" is greater than zero', () => {
    expect(ranges('above vwap')).toEqual({ vwap_dist_pct: { min: 0, max: null } })
  })

  it('and the explicit form still agrees with it', () => {
    expect(ranges('vwap over 0')).toEqual({ vwap_dist_pct: { min: 0, max: null } })
  })
})


// --- RF : AN OPERATOR WITH NO VALUE, ON A SIGNED DISTANCE COLUMN ------------
//
// "above vwap" is the most common VWAP question a small-cap momentum trader
// asks, and until now it resolved to nothing at all: the comparison window
// forms, finds no value after the operator, and refuses -- correctly, because a
// filter with a coerced number is worse than no filter.
//
// ZERO IS THE ONE VALUE THAT DOES NOT HAVE TO BE GUESSED. On a signed DISTANCE
// column, zero is the indicator itself: the price sitting exactly at VWAP, or
// exactly at the nine. "Above VWAP" is not missing a number -- the number is
// implied by the word, and it is the only number the word can mean.
//
// THAT IS TRUE OF ALMOST NOTHING ELSE. On float, shares, hold time or price,
// zero is the bottom of the scale, so "above float" would match every row in
// the book while looking like a filter. Those columns still refuse, and RF4
// pins the refusal. The signed columns that are not DISTANCES -- net P&L, gain
// per cent, R multiple -- have a meaningful zero too, but "above zero" there is
// already spelled by the outcome words, and widening this rule to them is not
// the ruling that was made.

/** The only two columns admitted, and the reason each is admitted: a SIGNED
 *  distance from an indicator, where zero is the indicator itself. */
const RF_ZERO_BOUND: [string, string][] = [
  ['vwap', 'vwap_dist_pct'],
  ['ema9', 'ema9_dist_pct'],
]

/** Refused, with the rule that refused each. The first group can never be
 *  negative, so "above zero" is every row; the second is signed but is not a
 *  distance, and the ruling was scoped to distances. */
const RF_REFUSED: [string, string][] = [
  ['float', 'never negative -- zero is the bottom of the scale'],
  ['shares', 'never negative'],
  ['hold time', 'never negative'],
  ['rvol', 'never negative'],
  ['price', 'never negative'],
  ['net', 'signed, but not a distance -- the outcome words already say it'],
  ['gain', 'signed, but not a distance'],
]

describe('RF1 an operator with no value binds to zero on a distance column', () => {
  it.each(RF_ZERO_BOUND)('"above %s" is min zero and no upper bound', (word, col) => {
    expect(ranges(`above ${word}`)).toEqual({ [col]: { min: 0, max: null } })
  })

  it.each(RF_ZERO_BOUND)('"over %s" reads the same way', (word, col) => {
    expect(ranges(`over ${word}`)).toEqual({ [col]: { min: 0, max: null } })
  })

  it('and the bound is a MINIMUM, not a maximum', () => {
    // Asserted separately because a max-zero cure would satisfy a looser
    // "some range was written" assertion while meaning the opposite set.
    const g = ranges('above vwap').vwap_dist_pct
    expect(g?.min, 'the lower bound was not zero').toBe(0)
    expect(g?.max, 'an upper bound was invented').toBeNull()
  })
})

describe('RF2 the zero bound narrows the actual rows', () => {
  const above = DISTANCES.filter((d) => d >= 0).length
  it('"above vwap" keeps every row at or above zero', () => {
    expect(applyTradesFilters(rowsAt('tf_1m_vwap_dist_pct'), r('above vwap').state).length)
      .toBe(above)
  })

  it('"above the 9 ema" likewise', () => {
    expect(applyTradesFilters(rowsAt('tf_1m_ema9_dist_pct'), r('above ema9').state).length)
      .toBe(above)
  })

  it('and it is NOT the whole book -- the bound really bounds', () => {
    expect(above).toBeLessThan(DISTANCES.length)
  })
})

describe('RF3 the phrasings a trader actually types', () => {
  // Driven, and the ones that do NOT work are named rather than omitted.
  it('"above vwap" works', () => {
    expect(ranges('above vwap')).toEqual({ vwap_dist_pct: { min: 0, max: null } })
  })

  it('"over vwap" works', () => {
    expect(ranges('over vwap')).toEqual({ vwap_dist_pct: { min: 0, max: null } })
  })

  it('"trades above vwap" works -- filler before the operator is skipped', () => {
    expect(ranges('trades above vwap')).toEqual({ vwap_dist_pct: { min: 0, max: null } })
  })

  it('"show me the trades above vwap" works', () => {
    expect(ranges('show me the trades above vwap')).toEqual({
      vwap_dist_pct: { min: 0, max: null },
    })
  })

  it('"above the 9 ema" works', () => {
    expect(ranges('above the 9 ema')).toEqual({ ema9_dist_pct: { min: 0, max: null } })
  })

  it('but "above the nine" does NOT, and that is named rather than hidden', () => {
    // "nine" alone is not a column phrase -- only "9 ema", "ema 9", "ema9" and
    // the two distance spellings are. Teaching the resolver that a bare "nine"
    // means the nine EMA is a phrase question, and it is not the ruling made
    // here. Left failing out loud so a later beat can pick it up on purpose.
    expect(ranges('above the nine'), 'if this now resolves, delete this guard').toEqual({})
  })
})

describe('RF4 a column with no meaningful zero still refuses', () => {
  it.each(RF_REFUSED)('"above %s" applies nothing -- %s', (word) => {
    expect(
      ranges(`above ${word}`),
      `"above ${word}" was given a zero bound it cannot mean`,
    ).toEqual({})
  })

  it('PROOF THE ABOVE CAN FIRE: the same shape DOES resolve on a distance column', () => {
    // An absence assertion beside the presence that proves it is live. Without
    // this pair RF4 would pass on a resolver that had stopped binding zero at
    // all -- which is exactly what the previous beat shipped.
    expect(ranges('above vwap')).toEqual({ vwap_dist_pct: { min: 0, max: null } })
  })

  it('and the refused ones still SAY they were not read', () => {
    expect(r('above float').unresolved.join(' ')).toContain('above')
  })
})

describe('RF5 an operator WITH a value is untouched', () => {
  // Without this, RF1 passes for a cure that zeroed every bound it saw.
  it('"vwap above 5" is still five', () => {
    expect(ranges('vwap above 5')).toEqual({ vwap_dist_pct: { min: 5, max: null } })
  })

  it('"vwap over 10" and "float under 1m" are unchanged', () => {
    expect(ranges('vwap over 10')).toEqual({ vwap_dist_pct: { min: 10, max: null } })
    expect(ranges('float under 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('and a written zero still means zero', () => {
    expect(ranges('vwap over 0')).toEqual({ vwap_dist_pct: { min: 0, max: null } })
  })
})

describe('RF6 "below" WAS changed, and the wart it caused is gone', () => {
  // INVERTED IN PLACE, AND THIS BLOCK IS THE CENTRE OF THE REVERSAL. It
  // asserted the opposite -- that "below vwap" kept the canonical band and that
  // it therefore DISAGREED with "under vwap". Both old assertions are kept here
  // verbatim rather than deleted:
  //
  //     it('"below vwap" is still the BAND, byte for byte', () => {
  //       expect(ranges('below vwap')).toEqual({ vwap_dist_pct: vwap(0) })
  //     })
  //     it('"below the 9 ema" likewise', () => {
  //       expect(ranges('below the 9 ema')).toEqual({ ema9_dist_pct: ema(0) })
  //     })
  //     it('SO "below vwap" AND "under vwap" DISAGREE, ...', () => {
  //       expect(ranges('below vwap')).toEqual({ vwap_dist_pct: vwap(0) })
  //       expect(ranges('under vwap'))
  //         .toEqual({ vwap_dist_pct: { min: null, max: 0 } })
  //       expect(ranges('below vwap')).not.toEqual(ranges('under vwap'))
  //     })
  //
  // WHY IT CHANGED, and planning owns this rather than the code. The earlier
  // ruling rested on a measurement of ONE indicator: on VWAP the band and the
  // binary are IDENTICAL -- sixty-two trades and sixty-two -- so the choice
  // looked free. The nine was never checked, and there it is one hundred and
  // twelve against one hundred and eighteen. The shape of the argument held;
  // the number offered in support of it did not.
  //
  // The wart that ruling produced was guarded rather than hidden, which is why
  // reversing it is three edits and not an excavation.
  it('"below vwap" is the binary, not the band', () => {
    expect(ranges('below vwap')).toEqual({ vwap_dist_pct: { min: null, max: 0 } })
  })

  it('"below the 9 ema" likewise', () => {
    expect(ranges('below the 9 ema')).toEqual({ ema9_dist_pct: { min: null, max: 0 } })
  })

  it('and it is NOT the band -- the two really are different states', () => {
    // The vacuity check, kept and pointed the other way: if the band and the
    // binary happened to be the same state, the assertions above would pass
    // without meaning anything. On VWAP they select the same ROWS; they are
    // still different STATES, and that is what is asserted.
    expect(vwap(0)).not.toEqual({ min: null, max: 0 })
    expect(ranges('below vwap')).not.toEqual({ vwap_dist_pct: vwap(0) })
  })
})

describe('RF7 the six band words are unchanged', () => {
  it.each(BANDS)('"$word from vwap" still writes its band', (b) => {
    expect(ranges(`${b.word} from vwap`)).toEqual({ vwap_dist_pct: expectedFor(b, 'vwap') })
  })
})

describe('RF8 a written negative bound still reads', () => {
  it('"vwap under -0.5" is still minus a half', () => {
    expect(ranges('vwap under -0.5')).toEqual({ vwap_dist_pct: { min: null, max: -0.5 } })
  })
})


// --- RG : BELOW MEANS BELOW ZERO --------------------------------------------
//
// The previous beat made a direction word with no value mean the indicator
// itself, and applied it upward only. "Above vwap" and "over vwap" agreed;
// "below vwap" kept the canonical band while "under vwap" took the binary. Two
// words a trader reads as synonyms, two different answers. That was guarded
// rather than hidden, and this beat closes it: the downward pair joins the
// upward one and the wart disappears instead of being explained.
//
// THE LOWEST BAND KEEPS ITS MEANING AND LOSES ITS BARE WORD. Nothing became
// unreachable -- "vwap under -0.5" still selects it -- and RG4 proves that with
// a number rather than a sentence. Whether the two edge bands get words of
// their own is a separate ruling and is not made here.

/** The two columns a direction word may bind on, and the phrase that reaches
 *  each. The same pair the zero rule admitted. */
const RG_COLUMNS: [string, string][] = [
  ['vwap', 'vwap_dist_pct'],
  ['the 9 ema', 'ema9_dist_pct'],
]

describe('RG1 "below X" is less than zero', () => {
  it.each(RG_COLUMNS)('"below %s" is max zero and no lower bound', (word, col) => {
    expect(ranges(`below ${word}`)).toEqual({ [col]: { min: null, max: 0 } })
  })

  it('and the bound is a MAXIMUM, not a minimum', () => {
    const g = ranges('below vwap').vwap_dist_pct
    expect(g?.max, 'the upper bound was not zero').toBe(0)
    expect(g?.min, 'a lower bound was invented').toBeNull()
  })
})

describe('RG2 "below X" and "under X" now AGREE', () => {
  // The assertion this beat exists to flip. Its predecessor asserted these two
  // DIFFER and is quoted in RF6 above.
  it.each(RG_COLUMNS)('"below %s" and "under %s" are the same ask', (word) => {
    expect(ranges(`below ${word}`)).toEqual(ranges(`under ${word}`))
  })

  it('and the pair is not agreeing by both being empty', () => {
    // The vacuity check: two refusals would satisfy the assertions above.
    expect(ranges('below vwap')).not.toEqual({})
    expect(ranges('under vwap')).not.toEqual({})
  })

  it('so the downward pair is now symmetric with the upward one', () => {
    expect(ranges('above vwap')).toEqual(ranges('over vwap'))
    expect(ranges('below vwap')).toEqual(ranges('under vwap'))
  })
})

describe('RG3 the zero bound narrows the actual rows', () => {
  const belowZero = DISTANCES.filter((d) => d <= 0).length
  it('"below vwap" keeps every row at or below zero', () => {
    expect(applyTradesFilters(rowsAt('tf_1m_vwap_dist_pct'), r('below vwap').state).length)
      .toBe(belowZero)
  })

  it('"below the 9 ema" likewise', () => {
    expect(applyTradesFilters(rowsAt('tf_1m_ema9_dist_pct'), r('below the 9 ema').state).length)
      .toBe(belowZero)
  })

  it('and it is NOT the whole book', () => {
    expect(belowZero).toBeLessThan(DISTANCES.length)
  })
})

describe('RG4 both edge bands are still reachable BY NUMBER', () => {
  // R148 as a measurement rather than a claim. The words are gone; the bands
  // are not. If either of these ever stops resolving, a capability really was
  // deleted and this guard says so.
  it('the lowest band -- "vwap under -0.5" and its nine-EMA twin', () => {
    expect(ranges('vwap under -0.5')).toEqual({ vwap_dist_pct: { min: null, max: -0.5 } })
    expect(ranges('ema9 under -0.5')).toEqual({ ema9_dist_pct: { min: null, max: -0.5 } })
  })

  it('the ABOVE band -- two to five, written as a two-sided range', () => {
    expect(ranges('vwap between 2 and 5')).toEqual({ vwap_dist_pct: { min: 2, max: 5 } })
    expect(ranges('vwap 2 to 5')).toEqual({ vwap_dist_pct: { min: 2, max: 5 } })
  })

  it('and the band bound selects a DIFFERENT set from the word', () => {
    // Proves the two are not the same question wearing two spellings -- which
    // is the whole reason losing the word matters at all.
    const rows = rowsAt('tf_1m_vwap_dist_pct')
    const band = applyTradesFilters(rows, r('vwap under -0.5').state).length
    const word = applyTradesFilters(rows, r('below vwap').state).length
    expect(band).not.toBe(word)
  })
})

describe('RG5 the UPWARD pair is unchanged', () => {
  // Without this, RG1 passes for a cure that flipped the direction of
  // everything rather than only the downward pair.
  it.each(RG_COLUMNS)('"above %s" is still min zero', (word, col) => {
    expect(ranges(`above ${word}`)).toEqual({ [col]: { min: 0, max: null } })
  })

  it('"over vwap" too', () => {
    expect(ranges('over vwap')).toEqual({ vwap_dist_pct: { min: 0, max: null } })
  })
})

describe('RG6 the five remaining band words are unchanged', () => {
  it('the table really does hold five now', () => {
    expect(BANDS.map((b) => b.word)).toEqual([
      'at', 'near', 'extended', 'very extended', 'blow off',
    ])
  })

  it.each(BANDS)('"$word from vwap" still writes its band', (b) => {
    expect(ranges(`${b.word} from vwap`)).toEqual({ vwap_dist_pct: expectedFor(b, 'vwap') })
  })

  it.each(BANDS)('"$word from the 9 ema" still writes its band', (b) => {
    expect(ranges(`${b.word} from the 9 ema`)).toEqual({ ema9_dist_pct: expectedFor(b, 'ema') })
  })
})

describe('RG7 an operator WITH a value is untouched', () => {
  it('"vwap below 5" is five, not zero', () => {
    expect(ranges('vwap below 5')).toEqual({ vwap_dist_pct: { min: null, max: 5 } })
  })

  it('"float below 5" and "float under 1m" are unchanged', () => {
    expect(ranges('float below 5')).toEqual({ float: { min: null, max: 5 } })
    expect(ranges('float under 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('and "sold at 5" is still not a band', () => {
    expect(ranges('sold at 5')).toEqual({})
  })
})

describe('RG8 the previous beats still hold', () => {
  it('a written negative bound still reads', () => {
    expect(ranges('vwap under -0.5')).toEqual({ vwap_dist_pct: { min: null, max: -0.5 } })
  })

  it('a column with no meaningful zero still REFUSES a bare direction', () => {
    expect(ranges('below float'), '"below float" was given a zero it cannot mean').toEqual({})
    expect(ranges('above float')).toEqual({})
  })

  it('PROOF THAT REFUSAL CAN FIRE: the same shape resolves on a distance column', () => {
    // An absence assertion beside the presence that proves it live.
    expect(ranges('below vwap')).toEqual({ vwap_dist_pct: { min: null, max: 0 } })
  })
})
