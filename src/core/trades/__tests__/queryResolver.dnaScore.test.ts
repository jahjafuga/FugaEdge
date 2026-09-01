// BEAT 235 — THE FIVE-PILLAR SCORE BECOMES TYPEABLE.
//
// THE GAP, measured across beats 229 to 234: DnaFilterAsk carries two fields
// and only one of them was reachable from a sentence. DNA_WORDS holds exactly
// two keys, 'complete' and 'incomplete', and both write `bucket`. The word
// 'minScore' appeared ZERO times in the resolver. So a trader could type
// "incomplete" but had no sentence for "trades that met four of the five
// pillars" — that half of the ask was mouse-only, reachable through the
// dropdown at TradesFilters.tsx:683 and nowhere else.
//
// WHY A NEW PASS AND NOT AN ARM BESIDE DNA_WORDS. The DNA_WORDS arm lives in
// pass 2 (queryResolver.ts:1660). Pass 1b, the bare count (:1633), runs BEFORE
// it and claims any free digit as a row limit. An arm in pass 2 would therefore
// find "score 4" already stripped of its 4, with limit set to 4 — the exact
// collision the file records at :1626-1627 for "net over 100". So the score ask
// is read in its own pass in the window pass 1a occupies, after the comparisons
// and before the bare count, for the same reason pass 1a is there: it has to
// claim its number before anything can mistake it for a count.
//
// FLOOR ONLY, and the upper bound REFUSES BY NAME. The filter predicate at
// tradesFilter.ts:552 is `scored.passed < minScore` — a floor. There is no
// maxScore field anywhere in src/ (measured: 0 occurrences, against 40 for
// minScore), so an "at most" ask has nowhere to land. Inventing a field to hold
// it would be a bigger change than this beat, and applying it as a floor would
// answer the opposite question. It refuses, by name, following the shape the
// three existing refusals already use.
import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { emptyFilters } from '../tradesFilter'
import { scoreTradeDna, type DnaConfig } from '@/core/dna/adherence'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'
import type { CatalystDef } from '@shared/catalyst-types'

const NOW = new Date('2026-06-15T15:00:00Z')

/** Deliberately bare. Nothing here can collide with a digit or with the words
 *  under test, so any match is the resolver's own machinery rather than a book
 *  value winning on the user-vocabulary rule. */
const VOCAB: ResolverVocabulary = {
  symbols: ['HLPX'],
  regions: [],
  countries: [],
  sectors: [],
  industries: [],
  playbooks: [],
  catalystTypes: [],
  mistakes: [],
  macdStates: [],
}

const r = (q: string) => resolveQuery(q, VOCAB, NOW, emptyFilters())

describe('G1 the score ask reaches state.dna.minScore', () => {
  it('"score at least 4" sets minScore to four', () => {
    expect(r('score at least 4').state.dna.minScore).toBe(4)
  })

  it('and "dna at least 4" is the same ask by its alias', () => {
    expect(r('dna at least 4').state.dna.minScore).toBe(4)
  })

  it('the bucket is untouched — a score is not a completeness ask', () => {
    expect(r('score at least 4').state.dna.bucket).toBe('any')
  })

  it('and it says what it did, naming the score', () => {
    const out = r('score at least 4')
    expect(out.applied.join(' | ')).toMatch(/score.*4/i)
  })
})

describe('G2 the whole ask is read, and the digit is the score', () => {
  // WHY THIS CASE IS SHAPED THIS WAY, and it was measured rather than assumed.
  // The first draft of G2 asserted only that limit stays null, on the theory
  // that pass 1b would otherwise claim the digit. Driven against the shipped
  // resolver, limit was ALREADY null and the theory was wrong: the comparison
  // pass (:1430) fires on "least" from MIN_OPS, finds no column in its window
  // because 'score' is not a column phrase, and records a BARE BOUND. That
  // bound is pushed to unresolved at :2136 ("no outcome, no sign — never
  // guessed"), 'score' goes unread beside it, and the strict boundary at :2189
  // then discards the entire ask and returns inherited() — which is where the
  // null came from. A guard that reads green both before and after the cure,
  // for opposite reasons, measures nothing. So the assertion is the whole
  // outcome: nothing unread, a score named in applied, and no row limit.
  it('"score at least 4" leaves NOTHING unresolved', () => {
    expect(
      r('score at least 4').unresolved,
      'the ask was not fully read, so the discard at :2189 threw it away',
    ).toEqual([])
  })

  it('and it APPLIED a score rather than silently nothing', () => {
    const out = r('score at least 4')
    expect(out.applied, 'the ask applied nothing at all').not.toEqual([])
    expect(out.applied.join(' | ')).toMatch(/score/i)
  })

  it('and the digit did not become a row limit', () => {
    expect(
      r('score at least 4').state.limit,
      'the digit was taken for a row count',
    ).toBeNull()
  })

  it('PROOF THIS CAN FIRE: a bare digit with no score word IS still a limit', () => {
    // Without this, G2 would pass on a resolver that had lost limits entirely.
    expect(r('4').state.limit).toBe(4)
    expect(r('last 5').state.limit).toBe(5)
  })
})

describe('G3 an upper bound refuses by name rather than inverting', () => {
  it('"score under 3" applies no score at all', () => {
    expect(r('score under 3').state.dna.minScore).toBeNull()
  })

  it('and refuses in its own words rather than going unread', () => {
    const out = r('score under 3')
    expect(out.refusals ?? [], 'no refusal was raised').not.toEqual([])
    // NAMES THE THING, not the token the trader typed. That is the house
    // shape rather than a preference: DNA_REFUSAL says "five pillar verdict"
    // and never "dna"; LIMIT_REFUSAL says "a set number of trades" and never
    // "limit". This assertion first demanded the word "score" back and was
    // wrong for that reason, not because the refusal was missing.
    expect((out.refusals ?? []).join(' ')).toMatch(/pillar/i)
    // and it says WHICH HALF it can do, so the trader knows to invert the ask
    expect((out.refusals ?? []).join(' ')).toMatch(/at least/i)
  })

  it('the refusal is not a silent drop: nothing else was applied either', () => {
    expect(r('score under 3').state.limit).toBeNull()
  })

  it('PROOF THIS CAN FIRE: the floor direction still applies', () => {
    expect(r('score at least 3').state.dna.minScore).toBe(3)
  })
})

// ─── G4 : A SCORE ABOVE THE CEILING IS REFUSED, NOT APPLIED ─────────────────

describe('G4 a score above the ceiling refuses rather than emptying the book', () => {
  // THE CEILING IS FIVE, and it is a fact about the CODE rather than about a
  // trader's settings: DnaPillarKey (adherence.ts:98) has exactly five members,
  // 'price' | 'change' | 'rvol' | 'float' | 'catalyst', so `of` can never
  // exceed five for any profile. Whether a GIVEN trader's profile requires all
  // five is dna_require_catalyst, which lives in settings and which the
  // resolver never reads — so the refusal names the five that exist and does
  // not claim to know how many this trader demands.
  //
  // Without this, "score at least 6" applied 6, matched nothing, and returned
  // an empty book with no explanation. Applying a bound nothing can satisfy is
  // the same silent wrong as coercing one.
  const CONFIG: DnaConfig = {
    dna_price_min: 2,
    dna_price_max: 20,
    dna_change_min: 10,
    dna_rvol_min: 5,
    dna_float_min: 0,
    dna_float_max: 20_000_000,
    dna_require_catalyst: true,
  }
  const def = (id: number, name: string, kind: CatalystDef['kind']): CatalystDef => ({
    id, name, sort_position: id, is_custom: false, is_archived: false, kind,
  })
  const DEFS = [def(1, 'News / PR', 'news')]

  it('TIES THE CONSTANT TO THE CODE: the most any trade can score is five', () => {
    // The resolver holds the ceiling as a literal, because DnaPillarKey is a
    // TYPE and cannot be counted at runtime. This is the cross-check that stops
    // that literal drifting: if a sixth pillar were ever added, `of` would read
    // six here and this case would fail, naming the constant that needs moving.
    const s = scoreTradeDna(
      makeTrade({
        side: 'long', avg_buy_price: 5, daily_change_pct: 12, rvol: 6,
        float_shares: 10_000_000, catalyst_type: 'News / PR',
      } as never) as TradeListRow,
      CONFIG,
      DEFS,
    )
    expect(s.kind).toBe('scored')
    expect(s.kind === 'scored' ? s.of : null, 'the pillar ceiling moved').toBe(5)
  })

  it('"score at least 6" applies no score at all', () => {
    expect(r('score at least 6').state.dna.minScore).toBeNull()
  })

  it('and refuses by name rather than emptying the book in silence', () => {
    const out = r('score at least 6')
    expect(out.refusals ?? [], 'no refusal was raised').not.toEqual([])
    expect((out.refusals ?? []).join(' ')).toMatch(/pillar/i)
  })

  it('and the ask is not left unread either', () => {
    // A refusal consumes its span. If it did not, the strict boundary at :2189
    // would discard the whole sentence and the refusal would never be shown.
    expect(r('score at least 6').unresolved).toEqual([])
  })

  it('G4b BOUNDARY: "score at least 5" is AT the ceiling and still applies', () => {
    expect(r('score at least 5').state.dna.minScore, 'the cure over-reached by one').toBe(5)
    expect(r('score at least 5').refusals ?? []).toEqual([])
  })

  it('G4c CONTROL: "score at least 4" is untouched by any of this', () => {
    expect(r('score at least 4').state.dna.minScore).toBe(4)
    expect(r('score at least 4').refusals ?? []).toEqual([])
  })
})
