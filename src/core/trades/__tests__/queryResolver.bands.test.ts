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
  { word: 'below', idx: 0 },
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

  it('but "below" and "at" need the indicator said out loud', () => {
    // MEASURED, and it is why they are treated apart: "below" is also a
    // comparator and "at" is also the tail of the column phrase "sold at".
    // Reading a bare one as a band would take "float below 5" and "sold at 5"
    // away from the readings they already have, which are asserted in RE7.
    // Said with an indicator they work exactly like the others.
    expect(ranges('below'), 'a bare comparator was read as a band').toEqual({})
    expect(ranges('at'), 'a bare column-phrase tail was read as a band').toEqual({})
    expect(ranges('below vwap')).toEqual({ vwap_dist_pct: vwap(0) })
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
    expect(ranges('below vwap')).toEqual({ vwap_dist_pct: vwap(0) })
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

  it('and it still narrows rows the same way the band does', () => {
    // The band word and the hand-written bound must agree -- they are the same
    // question asked two ways, and if they disagree one of them is lying.
    const rows = rowsAt('tf_1m_vwap_dist_pct')
    const byWord = applyTradesFilters(rows, r('below vwap').state).length
    const byHand = applyTradesFilters(rows, r('vwap under -0.5').state).length
    expect(byWord, 'the band word and the explicit bound disagree').toBe(byHand)
  })
})

// --- RE9 : "above" IS REFUSED, ON PURPOSE -----------------------------------

describe('RE9 "above" is deliberately NOT a band word', () => {
  // THE ONE BAND WORD WHOSE APP DEFINITION CONTRADICTS ITS PLAIN MEANING. The
  // canonical band "Above VWAP (trending)" is +2.0% to +5.0%; a trader saying
  // "above VWAP" means simply more than zero. On the demo book that is fourteen
  // trades against seventy-eight. Shipping either number silently would answer
  // a question nobody asked, so the word is left out until it is ruled on, and
  // this guard makes the omission deliberate rather than forgotten.
  it('"above vwap" applies no range at all', () => {
    expect(ranges('above vwap'), '"above" was quietly given a meaning').toEqual({})
  })

  it('and says so rather than going silent', () => {
    expect(r('above vwap').unresolved.join(' ')).toContain('above')
  })

  it('while the explicit form still works, so the capability is not lost', () => {
    expect(ranges('vwap over 0')).toEqual({ vwap_dist_pct: { min: 0, max: null } })
  })
})
