// v0.2.7 — A PREFIX FLOOR THAT VARIES BY VOCABULARY KIND.
//
// WHAT THIS IS NOT. It is not a fix for what a trader experiences. Beat one
// hundred and forty-five drove ten ordinary sentences against three books under
// four floor settings and the totals barely moved: seven, seven, seven, seven on
// the demo book; eleven, ten, nine, ten on the human one. Ordinary English is
// made of four-plus-letter words and no prefix floor under discussion reaches
// them. The words that actually matched vocabulary in those sentences were
// average, hold, time, high, volume, break and rules — every one of them too
// long for any floor to touch. That behaviour is UNCHANGED by this file and
// remains live.
//
// WHAT IT IS. On the token census the per-kind floor strictly beats a global
// one. A global floor of three eliminates thirty-seven, forty-eight and one
// hundred silent applies across the three books, but it takes six, ten and
// SEVENTY ticker prefixes with it. Symbols at two with everything else at four
// eliminates sixty-two, eighty-eight and one hundred and two — more on every
// book — and costs no ticker at all.
//
// THE CARVE-OUT IS THE LOAD-BEARING PART. The only reason this beats a global
// floor is that symbols keep a LOWER floor than every other kind. BEAT 152
// raised that floor from two to three -- ordinary English words of two
// letters were reaching tickers -- but the carve-out itself is unchanged and
// is still what this file guards. If a later change quietly moves
// them onto the general floor, seventy b528 ticker prefixes stop resolving and
// the census advantage evaporates. RE1 guards that BY KIND rather than by
// naming a ticker that happens to survive: a symbol and a non-symbol of the
// SAME LENGTH are driven side by side, and the kinds must diverge.
//
// THE EXACT TIER STILL HAS NO FLOOR. A country ISO is two characters and is an
// exact key; it resolved before this change and must resolve after. Tier one
// was never floored and must not acquire one here.

import { describe, expect, it } from 'vitest'
import {
  resolveQuery,
  type ResolverVocabulary,
  SYMBOL_KIND,
  SYMBOL_PREFIX_FLOOR,
  PREFIX_FLOOR,
} from '../queryResolver'
import { emptyFilters } from '../tradesFilter'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const NOW = new Date('2026-08-22T15:00:00')

/** Built so that every probe below differs from its neighbour in exactly ONE
 *  way — the kind, or the length — and never in both at once. */
const BOOK: ResolverVocabulary = {
  symbols: ['NRVA'],
  regions: [],
  countries: [{ iso: 'US', name: 'United States' }],
  sectors: [],
  industries: [],
  playbooks: [],
  catalystTypes: [],
  mistakes: [{ axis: 'psychological', name: 'Overtrading badly' }],
} as unknown as ResolverVocabulary

const r = (text: string) => resolveQuery(text, BOOK, NOW, emptyFilters())
const SRC = readFileSync(resolve(__dirname, '..', 'queryResolver.ts'), 'utf8')

// --- RE1 : THE SYMBOL CARVE-OUT, GUARDED BY KIND -----------------------------

describe('RE1 symbols keep a LOWER floor than everything else, by KIND', () => {
  it('a THREE-letter SYMBOL prefix applies; two no longer does', () => {
    // REVERSED BY BEAT 152. WAS: expect(r('nr').state.symbol).toBe('NRVA') at a
    // symbol floor of two. Beat 152 moved that floor to three after measuring
    // "am" reaching AMIX and "be" reaching BESS from ordinary English.
    expect(r('nrv').state.symbol).toBe('NRVA')
    expect(r('nr').state.symbol).toBe('')
  })

  it('a two-letter NON-SYMBOL prefix of the SAME LENGTH does not', () => {
    // THIS is the by-kind assertion. One surviving ticker proves nothing on its
    // own -- it could survive because the floor moved for everyone. Two probes
    // of equal length and different kind, diverging, can only be the kind.
    expect(r('ov').state.mistakeKeys).toEqual([])
  })

  it('the shipped predicate keys the carve-out on the symbol kind', () => {
    // Behaviour alone would still pass if someone hard-coded the ticker's
    // length. The floor must be chosen BY KIND in the shipped source.
    const at = SRC.indexOf('e.key.startsWith(phrase)')
    expect(at, 'the prefix tier is gone').toBeGreaterThan(-1)
    // Slice back to the predicate's own arrow, not to the previous newline. A
    // one-line window measured the FORMATTING: the moment the predicate was
    // wrapped across lines it read only the indentation and went red on a
    // correct cure.
    const start = SRC.lastIndexOf('(e) =>', at)
    expect(start, 'the predicate has no arrow').toBeGreaterThan(-1)
    const predicate = SRC.slice(start, at)
    expect(predicate, 'the prefix floor no longer varies by kind').toContain('SYMBOL_KIND')
  })

  it('and the two floors are actually different, or there is no carve-out', () => {
    expect(SYMBOL_PREFIX_FLOOR).toBeLessThan(PREFIX_FLOOR)
    expect(SYMBOL_KIND).toBe(0)
  })
})

// --- RE2, RE3, RE4 : THE GENERAL FLOOR AND ITS BOUNDARY ----------------------

describe('RE2 a two-letter non-symbol prefix no longer matches', () => {
  it('"ov" reaches nothing', () => {
    expect(r('ov').state).toEqual(emptyFilters())
  })
})

describe('RE3 a three-letter non-symbol prefix no longer matches', () => {
  it('"ove" reaches nothing', () => {
    expect(r('ove').state).toEqual(emptyFilters())
  })
})

describe('RE4 four letters is the boundary, and it still matches', () => {
  it('"over" reaches the mistake', () => {
    // The boundary is asserted from the CONSTANT, not from the number four, so
    // moving the floor moves this probe with it rather than silently passing.
    expect('over'.length).toBe(PREFIX_FLOOR)
    expect(r('over').state.mistakeKeys).toEqual([
      { axis: 'psychological', name: 'Overtrading badly' },
    ])
  })
})

// --- RE5 : TIER ONE STILL HAS NO FLOOR ---------------------------------------

describe('RE5 an exact hit applies at any length and any kind', () => {
  it('a two-letter NON-SYMBOL exact key still applies', () => {
    // "us" is a country ISO: two characters, kind two, and an EXACT key. If the
    // general floor leaked into tier one this would stop resolving.
    expect(r('us').state.countries).toEqual(['US'])
  })

  it('the exact tier carries no length test in the shipped source', () => {
    const at = SRC.indexOf('(e) => e.key === phrase')
    expect(at, 'the exact tier is gone').toBeGreaterThan(-1)
    const line = SRC.slice(at, SRC.indexOf(String.fromCharCode(10), at))
    expect(line, 'tier one acquired a floor').not.toContain('length')
  })
})

// --- RE6 : THE CONSTANTS ARE THE SHIPPED ONES --------------------------------

/** Beat one hundred and twenty-nine shipped a guard that tested a copy of the
 *  answer instead of the shipped constant, and it passed while the feature was
 *  broken. These read the module. */
describe('RE6 the floors are named constants read from the module', () => {
  it('both are exported and numeric', () => {
    expect(typeof SYMBOL_PREFIX_FLOOR).toBe('number')
    expect(typeof PREFIX_FLOOR).toBe('number')
  })

  it('and the source declares them rather than inlining the numbers', () => {
    expect(SRC).toContain('export const SYMBOL_PREFIX_FLOOR')
    expect(SRC).toContain('export const PREFIX_FLOOR')
  })
})
