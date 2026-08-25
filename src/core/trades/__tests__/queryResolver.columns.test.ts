// v0.2.7 — THE COLUMNS PEOPLE NAME.
//
// Seven filterable columns had no spoken phrase at all: the two price columns,
// the price move, the first entry, risk per share, days since catalyst, and
// the distance from the nine EMA. A trader could sort and see them, and could
// never ask for them. "under ten dollars" -- the sentence that started this
// campaign -- had nothing to reach.
//
// THE RULINGS these guards enforce:
//   A BARE price means ENTRY price. Exit is reachable, explicitly, by naming
//     it. The applied line always names the column it chose, so the reader
//     sees which one they got rather than guessing.
//   LONGEST column phrase wins. "risk per share" beats "risk"; "day change"
//     beats any fragment of it. A shorter phrase silently swallowing a longer
//     one is the defect class this whole campaign exists to kill, and the
//     guard asserts the WRONG column is ABSENT rather than merely that the
//     right one is present.
//   Every newly reachable column takes the FULL grammar -- over, under, at
//     least, at most, and two-sided. Composition is asserted per column, not
//     assumed.
//   A percent column reads a bare number identically to number-plus-percent,
//     and the guard asserts EQUALITY between the two asks.
//   EXACT vocabulary still beats a column phrase, and the word is handed back.
//
// STEP ZERO, measured on the working book before any of this was written:
// eight of these words already resolve to vocabulary -- entry, bought, lost,
// moved, catalyst, risk, per, first -- and "move" is ambiguous between two
// mistakes. That is EXPECTED and stays: a bare column phrase keeps its
// vocabulary reading, because a column with no operator and no value is not a
// filter. What changes is only what happens when a comparator is in the
// window. "lost" in particular must keep reaching OUTCOME, not a range.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'

const NOW = new Date('2026-08-22T15:00:00')

const BOOK: ResolverVocabulary = {
  symbols: ['NRVA', 'ATRA', 'ATPC'],
  regions: ['USA', 'China', 'Hong Kong'],
  countries: [
    { iso: 'CN', name: 'China' },
    { iso: 'HK', name: 'Hong Kong' },
  ],
  sectors: ['Healthcare'],
  industries: ['Personal Products & Services'],
  playbooks: [
    { id: 4, name: 'Micro Pullback', tier: 'A+' },
    { id: 5, name: 'First Pullback to VWAP', tier: 'B' },
  ],
  catalystTypes: ['Earnings', 'Technical / No Catalyst'],
  mistakes: [
    { axis: 'technical', name: 'Float or RVOL criteria not met' },
    { axis: 'technical', name: 'Stop too wide / risk undefined' },
    { axis: 'technical', name: 'MACD negative at entry' },
    { axis: 'technical', name: 'Bought into resistance / HOD overhead' },
  ],
}

const r = (text: string, vocab: ResolverVocabulary = BOOK) => resolveQuery(text, vocab, NOW)
const ranges = (q: string, vocab: ResolverVocabulary = BOOK) => r(q, vocab).state.ranges

const CAMPAIGN =
  "show me the 10 stocks that I've lost money that are Chinese but not from Hong Kong"

// --- G1 ---------------------------------------------------------------------

describe('G1 a bare price is the ENTRY price', () => {
  it('the three spellings produce an IDENTICAL ask', () => {
    const a = ranges('price under ten dollars')
    expect(ranges('price under $10'), 'the dollar-sign form disagrees').toEqual(a)
    expect(ranges('entry under ten'), 'the entry form disagrees').toEqual(a)
  })

  it('and that ask is the entry column at ten', () => {
    expect(ranges('price under ten dollars')).toEqual({ avg_buy: { min: null, max: 10 } })
  })

  it('the applied line NAMES the column, so the reader sees which one they got', () => {
    expect(r('price under ten dollars').applied.join(' ')).toMatch(/avg_buy/)
  })

  it('"cost" and "paid" reach it too', () => {
    expect(ranges('cost under ten')).toEqual({ avg_buy: { min: null, max: 10 } })
    expect(ranges('paid under ten')).toEqual({ avg_buy: { min: null, max: 10 } })
  })
})

// --- G2 ---------------------------------------------------------------------

describe('G2 the exit price is reachable by naming it', () => {
  it('"exit price under ten" reaches the exit column', () => {
    expect(ranges('exit price under ten')).toEqual({ avg_sell: { min: null, max: 10 } })
  })

  it('"sold above five" reaches it too', () => {
    expect(ranges('sold above five')).toEqual({ avg_sell: { min: 5, max: null } })
  })

  it('"sell price" likewise', () => {
    expect(ranges('sell price under ten')).toEqual({ avg_sell: { min: null, max: 10 } })
  })

  it('and the exit ask is NOT the entry ask', () => {
    expect(ranges('exit price under ten')).not.toEqual(ranges('price under ten'))
  })

  it('the entry column is absent from an exit ask', () => {
    expect(ranges('exit price under ten').avg_buy).toBeUndefined()
  })
})

// --- G3 ---------------------------------------------------------------------

describe('G3 LONGEST wins -- risk per share is not stolen by risk', () => {
  it('"risk per share over one" applies risk per share', () => {
    expect(ranges('risk per share over one')).toEqual({
      risk_per_share: { min: 1, max: null },
    })
  })

  it('and TOTAL RISK is ABSENT -- the shorter phrase did not steal it', () => {
    expect(
      ranges('risk per share over one').total_risk,
      'the shorter phrase swallowed the longer one',
    ).toBeUndefined()
  })

  it('bare "risk over one hundred" still means TOTAL risk', () => {
    expect(ranges('risk over one hundred')).toEqual({ total_risk: { min: 100, max: null } })
  })

  it('"days since catalyst under five" beats any fragment of itself', () => {
    expect(ranges('days since catalyst under five')).toEqual({
      days_since_catalyst: { min: null, max: 5 },
    })
    expect(ranges('days since catalyst under five').catalystTypes).toBeUndefined()
  })
})

// --- G4 ---------------------------------------------------------------------

describe('G4 the remaining silent columns each resolve', () => {
  it('price move', () => {
    expect(ranges('price move over five percent')).toEqual({
      price_move_pct: { min: 5, max: null },
    })
  })

  it('first entry', () => {
    expect(ranges('first entry under ten')).toEqual({ first_entry: { min: null, max: 10 } })
  })

  it('days since catalyst', () => {
    expect(ranges('days since catalyst under five')).toEqual({
      days_since_catalyst: { min: null, max: 5 },
    })
  })

  it('ema9 distance', () => {
    expect(ranges('ema distance over two')).toEqual({ ema9_dist_pct: { min: 2, max: null } })
  })
})

// --- G5 ---------------------------------------------------------------------

describe('G5 synonyms on columns that already speak', () => {
  it('"money over one hundred" reaches net P&L', () => {
    expect(ranges('money over one hundred')).toEqual({ net_pnl: { min: 100, max: null } })
  })

  it('"lost money" STILL reaches the outcome, not a range', () => {
    const out = r('lost money')
    expect(out.state.outcome, 'the beat sixty six behaviour was lost').toBe('losers')
    expect(out.state.ranges).toEqual({})
  })

  it('and "losers over one hundred" keeps the magnitude-of-loss law', () => {
    expect(r('losers over one hundred').state.ranges).toEqual({
      net_pnl: { min: null, max: -100 },
    })
  })
})

// --- G6 ---------------------------------------------------------------------

describe('G6 two-sided on the NEW columns', () => {
  it('"price between two and ten"', () => {
    expect(ranges('price between two and ten')).toEqual({ avg_buy: { min: 2, max: 10 } })
  })

  it('"day change between ten and fifty percent"', () => {
    expect(ranges('day change between ten and fifty percent')).toEqual({
      daily_change_pct: { min: 10, max: 50 },
    })
  })

  it('"float between one and five million" -- unchanged', () => {
    expect(ranges('float between one and five million')).toEqual({
      float: { min: 1_000_000, max: 5_000_000 },
    })
  })

  it('"exit price between two and ten" -- the exit column takes it too', () => {
    expect(ranges('exit price between two and ten')).toEqual({ avg_sell: { min: 2, max: 10 } })
  })

  it('and the at-least / at-most forms reach a new column', () => {
    expect(ranges('price at least five')).toEqual({ avg_buy: { min: 5, max: null } })
    expect(ranges('price at most five')).toEqual({ avg_buy: { min: null, max: 5 } })
  })
})

// --- G7 ---------------------------------------------------------------------

describe('G7 a percent column reads a bare number the same way', () => {
  it('"day change over ten" and "day change over ten percent" are the SAME ask', () => {
    expect(ranges('day change over ten')).toEqual(ranges('day change over ten percent'))
  })

  it('and that ask is ten', () => {
    expect(ranges('day change over ten')).toEqual({ daily_change_pct: { min: 10, max: null } })
  })

  it('price move behaves identically', () => {
    expect(ranges('price move over five')).toEqual(ranges('price move over five percent'))
  })
})

// --- G8 ---------------------------------------------------------------------

describe('G8 EXACT vocabulary beats a column phrase', () => {
  // Step zero found eight words already resolving to vocabulary, but all by
  // PREFIX or SUBSTRING -- none is an exact key. So the exact-wins law is
  // guarded against a CONSTRUCTED playbook rather than left untested.
  const NAMED: ResolverVocabulary = {
    ...BOOK,
    playbooks: [...BOOK.playbooks, { id: 12, name: 'Entry', tier: 'A' }],
  }

  it('a playbook named Entry keeps the word', () => {
    expect(r('entry under ten', NAMED).state.playbookIds).toEqual([12])
  })

  it('and no entry-price range is built from it', () => {
    expect(ranges('entry under ten', NAMED).avg_buy).toBeUndefined()
  })

  it('while the same query without that name reads the column', () => {
    expect(ranges('entry under ten')).toEqual({ avg_buy: { min: null, max: 10 } })
  })
})

// --- G9 : THE POSITIVE CONTROLS ---------------------------------------------

describe('G9 every phrase that worked before still works', () => {
  it('float', () => {
    expect(ranges('float under 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('rvol', () => {
    expect(ranges('rvol over 5x')).toEqual({ rvol: { min: 5, max: null } })
  })

  it('market cap', () => {
    expect(ranges('market cap under 500m')).toEqual({
      market_cap: { min: null, max: 500_000_000 },
    })
  })

  it('gain', () => {
    expect(ranges('gain over 50%')).toEqual({ pnl_gain_pct: { min: 50, max: null } })
  })

  it('net', () => {
    expect(ranges('net over 100')).toEqual({ net_pnl: { min: 100, max: null } })
  })

  it('stop', () => {
    expect(ranges('stop under 5')).toEqual({ stop_price: { min: null, max: 5 } })
  })

  it('hold', () => {
    expect(ranges('hold over 60')).toEqual({ hold_time: { min: 60, max: null } })
  })

  it('bare "float" keeps its vocabulary reading', () => {
    expect(r('float').state.mistakeKeys).toHaveLength(1)
    expect(r('float').state.ranges).toEqual({})
  })

  it('bare "risk" keeps its vocabulary reading too -- measured, unchanged', () => {
    expect(r('risk').state.mistakeKeys).toHaveLength(1)
    expect(r('risk').state.ranges).toEqual({})
  })

  it('the campaign sentence is unchanged', () => {
    const out = r(CAMPAIGN)
    expect(out.state.outcome).toBe('losers')
    expect(out.state.regions).toEqual(['China'])
    // v0.2.7 — THREE now, not two: the limit beat taught the resolver that
    // "the 10" in this sentence is a row count. The sentence has said it all
    // along and it was unresolved until then.
    // v0.2.7 — FOUR now: the exclusion beat turned "but not from hong kong"
    // from an ignored phrase into an applied EXCLUSION. The sentence has meant
    // that from the first beat of the campaign; it is the last piece to land.
    expect(out.applied).toHaveLength(4)
    expect(out.state.limit).toBe(10)
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
