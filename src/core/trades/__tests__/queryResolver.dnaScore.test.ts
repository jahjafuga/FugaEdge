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
import { applyTradesFilters, emptyFilters, SCORE_CEILING } from '../tradesFilter'
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

describe('G3 an upper bound APPLIES, where it once refused', () => {
  // A RULING CHANGED HANDS, AND THESE CASES ARE ITS RECORD.
  //
  // The beat that first made the score typeable had nowhere to put an upper
  // bound: DnaFilterAsk carried minScore and nothing else, and the filter
  // predicate was a floor. So "score under 3" REFUSED, by name, and the three
  // cases here asserted that refusal. That was the honest answer available at
  // the time, not a placeholder.
  //
  // This beat gave the ask a maxScore, so the refusal became the wrong answer
  // to a question the app can now answer. The cases are rewritten rather than
  // deleted: what they pin is the same seam, and the file should carry the
  // change rather than lose it.
  //
  // The ONE refusal that survives on this direction is the ceiling, and it has
  // its own sentence -- see H5 and the dead-zone case below.
  it('"score under 3" applies a maximum rather than refusing', () => {
    expect(r('score under 3').state.dna.maxScore).toBe(3)
    expect(r('score under 3').refusals ?? []).toEqual([])
  })

  it('and it says what it did, naming the score', () => {
    expect(r('score under 3').applied.join(' | ')).toMatch(/score.*3/i)
  })

  it('the ask is fully read, so the strict boundary cannot discard it', () => {
    expect(r('score under 3').unresolved).toEqual([])
    expect(r('score under 3').state.limit).toBeNull()
  })

  it('PROOF THIS CAN FIRE: the floor direction still applies, untouched', () => {
    expect(r('score at least 3').state.dna.minScore).toBe(3)
    expect(r('score at least 3').state.dna.maxScore).toBeNull()
  })
})

// ─── H : THE UPPER DIRECTION ────────────────────────────────────────────────

describe('H the maximum is a real ask, mirrored from the minimum', () => {
  // THE MIN SIDE IS INCLUSIVE, measured rather than assumed: "over 4",
  // "above 4", "greater than 4" and "at least 4" all produce minScore 4 and
  // all log "at least 4". So the max side is inclusive too -- "under 3" keeps
  // trades that passed three, not only two.
  it('H1 "score under 3" sets maxScore and applies', () => {
    const out = r('score under 3')
    expect(out.state.dna.maxScore).toBe(3)
    expect(out.applied, 'the ask applied nothing').not.toEqual([])
  })

  it('H1b the three spellings of the upper bound agree exactly', () => {
    const a = r('score under 3').state.dna
    expect(r('score below 3').state.dna).toEqual(a)
    expect(r('score at most 3').state.dna).toEqual(a)
  })

  it('H2 an UNSCORED row is DROPPED by a max ask, not kept', () => {
    // THE WHOLE QUESTION, and it was measured before it was written. A row
    // nobody scored is not a low score. The min test drops it through its
    // `!scored ||` clause; the max test REPEATS that clause rather than
    // inverting it. Written as the naive mirror -- `scored && passed > max` --
    // an unscored row survives, and the app would be saying "this trade
    // passed at most three" about a trade it never judged.
    const scored = (passed: number, id: number) =>
      ({ ...makeTrade({ id, symbol: `S${passed}` }), dna: { kind: 'scored', passed, of: SCORE_CEILING } }) as TradeListRow
    const book: TradeListRow[] = [
      scored(1, 1),
      scored(5, 2),
      makeTrade({ id: 99, symbol: 'UNSC' }) as TradeListRow,
    ]
    const state = r('score under 3').state
    const kept = applyTradesFilters(book, state).map((t) => t.id)
    expect(kept, 'the unscored row survived a max ask').toEqual([1])
  })

  it('H3 a floor and a ceiling compose in one sentence', () => {
    const out = r('score at least 2 score under 4')
    expect(out.state.dna.minScore).toBe(2)
    expect(out.state.dna.maxScore).toBe(4)
    expect(out.unresolved).toEqual([])
  })

  it('H4 CONTROL: a lone floor is untouched by any of this', () => {
    const d = r('score at least 4').state.dna
    expect(d.minScore).toBe(4)
    expect(d.maxScore).toBeNull()
    expect(r('score at least 4').refusals ?? []).toEqual([])
  })

  it('H5 the ceiling refusal still fires on a floor above the ceiling', () => {
    const out = r(`score at least ${SCORE_CEILING + 1}`)
    expect(out.state.dna.minScore).toBeNull()
    expect((out.refusals ?? []).join(' ')).toMatch(/pillar/i)
  })

  it('H6 a ceiling ABOVE the ceiling refuses, in its own words', () => {
    // MEASURED: at any max at or above the pillar count every scored trade
    // survives, so a bar above it excludes no trade at all. That is a
    // different wrong from the floor's -- one empties the list, this one
    // leaves it whole -- so it gets its own sentence rather than reusing one
    // that would describe the opposite outcome.
    const out = r(`score under ${SCORE_CEILING + 1}`)
    expect(out.state.dna.maxScore).toBeNull()
    expect(out.refusals ?? [], 'no refusal was raised').not.toEqual([])
    expect((out.refusals ?? []).join(' ')).toMatch(/pillar/i)
  })

  it('H6b BOUNDARY: a ceiling AT the pillar count still applies', () => {
    expect(
      r(`score under ${SCORE_CEILING}`).state.dna.maxScore,
      'the refusal over-reached by one',
    ).toBe(SCORE_CEILING)
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

// ─── J : A FLOOR ABOVE A CEILING IS NOT A FILTER ────────────────────────────

describe('J a contradictory pair refuses rather than applying both', () => {
  // Both halves of the ask are individually legal, and together they select
  // nothing at all: no trade passed at least four AND at most two. Applying
  // both hands back an empty list with nothing said, which is the same silent
  // wrong the ceiling refusal exists to prevent -- reached by composition
  // rather than by a single number.
  //
  // EQUAL IS NOT CONTRADICTORY. "at least four, at most four" means exactly
  // four passed, which is a real and useful ask. Only a floor STRICTLY above
  // a ceiling is impossible.
  it('J1 "score at least 4 score under 2" applies NEITHER bound', () => {
    const out = r('score at least 4 score under 2')
    expect(out.state.dna.minScore, 'the floor was applied anyway').toBeNull()
    expect(out.state.dna.maxScore, 'the ceiling was applied anyway').toBeNull()
    expect(out.unresolved).toEqual([])
    const said = (out.refusals ?? []).join(' ')
    expect(out.refusals ?? [], 'no refusal was raised').not.toEqual([])
    expect(said, 'the refusal does not name both numbers').toMatch(/4/)
    expect(said).toMatch(/2/)
  })

  it('J2 the reverse order gives the IDENTICAL state', () => {
    // Order must not change the answer. Whichever bound arrives second is the
    // one that discovers the contradiction, so the clearing has to reach back
    // to the one already set.
    expect(r('score under 2 score at least 4').state.dna).toEqual(
      r('score at least 4 score under 2').state.dna,
    )
    expect(r('score under 2 score at least 4').refusals ?? []).toEqual(
      r('score at least 4 score under 2').refusals ?? [],
    )
  })

  it('J3 CONTROL: a satisfiable pair still applies both', () => {
    const out = r('score at least 2 score under 5')
    expect(out.state.dna.minScore).toBe(2)
    expect(out.state.dna.maxScore).toBe(5)
    expect(out.refusals ?? []).toEqual([])
  })

  it('J5 the refusal WITHDRAWS what the first half already claimed', () => {
    // FOUND BY DRIVING, not by reading. The state was right -- both bounds
    // null -- but `applied` still read "dna score at least 4", because the
    // floor logged its line before the ceiling arrived to see the
    // contradiction. The app would have announced a bound and refused it in
    // the same breath, which is the exact shape of untruth this campaign is
    // about: a sentence that does not match the filter it describes.
    const forward = r('score at least 4 score under 2')
    expect(
      forward.applied.filter((l) => /dna score at (least|most)/.test(l)),
      'the app claims a bound it cleared',
    ).toEqual([])
    const reverse = r('score under 2 score at least 4')
    expect(
      reverse.applied.filter((l) => /dna score at (least|most)/.test(l)),
      'the same leak from the other direction',
    ).toEqual([])
  })

  it('J5b CONTROL: a satisfiable pair still announces BOTH bounds', () => {
    // Without this, J5 passes on a resolver that stopped announcing the score
    // at all -- silence is not honesty.
    expect(
      r('score at least 2 score under 4').applied.filter((l) =>
        /dna score at (least|most)/.test(l),
      ).length,
      'the satisfiable pair went quiet',
    ).toBe(2)
  })

  it('J5c CONTROL: the withdrawal takes only the score line', () => {
    // A splice on a parallel array is easy to get wrong by one. This proves
    // an unrelated filter in the same sentence is still announced, and that
    // the two arrays stayed aligned.
    const out = r('losers score at least 4 score under 2')
    expect(out.applied, 'an unrelated filter was withdrawn too').toContain('outcome losers')
    expect(out.appliedSources.length, 'the parallel arrays came apart').toBe(out.applied.length)
  })

  it('J4 EQUAL is satisfiable: it means exactly that many passed', () => {
    const out = r('score at least 4 score under 4')
    expect(out.state.dna.minScore, 'equal bounds were refused').toBe(4)
    expect(out.state.dna.maxScore, 'equal bounds were refused').toBe(4)
    expect(out.refusals ?? []).toEqual([])
  })
})

// ─── L : A BUCKET OF UNSCORED ROWS AND A BOUND ON THE SCORE ─────────────────
//
// MEASURED FIRST, on a book of one row per attainable score plus one nobody
// scored: all 15 incomplete-plus-bound cells keep ZERO rows. Not some -- all,
// including a floor of nought, because the unscored row fails the `!scored`
// clause at every bound in both directions. The three controls that would
// have caught a broken driver held: complete-plus-ceiling keeps 4, the bucket
// alone keeps 1, the ceiling alone keeps 4.
//
// THIS PREDATES THE UPPER DIRECTION. The floor half has shipped since the
// score first became typeable and is live on main; the ceiling half arrived
// with it. Both are closed here, which is why L2 matters as much as L1.

describe('L an unscored bucket and a score bound cannot both hold', () => {
  it('L0 the bound these cases use is strictly inside the range', () => {
    // THE CASES BELOW USE 3 AS AN ORDINARY BOUND, and it must stay a literal:
    // it is not the ceiling, and L4 needs a bound that KEEPS rows. Writing it
    // as SCORE_CEILING would make L4 assert something else entirely. What
    // does follow the constant is the assumption -- if the ceiling ever drops
    // to three or below, every case here goes vacuous and this one goes red
    // first, which is the part that would otherwise pass silently.
    expect(3, 'the bound used below is no longer inside the range').toBeLessThan(SCORE_CEILING)
  })

  it('L1 "incomplete score under 3" refuses and applies NEITHER', () => {
    const out = r('incomplete score under 3')
    expect(out.state.dna.maxScore, 'the ceiling was applied anyway').toBeNull()
    expect(out.state.dna.bucket, 'the bucket was applied anyway').toBe('any')
    expect(out.unresolved).toEqual([])
    expect(out.refusals ?? [], 'no refusal was raised').not.toEqual([])
    // NAMES THE THING, not the token. The house shape: DNA_REFUSAL says
    // "five pillar verdict" and never "dna".
    expect((out.refusals ?? []).join(' ')).toMatch(/score/i)
  })

  it('L2 "incomplete score at least 3" does the same -- the OLDER half', () => {
    const out = r('incomplete score at least 3')
    expect(out.state.dna.minScore, 'the floor was applied anyway').toBeNull()
    expect(out.state.dna.bucket, 'the bucket was applied anyway').toBe('any')
    expect(out.unresolved).toEqual([])
    expect(out.refusals ?? [], 'no refusal was raised').not.toEqual([])
  })

  it('L3 order does not change the answer', () => {
    expect(r('score under 3 incomplete').state.dna).toEqual(
      r('incomplete score under 3').state.dna,
    )
    expect(r('score under 3 incomplete').refusals ?? []).toEqual(
      r('incomplete score under 3').refusals ?? [],
    )
  })

  it('L4 CONTROL: "complete score under 3" still applies BOTH', () => {
    // The table says complete-plus-ceiling keeps four rows. It is a real ask
    // and must survive untouched, or the refusal has over-reached.
    const out = r('complete score under 3')
    expect(out.state.dna.maxScore).toBe(3)
    expect(out.state.dna.bucket).toBe('complete')
    expect(out.refusals ?? []).toEqual([])
  })

  it('L5 CONTROL: "incomplete" alone still applies the bucket', () => {
    const out = r('incomplete')
    expect(out.state.dna.bucket).toBe('incomplete')
    expect(out.state.dna.minScore).toBeNull()
    expect(out.state.dna.maxScore).toBeNull()
    expect(out.refusals ?? []).toEqual([])
  })

  it('L6 the applied lines name no clause that was then cleared', () => {
    // THE J5 CLASS, which no guard caught until beat 245 drove a phrase by
    // hand. The bound logs its line in pass 1c, before pass 2 can see the
    // bucket, so clearing the state alone leaves the app announcing a filter
    // it just withdrew.
    for (const q of ['incomplete score under 3', 'incomplete score at least 3',
                     'score under 3 incomplete']) {
      const out = r(q)
      expect(
        out.applied.filter((l) => /^dna (score|complete|incomplete)/.test(l)),
        `${q} announced a clause it cleared`,
      ).toEqual([])
    }
  })

  it('L7 an INHERITED incomplete bucket refuses a newly typed bound', () => {
    // THE OTHER DIRECTION, and it is reachable. Pass 1c runs before pass 2,
    // so when both are typed the bucket is always second -- but the base
    // state is the live filter, and the panel can hold an incomplete bucket
    // on its own. Click Incomplete, then type "score under 3", and the bound
    // is the half that arrives second. A cure written only in the bucket pass
    // would let this one through.
    const base = { ...emptyFilters(), dna: { minScore: null, maxScore: null, bucket: 'incomplete' as const } }
    const out = resolveQuery('score under 3', VOCAB, NOW, base)
    expect(out.state.dna.maxScore, 'the ceiling was applied onto an unscored bucket').toBeNull()
    expect(out.state.dna.bucket, 'the standing bucket was left contradicting it').toBe('any')
    expect(out.refusals ?? [], 'no refusal was raised').not.toEqual([])
    expect(
      out.applied.filter((l) => /^dna (score|complete|incomplete)/.test(l)),
      'a cleared clause was announced',
    ).toEqual([])
  })

  it('L7b CONTROL: an inherited COMPLETE bucket accepts the same bound', () => {
    const base = { ...emptyFilters(), dna: { minScore: null, maxScore: null, bucket: 'complete' as const } }
    const out = resolveQuery('score under 3', VOCAB, NOW, base)
    expect(out.state.dna.maxScore).toBe(3)
    expect(out.state.dna.bucket).toBe('complete')
    expect(out.refusals ?? []).toEqual([])
  })
})

// ─── N : A NEGATED SCORE ASK REFUSES RATHER THAN INVERTING ──────────────────
//
// MEASURED FIRST, and it is the whole argument. On a book of one row per
// attainable score plus one row nobody scored and one row scored incomplete,
// a floor of four keeps two rows and a ceiling of three keeps four. Together
// they cover six of eight. The two rows with no verdict fall outside BOTH
// directions, so reading "not at least four" as "at most three" would drop
// them in silence -- the same wrong the other four refusals exist to remove.
//
// WHY THE ASK REACHED NOTHING BEFORE. The bound was never the problem: pass 1c
// read "score at least 4" and consumed it. The bare negator beside it had no
// term to govern, because isStateWord did not list SCORE_WORDS, so it fell
// through unclaimed into unresolved -- and the strict partial-application
// boundary then threw the WHOLE sentence away. The trader was told the app
// could not read "not".
//
// A SPAN-WIDTH SWEEP GATED THIS. Adding SCORE_WORDS to isStateWord widens what
// a negator claims in every sentence, so 229 asks were driven through both
// builds: four moved, all four score asks, zero non-score asks.

describe('N a negated score ask refuses by name', () => {
  it('N1 "not score at least 4" refuses, applies nothing, reads everything', () => {
    const out = r('not score at least 4')
    expect(out.state.dna.minScore, 'the floor was applied anyway').toBeNull()
    expect(out.state.dna.maxScore, 'the bar was inverted rather than refused').toBeNull()
    expect(out.unresolved, 'part of the ask went unread').toEqual([])
    expect(out.refusals ?? [], 'no refusal was raised').not.toEqual([])
    // NAMES THE THING, not the token. The house shape.
    expect((out.refusals ?? []).join(' ')).toMatch(/scored/i)
  })

  it('N2 "not score under 3" refuses the other direction the same way', () => {
    const out = r('not score under 3')
    expect(out.state.dna.maxScore, 'the ceiling was applied anyway').toBeNull()
    expect(out.state.dna.minScore, 'the bar was inverted rather than refused').toBeNull()
    expect(out.unresolved).toEqual([])
    expect(out.refusals ?? []).not.toEqual([])
  })

  it('N3 the dna alias refuses identically', () => {
    expect(r('not dna at least 4').refusals ?? []).toEqual(r('not score at least 4').refusals ?? [])
    expect(r('not dna at least 4').state.dna).toEqual(r('not score at least 4').state.dna)
  })

  it('N4 the refusal is local: an unrelated filter beside it still applies', () => {
    // A refusal that took the whole sentence with it would be the strict
    // discard wearing a different hat.
    const out = r('not score at least 4, losers')
    expect(out.state.outcome, 'the rest of the sentence was thrown away').toBe('losers')
    expect(out.state.dna.minScore).toBeNull()
    expect(out.refusals ?? []).not.toEqual([])
    expect(out.unresolved).toEqual([])
  })

  it('N5 CONTROL: the POSITIVE ask is untouched', () => {
    const out = r('score at least 4')
    expect(out.state.dna.minScore).toBe(4)
    expect(out.refusals ?? []).toEqual([])
    expect(out.applied.join(' | ')).toMatch(/at least 4/)
  })

  it('N6 CONTROL: "not complete" still refuses in ITS OWN words', () => {
    // Two different wrongs, two different sentences. The bucket refusal says
    // the verdict is derived rather than stored; this one says the unscored
    // rows fall outside both directions. Sharing a sentence would make one of
    // them a small untruth.
    const bucket = (r('not complete').refusals ?? []).join(' ')
    const score = (r('not score at least 4').refusals ?? []).join(' ')
    expect(bucket, 'the bucket refusal stopped firing').not.toEqual('')
    expect(score, 'the score refusal stopped firing').not.toEqual('')
    expect(bucket, 'the two refusals collapsed into one sentence').not.toEqual(score)
  })

  it('N6b EVERY refusal this module can say is a DIFFERENT sentence', () => {
    // FOUND BY A PLANT THAT REDDENED NOTHING. U3 swapped the negated arm onto
    // the BUCKET refusal, and N6 stayed green because it compared against
    // "not complete" -- which emits DNA_REFUSAL, a third string that differs
    // from both. The collision U3 creates is with the bucket-and-bound
    // sentence, reached by a phrase N6 never drove.
    //
    // SOURCED FROM BEHAVIOUR, not from a hand-written list of constants: one
    // phrase per refusal, driven, and the sentences must be pairwise
    // distinct. A future refusal that quietly reused an existing sentence
    // fails here without anyone remembering to add it to a list.
    const said = (q: string) => (r(q).refusals ?? []).join(' ')
    const sentences = [
      said('not complete'),
      said('incomplete score under 3'),
      said(`score at least ${SCORE_CEILING + 1}`),
      said(`score under ${SCORE_CEILING + 1}`),
      said('score at least 4 score under 2'),
      said('not score at least 4'),
    ]
    // every one of them actually fired, or the distinctness is vacuous
    expect(sentences.filter((x) => x === ''), 'a refusal stopped firing').toEqual([])
    expect(new Set(sentences).size, 'two refusals share one sentence').toBe(sentences.length)
  })

  it('N7 CONTROL: negation elsewhere is unchanged', () => {
    expect(r('not HLPX').state.excludeSymbols).toEqual(['HLPX'])
    expect(r('not losers').state.excludeOutcomes).toEqual(['losers'])
    expect(r('not HLPX').refusals ?? []).toEqual([])
  })

  it('N8 the applied lines name no clause that was then refused', () => {
    // THE J5 CLASS. The refusal must not announce a bound it declined to set.
    for (const q of ['not score at least 4', 'not score under 3', 'not dna at least 4',
                     'not score at least 4, losers']) {
      expect(
        r(q).applied.filter((l) => /^dna score at (least|most)/.test(l)),
        `${q} announced a bound it refused`,
      ).toEqual([])
    }
  })

  it('N9 CONTROL: "not score" with no bound applies nothing either', () => {
    // A bare negated score word carries NO bound to refuse. This case pins
    // the invariant that survives whatever the unread text turns out to be:
    // nothing is applied and no bound is set. The exact unresolved wording is
    // reported in the verdict rather than frozen here, because this beat is
    // not about that sentence.
    const out = r('not score')
    expect(out.state.dna.minScore).toBeNull()
    expect(out.state.dna.maxScore).toBeNull()
    expect(out.state.dna.bucket).toBe('any')
    expect(out.applied.filter((l) => l.startsWith('dna '))).toEqual([])
  })

  it('N10 the refusal follows the ceiling, not a literal', () => {
    // A bound ABOVE the ceiling, negated, must still land on ONE refusal --
    // whichever fires first -- and never apply. Written against the constant
    // so it follows if the ceiling moves.
    const out = r(`not score at least ${SCORE_CEILING + 1}`)
    expect(out.state.dna.minScore).toBeNull()
    expect(out.refusals ?? [], 'no refusal was raised').not.toEqual([])
  })
})
