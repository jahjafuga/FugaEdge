import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '@/core/trades/queryResolver'
import {
  MACD_STATE_CHOICES, applyTradesFilters, emptyFilters,
} from '@/core/trades/tradesFilter'
import type { TradeListRow } from '@shared/trades-types'

// A FRAGMENT MUST NOT ANSWER FOR A PHRASE THE APP INVENTED.
//
// Beat two hundred added four vocabulary entries: two float band phrases and
// two words for a MACD state. Every pool entry carries a KIND, and a kind
// carries the FLOORS that decide how short a fragment may be and still claim
// the entry. The band phrases were given kind zero, which IS the symbol kind,
// whose prefix floor is THREE because a ticker is short.
//
// So "low" claimed "low float" and filtered the book to ninety six trades of a
// hundred and forty with no complaint at all. "hig" did the same for the upper
// band. The synonyms were not spared either: they carry the general floor of
// four, and "bull", "bear" and "beari" all applied a MACD state.
//
// THE DISTINCTION THIS FILE PINS. Every other key in the pool is a name the
// TRADER wrote into their own book, and a prefix of one of those is a
// deliberate convenience: "overconfidence" reaching "Overconfidence after a
// win" is the feature working, and a trader who dislikes it can rename the
// entry. These four are phrases the APP invented. A trader cannot rename
// "low float", so a fragment of it must not answer for the whole.
//
// WHY NOT JUST RAISE THE FLOOR. Measured, in beat two hundred and four: the
// matcher decides WHICH entries are candidates in one place and then decides
// APPLY or OFFER in another, recomputing the tier from the strings. Raising
// the prefix floor removes the entry from the prefix tier, but it re-enters
// through the whole-word branch of the substring tier and is then called a
// prefix hit again and applied. Fifteen of the seventeen silent prefixes
// survived that fix. Both doors have to close, which is what exactness does.

const NOW = new Date('2026-06-15T15:00:00Z')
const row = (over: Partial<TradeListRow>) => over as unknown as TradeListRow

const LOW_FLOAT = 20_000_000

/** A book with NO playbook whose name begins "bull", so a bare "bull" has
 *  nothing of the trader's own to reach and would fall to the app synonym. */
const VOCAB: ResolverVocabulary = {
  symbols: ['HLPX'],
  regions: ['USA'],
  countries: [],
  sectors: [],
  industries: [],
  playbooks: [{ id: 1, name: 'Halt Resume Long', tier: null }],
  catalystTypes: ['News / PR'],
  mistakes: [
    { axis: 'psychological', name: 'Overconfidence after a win' },
    { axis: 'technical', name: 'High-volume pullback (wanted low volume)' },
  ],
  macdStates: MACD_STATE_CHOICES.map((c) => ({
    key: c.key, display: c.display, value: c.value,
  })),
}

/** The same book PLUS a playbook the trader named themselves, which a bare
 *  "bull" legitimately prefixes. This is the overreach control. */
const VOCAB_WITH_BULL: ResolverVocabulary = {
  ...VOCAB,
  playbooks: [...VOCAB.playbooks, { id: 2, name: 'Bull Flag', tier: null }],
}

const r = (q: string, v: ResolverVocabulary = VOCAB) =>
  resolveQuery(q, v, NOW, emptyFilters())

const BOOK: TradeListRow[] = [
  row({ symbol: 'AAA', side: 'long', float_shares: 5_000_000, tf_1m_macd_positive: true, net_pnl: 10 }),
  row({ symbol: 'BBB', side: 'long', float_shares: 19_999_999, tf_1m_macd_positive: false, net_pnl: -5 }),
  row({ symbol: 'CCC', side: 'long', float_shares: LOW_FLOAT, tf_1m_macd_positive: true, net_pnl: 3 }),
  row({ symbol: 'DDD', side: 'short', float_shares: 20_000_001, tf_1m_macd_positive: false, net_pnl: -2 }),
  row({ symbol: 'EEE', side: 'long', float_shares: 90_000_000, tf_1m_macd_positive: null, net_pnl: 1 }),
  row({ symbol: 'FFF', side: 'long', float_shares: null, tf_1m_macd_positive: true, net_pnl: 7 }),
  row({ symbol: 'GGG', side: 'short', playbook_id: 2, float_shares: 1_000, tf_1m_macd_positive: null, net_pnl: -1 }),
]
const rows = (q: string, v: ResolverVocabulary = VOCAB) =>
  applyTradesFilters(BOOK, r(q, v).state).length

/** Every STRICT prefix of a key, at or above the shortest floor in the file.
 *  Three, because the symbol prefix floor is three and that is the shortest
 *  door any entry has. */
const strictPrefixes = (key: string) => {
  const out: string[] = []
  for (let n = 3; n < key.length; n += 1) out.push(key.slice(0, n))
  return out
}

// ── A : THE BANDS ───────────────────────────────────────────────────────────

describe('A a fragment does not claim a float band', () => {
  it('"low" applies no band at all', () => {
    expect(r('low').state.ranges.float, 'a three letter word set a float band').toBeUndefined()
  })
  it('"high" applies no band at all', () => {
    expect(r('high').state.ranges.float, 'a four letter word set a float band').toBeUndefined()
  })
  it('"hig" applies no band at all', () => {
    expect(r('hig').state.ranges.float).toBeUndefined()
  })
  it('and each leaves the whole book, because nothing was filtered', () => {
    expect(rows('low')).toBe(BOOK.length)
    expect(rows('high')).toBe(BOOK.length)
    expect(rows('hig')).toBe(BOOK.length)
  })
})

// ── B : THE SYNONYMS ────────────────────────────────────────────────────────

describe('B a fragment does not claim a MACD synonym', () => {
  it('"bull" applies no MACD state', () => {
    expect(r('bull').state.macdStates, 'a fragment set a MACD state').toEqual([])
  })
  it('"bulli" applies no MACD state', () => {
    expect(r('bulli').state.macdStates).toEqual([])
  })
  it('"bear" applies no MACD state', () => {
    expect(r('bear').state.macdStates, 'a common word set a MACD state').toEqual([])
  })
  it('"beari" applies no MACD state', () => {
    expect(r('beari').state.macdStates).toEqual([])
  })
})

// ── C : THE FOUR FULL PHRASES STILL WORK ────────────────────────────────────

describe('C the full phrase still does exactly what it did', () => {
  it('"low float" sets the band at the app OWN threshold', () => {
    expect(r('low float').state.ranges.float).toEqual({ min: null, max: LOW_FLOAT })
  })
  it('"high float" starts one share above it, so the two partition', () => {
    expect(r('high float').state.ranges.float).toEqual({ min: LOW_FLOAT + 1, max: null })
  })
  it('and the row counts are what the book holds', () => {
    // four at or below the ceiling, two above it, one never measured
    expect(rows('low float')).toBe(4)
    expect(rows('high float')).toBe(2)
    expect(rows('low float') + rows('high float')
      + BOOK.filter((t) => t.float_shares == null).length).toBe(BOOK.length)
  })
  it('"bullish" and "bearish" still reach their states', () => {
    expect(r('bullish').state.macdStates).toEqual(['positive'])
    expect(r('bearish').state.macdStates).toEqual(['negative'])
  })
  it('and each still prints the SAME line as the canonical ask', () => {
    expect(r('bullish').applied).toEqual(r('macd positive').applied)
    expect(r('bearish').applied).toEqual(r('macd negative').applied)
  })
})

// ── D : THE OVERREACH CONTROLS ──────────────────────────────────────────────

describe('D a name the TRADER wrote is still reachable by a prefix', () => {
  it('"overconfidence" still applies the mistake it prefixes', () => {
    expect(r('overconfidence').state.mistakeKeys, 'the cure reached a user-authored name').toEqual([
      { axis: 'psychological', name: 'Overconfidence after a win' },
    ])
  })
  it('"halt resume" still reaches the playbook the trader named', () => {
    expect(r('halt resume').state.playbookIds).toEqual([1])
  })
  it('"bull" reaches the trader OWN playbook when they have one', () => {
    const out = r('bull', VOCAB_WITH_BULL)
    expect(out.state.playbookIds, 'a user-authored prefix was broken').toEqual([2])
    expect(out.state.macdStates, 'the app synonym stole a user-authored prefix').toEqual([])
  })
  it('CONTROL a three letter token that is a real region still applies', () => {
    expect(r('usa').state.regions).toEqual(['USA'])
  })
})

// ── E : THE MECHANISM, ASSERTED BY BEHAVIOUR ────────────────────────────────

describe('E no STRICT prefix of an app phrase reaches it, at any length', () => {
  // This is the guard that fails if the four are ever given back a floor
  // shorter than their own length. It reads no constant: it drives every
  // strict prefix and asserts on the resulting STATE.
  it.each(strictPrefixes('low float'))('%s does not set a float band', (p) => {
    expect(r(p).state.ranges.float).toBeUndefined()
  })
  it.each(strictPrefixes('high float'))('%s does not set a float band', (p) => {
    expect(r(p).state.ranges.float).toBeUndefined()
  })
  it.each(strictPrefixes('bullish'))('%s does not set a MACD state', (p) => {
    expect(r(p).state.macdStates).toEqual([])
  })
  it.each(strictPrefixes('bearish'))('%s does not set a MACD state', (p) => {
    expect(r(p).state.macdStates).toEqual([])
  })
  it('but the EXACT phrase still reaches every one of the four', () => {
    expect(r('low float').state.ranges.float).not.toBeUndefined()
    expect(r('high float').state.ranges.float).not.toBeUndefined()
    expect(r('bullish').state.macdStates).toEqual(['positive'])
    expect(r('bearish').state.macdStates).toEqual(['negative'])
  })
})
