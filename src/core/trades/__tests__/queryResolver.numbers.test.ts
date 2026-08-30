// v0.2.7 — NUMBERS THE WAY PEOPLE SAY THEM.
//
// The value parser understood two forms: a bare number and a glued suffix.
// Everything else a trader actually types missed -- thousands separators, a
// spelled number, a unit word, a two-sided range. The previous beat taught the
// parser "million"; this one teaches it the rest, through the SAME path, so
// the spoken and the glued forms cannot disagree about what a number is.
//
// THE RULINGS these guards enforce:
//   ONE value parser. Every form extends the one the comparator beat built. A
//     second number path would let "1m" and "one million" drift apart.
//   An unparseable or genuinely AMBIGUOUS form is UNRESOLVED, never coerced.
//     "1,5" is a decimal comma in half the world and a broken thousands group
//     in the other half. The resolver does not get to pick: a wrong number
//     that runs is worse than a sentence that says it was not understood.
//   An EXACT vocabulary match still wins over a number word, and the word is
//     handed BACK rather than merely released -- the lesson from the beat
//     where dropping the claim still consumed the token.
//   Two-sided ranges fill min AND max on the EXISTING range field. The ask
//     does not grow.
//   The magnitude-of-loss law is untouched.
//
// STEP ZERO, measured before any of this was written: of the twenty-seven
// number words this beat teaches -- one through twenty, hundred, dollars,
// bucks, shares, percent, between, half -- ZERO collide with the five hundred
// and twenty-eight-trade book's vocabulary. No ticker, playbook, mistake or
// catalyst is named like a number. The exact-wins guard below is therefore
// CONSTRUCTED rather than observed, which is the honest way to guard a law
// that has no live example yet.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { applyTradesFilters, emptyFilters } from '../tradesFilter'

const NOW = new Date('2026-08-22T15:00:00')

const BOOK: ResolverVocabulary = {
  symbols: ['NRVA', 'ATRA', 'ATPC'],
  regions: ['USA', 'China', 'Hong Kong'],
  countries: [
    { iso: 'CN', name: 'China' },
    { iso: 'HK', name: 'Hong Kong' },
  ],
  sectors: ['Healthcare'],
  industries: ['Biotechnology'],
  playbooks: [{ id: 4, name: 'Micro Pullback', tier: 'A+' }],
  catalystTypes: ['Earnings'],
  mistakes: [
    { axis: 'technical', name: 'Float or RVOL criteria not met' },
    { axis: 'technical', name: 'Stop too wide / risk undefined' },
  ],
}

const r = (text: string, vocab: ResolverVocabulary = BOOK) => resolveQuery(text, vocab, NOW)
const ranges = (q: string, vocab: ResolverVocabulary = BOOK) => r(q, vocab).state.ranges

const CAMPAIGN =
  "show me the 10 stocks that I've lost money that are Chinese but not from Hong Kong"

// --- G1 ---------------------------------------------------------------------

describe('G1 thousands separators', () => {
  it('all three spellings of one million produce an IDENTICAL ask', () => {
    const glued = ranges('float under 1m')
    expect(ranges('float under 1,000,000'), 'the comma form disagrees').toEqual(glued)
    expect(ranges('float under 1 million'), 'the spoken form disagrees').toEqual(glued)
  })

  it('and that ask is one million', () => {
    expect(ranges('float under 1,000,000')).toEqual({
      float: { min: null, max: 1_000_000 },
    })
  })

  it('a shorter group works too', () => {
    expect(ranges('float under 500,000')).toEqual({ float: { min: null, max: 500_000 } })
  })

  it('nothing is left over as unresolved litter', () => {
    expect(r('float under 1,000,000').unresolved).toEqual([])
  })
})

// --- G2 ---------------------------------------------------------------------

describe('G2 the dollar sign', () => {
  it('"$10" parses as ten', () => {
    expect(ranges('net over $10')).toEqual({ net_pnl: { min: 10, max: null } })
  })

  it('"$1.5m" parses as one and a half million', () => {
    expect(ranges('market cap under $1.5m')).toEqual({
      market_cap: { min: null, max: 1_500_000 },
    })
  })

  it('a bare "$" is NOT a number', () => {
    const out = r('net over $')
    expect(out.state.ranges).toEqual({})
    expect(out.applied).toEqual([])
  })
})

// --- G3 ---------------------------------------------------------------------

describe('G3 spelled numbers', () => {
  it('"float under one million"', () => {
    expect(ranges('float under one million')).toEqual({
      float: { min: null, max: 1_000_000 },
    })
  })

  it('"net over ten"', () => {
    expect(ranges('net over ten')).toEqual({ net_pnl: { min: 10, max: null } })
  })

  it('"float over five hundred thousand"', () => {
    expect(ranges('float over five hundred thousand')).toEqual({
      float: { min: 500_000, max: null },
    })
  })

  it('"float under half a million" is five hundred thousand', () => {
    expect(ranges('float under half a million')).toEqual({
      float: { min: null, max: 500_000 },
    })
  })

  it('"net over twenty"', () => {
    expect(ranges('net over twenty')).toEqual({ net_pnl: { min: 20, max: null } })
  })

  it('the spelled form and the digit form agree exactly', () => {
    expect(ranges('float under one million')).toEqual(ranges('float under 1000000'))
  })
})

// --- G4 ---------------------------------------------------------------------

describe('G4 unit words', () => {
  it('"net over ten dollars" reads the value as ten', () => {
    expect(ranges('net over ten dollars')).toEqual({ net_pnl: { min: 10, max: null } })
  })

  it('"net over ten bucks" likewise', () => {
    expect(ranges('net over ten bucks')).toEqual({ net_pnl: { min: 10, max: null } })
  })

  it('"gain over fifty percent" equals "gain over 50%"', () => {
    expect(ranges('gain over fifty percent')).toEqual(ranges('gain over 50%'))
  })

  it('and that is fifty', () => {
    expect(ranges('gain over fifty percent')).toEqual({
      pnl_gain_pct: { min: 50, max: null },
    })
  })

  it('a unit word with NO number is unresolved', () => {
    const out = r('net over dollars')
    expect(out.state.ranges).toEqual({})
    expect(out.applied).toEqual([])
    expect(out.unresolved.join(' ')).toContain('dollars')
  })

  it('the unit word is consumed, not left as litter', () => {
    expect(r('net over ten dollars').unresolved).toEqual([])
  })
})

// --- G5 ---------------------------------------------------------------------

describe('G5 two-sided ranges', () => {
  it('"float between 1m and 5m" fills min AND max on ONE range', () => {
    expect(ranges('float between 1m and 5m')).toEqual({
      float: { min: 1_000_000, max: 5_000_000 },
    })
  })

  it('"float 1m to 5m" is the same ask', () => {
    expect(ranges('float 1m to 5m')).toEqual(ranges('float between 1m and 5m'))
  })

  it('the spoken form works too', () => {
    expect(ranges('float between one and five million')).toEqual({
      float: { min: 1_000_000, max: 5_000_000 },
    })
  })

  it('a "between" with ONE operand is UNRESOLVED, never a one-sided filter', () => {
    const out = r('float between 1m')
    expect(
      out.state.ranges,
      'half a range was shipped as if it were whole',
    ).toEqual({})
    expect(out.applied).toEqual([])
  })

  it('and the ask gains no new field -- it is the existing ranges map', () => {
    const out = r('float between 1m and 5m')
    expect(Object.keys(out.state)).toEqual(Object.keys(emptyFilters()))
  })
})

// --- G6 ---------------------------------------------------------------------

describe('G6 an ambiguous numeric form is never coerced', () => {
  it('"1,5" is unresolved -- decimal comma or broken group, and it does not pick', () => {
    const out = r('float under 1,5')
    expect(
      out.state,
      'an ambiguous number was coerced into a filter',
    ).toEqual(emptyFilters())
  })

  it('"1,00,000" is unresolved -- not a valid thousands grouping', () => {
    expect(r('float under 1,00,000').state).toEqual(emptyFilters())
  })

  it('neither applies anything at all', () => {
    expect(r('float under 1,5').applied).toEqual([])
    expect(r('float under 1,00,000').applied).toEqual([])
  })

  it('and the text comes back named rather than vanishing', () => {
    expect(r('float under 1,5').unresolved.join(' ')).toContain('1,5')
  })
})

// --- G7 ---------------------------------------------------------------------

describe('G7 an EXACT vocabulary match wins over a number word', () => {
  // CONSTRUCTED: step zero found no such collision on the real book, so the
  // law is guarded against a fixture rather than left untested until a user
  // names a setup "Ten".
  const NAMED: ResolverVocabulary = {
    ...BOOK,
    symbols: [...BOOK.symbols, 'TEN'],
  }

  it('the ticker named TEN keeps the word', () => {
    // REVERSED BY BEAT 152. WAS: the ticker APPLIED. It still WINS the word over the
    // number reading; the ask is discarded because the rest goes unread.
    expect(r('net over ten', NAMED).state.symbol).toBe('')
  })

  it('and no range is built from it', () => {
    expect(ranges('net over ten', NAMED).net_pnl).toBeUndefined()
  })

  it('while the same query on a book without that ticker reads the number', () => {
    expect(ranges('net over ten')).toEqual({ net_pnl: { min: 10, max: null } })
  })
})

// --- G8 ---------------------------------------------------------------------

describe('G8 the magnitude-of-loss law is unchanged', () => {
  it('"losers over 100" is net BELOW minus one hundred', () => {
    expect(r('losers over 100').state.ranges).toEqual({
      net_pnl: { min: null, max: -100 },
    })
  })

  it('"winners over 100" is net above plus one hundred', () => {
    expect(r('winners over 100').state.ranges).toEqual({
      net_pnl: { min: 100, max: null },
    })
  })

  it('and it holds for a SPELLED number too -- the new forms inherit the law', () => {
    expect(r('losers over one hundred').state.ranges).toEqual({
      net_pnl: { min: null, max: -100 },
    })
  })

  it('a bare money comparison with no outcome is still unresolved', () => {
    const out = r('over 100')
    expect(out.state.ranges).toEqual({})
    expect(out.unresolved.length).toBeGreaterThan(0)
  })
})

// --- G9 : THE POSITIVE CONTROLS ---------------------------------------------

describe('G9 every form that works today still works', () => {
  it('"float under 1m"', () => {
    expect(ranges('float under 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('"float under 1 million"', () => {
    expect(ranges('float under 1 million')).toEqual({
      float: { min: null, max: 1_000_000 },
    })
  })

  it('"rvol over 5x"', () => {
    expect(ranges('rvol over 5x')).toEqual({ rvol: { min: 5, max: null } })
  })

  it('"gain over 50%"', () => {
    expect(ranges('gain over 50%')).toEqual({ pnl_gain_pct: { min: 50, max: null } })
  })

  it('"market cap under 500m"', () => {
    expect(ranges('market cap under 500m')).toEqual({
      market_cap: { min: null, max: 500_000_000 },
    })
  })

  it('"under a float of 1m" -- the window still holds', () => {
    expect(ranges('under a float of 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('bare "float" now OFFERS its vocabulary reading', () => {
    // REVERSED BY BEAT ONE HUNDRED EIGHTY-FOUR, measured by beat one
    // hundred eighty-two. WAS: bare "float" APPLIED the mistake
    // "Float or RVOL criteria not met". It reaches that name as a whole
    // word at the FRONT, covering a fifth of it, so no boundary rule could
    // ever have caught it. Below the coverage floor the resolver now ASKS.
    expect(r('float').state.mistakeKeys).toHaveLength(0)
    expect(r('float').ambiguous).toHaveLength(1)
    expect(r('float').state.ranges).toEqual({})
  })

  it('the campaign sentence is unchanged', () => {
    // REVERSED BY BEAT 152. WAS: outcome losers and region China APPLIED. The
    // campaign sentence carries words the resolver cannot read, and a half-read
    // sentence now applies nothing.
    const out = r(CAMPAIGN)
    expect(out.state.outcome).toBe('all')
    expect(out.state.regions).toEqual([])
    // v0.2.7 — THREE now, not two: the limit beat taught the resolver that
    // "the 10" in this sentence is a row count. The sentence has said it all
    // along and it was unresolved until then.
    // v0.2.7 — FOUR now: the exclusion beat turned "but not from hong kong"
    // from an ignored phrase into an applied EXCLUSION. The sentence has meant
    // that from the first beat of the campaign; it is the last piece to land.
    // REVERSED BY BEAT 152. WAS: four applied lines. A discarded ask reports
    // nothing as applied, because nothing was.
    expect(out.applied).toHaveLength(0)
    // REVERSED BY BEAT 152. WAS: a limit of ten survived. Nothing survives a
    // discard, the limit included.
    expect(out.state.limit).toBe(null)
    expect(out.ambiguous).toEqual([])
  })

  // v0.2.7 — INVERTED IN PLACE, not deleted. The negation beat made this
  // REFUSE because the ask had no shape for an exclusion; this beat gave it
  // one, so the same phrase now EXCLUDES. What the guard protects is unchanged
  // -- the negated term must never be applied POSITIVELY -- and that half is
  // asserted explicitly below.
  it('negation now EXCLUDES rather than refusing', () => {
    const out = r('not china')
    expect(out.state.excludeRegions).toEqual(['China'])
    expect(out.state.regions, 'the negated term was applied positively').toEqual([])
  })
})

// --- RD : THE MINUS SIGN ----------------------------------------------------
//
// A SILENT DEFECT ON EVERY NUMERIC COLUMN. "vwap over -5" and "vwap over 5"
// produced BYTE-IDENTICAL state: min five, both times. Clean applied line,
// empty ignored clause, the mirror of the set the user asked for. Measured the
// same way on net_pnl, mae, daily_change_pct and r_multiple -- it was never
// about one column.
//
// WHERE IT DIED, and it is not the value parser. The TOKENISER strips leading
// characters that are neither word characters nor a dollar sign:
//
//     .map((t) => t.replace(/^[^\w$]+|[.,;:!?]+$/g, ''))
//
// so "-5" became "5" before any parser saw it. parseValue's own regex would
// have refused a minus anyway. Two sites, ONE rule: the tokeniser must stop
// destroying the character, and the value parser must read it. The sign
// SEMANTICS live in exactly one place -- parseValue -- and nothing else in the
// file decides what a minus means.
//
// THIS READS A SIGN THE USER WROTE. It does NOT infer one. The house rule
// stands untouched: a bare money comparison with no outcome is ambiguous and
// lands in unresolved, because the resolver does not guess a sign. Reading a
// minus somebody typed and inventing one they did not are opposite acts, and
// RD6 pins the second half so this beat cannot be mistaken for it later.
//
// WHY IT BLOCKS MORE THAN ITSELF: three of the app's seven indicator bands are
// BELOW zero -- "Below 9 EMA / broken trend < -0.5%" and its VWAP twin -- so
// no band phrase can land until a negative bound can be expressed at all.

/** Every numeric column where a negative value is MEANINGFUL, with the phrase
 *  that reaches it. Table-driven on purpose: six handled and one missed is
 *  this codebase's recurring shape, and a sign rule that works for vwap and
 *  not for mae is the same bug wearing a different column name. */
const RD_SIGNED: { phrase: string; col: string }[] = [
  { phrase: 'vwap', col: 'vwap_dist_pct' },
  { phrase: 'ema9', col: 'ema9_dist_pct' },
  { phrase: 'net', col: 'net_pnl' },
  { phrase: 'mae', col: 'mae' },
  { phrase: 'mfe', col: 'mfe' },
  { phrase: 'day change', col: 'daily_change_pct' },
  { phrase: 'price move', col: 'price_move_pct' },
  { phrase: 'gain', col: 'pnl_gain_pct' },
  { phrase: 'r multiple', col: 'r_multiple' },
]

// --- RD1 : A NEGATIVE MIN IS READ -------------------------------------------

describe('RD1 a negative lower bound survives, on every signed column', () => {
  it.each(RD_SIGNED)('$phrase over -5 is minus five, not five', ({ phrase, col }) => {
    expect(
      ranges(`${phrase} over -5`),
      `"${phrase} over -5" and "${phrase} over 5" produced the same ask`,
    ).toEqual({ [col]: { min: -5, max: null } })
  })
})

// --- RD2 : A NEGATIVE MAX IS READ -------------------------------------------

describe('RD2 a negative upper bound survives, on every signed column', () => {
  it.each(RD_SIGNED)('$phrase under -5 is minus five, not five', ({ phrase, col }) => {
    expect(ranges(`${phrase} under -5`)).toEqual({ [col]: { min: null, max: -5 } })
  })

  it('and a decimal negative survives too -- the band edges are at -0.5', () => {
    expect(ranges('vwap under -0.5')).toEqual({ vwap_dist_pct: { min: null, max: -0.5 } })
    expect(ranges('ema9 under -0.5')).toEqual({ ema9_dist_pct: { min: null, max: -0.5 } })
  })
})

// --- RD3 : THE BOUND REACHES THE ROWS ---------------------------------------

/** Distances chosen to straddle the -0.5 band edge and zero. A state assertion
 *  cannot tell a correct bound from a correctly-shaped empty one, so the rows
 *  are counted through the real engine. */
const RD_ROWS = [-9, -3, -0.6, -0.5, -0.4, 0, 0.4, 2, 6, 12].map((d, i) => ({
  id: i + 1,
  date: '2026-08-20',
  symbol: 'NRVA',
  side: 'long',
  is_open: false,
  open_time: '2026-08-20T13:30:00Z',
  close_time: '2026-08-20T13:40:00Z',
  net_pnl: 10,
  playbook_id: null,
  mistakes: [],
  mistakeTags: [],
  catalyst_type: null,
  region: null,
  country: null,
  sector: null,
  industry: null,
  tf_1m_vwap_dist_pct: d,
})) as unknown as Parameters<typeof applyTradesFilters>[0]

describe('RD3 the negative bound narrows the actual rows', () => {
  const countFor = (q: string) => applyTradesFilters(RD_ROWS, r(q).state).length

  it('"vwap under -0.5" keeps only the rows at or below minus a half', () => {
    // -9, -3, -0.6, -0.5 -> four. The +0.4 and 0 rows must NOT survive, which
    // is exactly what the sign-dropping bug let through.
    expect(countFor('vwap under -0.5')).toBe(4)
  })

  it('"vwap over -0.5" keeps the rest', () => {
    expect(countFor('vwap over -0.5')).toBe(7)
  })

  it('and the positive form is unaffected', () => {
    // 6 and 12 -> two.
    expect(countFor('vwap over 5')).toBe(2)
  })
})

// --- RD4 : THE DISCRIMINATING COMPANION -------------------------------------

describe('RD4 the positive forms are unchanged', () => {
  // Without this, RD1 and RD2 pass for a cure that negated every number.
  it.each(RD_SIGNED)('$phrase over 5 is still POSITIVE five', ({ phrase, col }) => {
    expect(
      ranges(`${phrase} over 5`),
      `"${phrase} over 5" came back negative -- the cure negates everything`,
    ).toEqual({ [col]: { min: 5, max: null } })
  })

  it('and the other number forms keep their sign', () => {
    expect(ranges('float under 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
    expect(ranges('float under 1 million')).toEqual({ float: { min: null, max: 1_000_000 } })
    expect(ranges('net over 100')).toEqual({ net_pnl: { min: 100, max: null } })
  })
})

// --- RD5 : THE MAGNITUDE-OF-LOSS LAW IS UNTOUCHED ---------------------------

describe('RD5 an outcome still flips the sign of a bare money comparison', () => {
  // The law lives at queryResolver.ts G4 and is asserted in the comparator
  // suite too -- that assertion is deliberately left exactly as it is:
  //     expect(r('losers over 100').state.ranges)
  //       .toEqual({ net_pnl: { min: null, max: -100 } })
  // This beat must not disturb it: G4 FLIPS a sign the user did not write,
  // which is a different act from READING one they did.
  it('"losers over 100" is still net below minus one hundred', () => {
    expect(r('losers over 100').state.ranges).toEqual({ net_pnl: { min: null, max: -100 } })
  })

  it('"winners over 100" is still net above one hundred', () => {
    expect(r('winners over 100').state.ranges).toEqual({ net_pnl: { min: 100, max: null } })
  })

  // THE INTERACTION, NAMED RATHER THAN RESOLVED. This beat made the minus
  // readable; G4 still flips a BARE money comparison under an outcome. Compose
  // them and the two rules multiply: "losers over -100" flips the bound AND
  // negates the value, so it lands on net P&L BELOW plus one hundred. That is
  // the literal composition and it is almost certainly not what the sentence
  // means to a trader.
  //
  // IT IS NOT FIXED HERE, deliberately. G4 is a founder-ruled law and changing
  // what it does to a written sign is a ruling, not a repair. What this beat
  // owes is to make the behaviour VISIBLE instead of leaving it to be
  // discovered, so the guard pins it exactly as measured and names the escape
  // hatch beside it.
  it('a written minus under an outcome composes with G4 -- measured, not endorsed', () => {
    expect(r('losers over -100').state.ranges).toEqual({ net_pnl: { min: null, max: 100 } })
    expect(r('losers under -100').state.ranges).toEqual({ net_pnl: { min: 100, max: null } })
  })

  it('and NAMING the column escapes the flip entirely', () => {
    // The moment a column is named, G4's bare-money branch does not run, so
    // the written sign survives untouched. This is the phrasing that does what
    // a trader typing a minus almost certainly wants.
    expect(r('losers net over -100').state.ranges).toEqual({ net_pnl: { min: -100, max: null } })
    expect(r('net over -100').state.ranges).toEqual({ net_pnl: { min: -100, max: null } })
  })
})

// --- RD6 : THE SIGN IS STILL NEVER GUESSED ----------------------------------

describe('RD6 a bare comparison with no column and no outcome still refuses', () => {
  // AN ABSENCE ASSERTION, so its ability to fire is proven by the presence
  // beside it: the SAME comparison with a column named DOES resolve. Without
  // that pair this guard would pass on a resolver that had stopped working.
  it('"over 100" applies nothing and says so', () => {
    const out = r('over 100')
    expect(out.state.ranges, 'the resolver guessed a sign for a bare comparison').toEqual({})
    expect(out.unresolved.join(' ')).toContain('over 100')
  })

  it('"under 100" likewise', () => {
    expect(r('under 100').state.ranges).toEqual({})
  })

  it('PROOF THE ABOVE CAN FIRE: the same comparison WITH a column resolves', () => {
    expect(r('net over 100').state.ranges).toEqual({ net_pnl: { min: 100, max: null } })
  })
})

// --- RD7 : A NEGATIVE WHERE ONE IS NONSENSE IS REFUSED ----------------------

describe('RD7 a negative never becomes a limit', () => {
  // Today "last -5" shows FIVE trades, because the minus was stripped before
  // the count was read. A limit of minus five is nonsense, so the correct
  // outcome is to refuse the count, not to negate it.
  it('"last -5" sets no limit at all', () => {
    expect(r('last -5').state.limit, 'a negative count became a positive limit').toBeNull()
  })

  it('a bare "-5" sets no limit either', () => {
    expect(r('-5').state.limit).toBeNull()
  })

  it('PROOF THE ABOVE CAN FIRE: the positive forms still limit', () => {
    // Without this pair, RD7 would pass on a resolver that had lost limits
    // entirely -- the same vacuity an earlier beat found in an absence guard.
    expect(r('last 5').state.limit).toBe(5)
    expect(r('5').state.limit).toBe(5)
  })

  it('and "top -5" still offers rather than limiting', () => {
    // NOTE, honestly: this one cannot fail today or after. The superlative
    // path never sets a limit, so the assertion is about the OTHER half --
    // that a negative does not turn a superlative into a filter. Kept for the
    // record, with its own vacuity stated rather than hidden.
    expect(r('top -5').state.limit).toBeNull()
  })
})
