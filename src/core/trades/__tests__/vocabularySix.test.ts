import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '@/core/trades/queryResolver'
import {
  MACD_STATE_CHOICES, applyTradesFilters, emptyFilters,
} from '@/core/trades/tradesFilter'
import { countOffers, responseLine } from '@/core/trades/queryResponse'
import type { TradeListRow } from '@shared/trades-types'

// SIX THINGS ARE PINNED HERE. Five are words Edge could not read; the sixth is
// a sentence that lied about the other five.
//
// A PLURAL IS A WORD ENDING, NOT A PHRASE ENDING. "halt resume long" reads as
// a playbook. "halt resume longs" did not: the trailing s stopped the whole
// phrase matching, so it split into a catalyst plus a side and answered zero
// where the singular answered sixteen. One letter, and the trader is told they
// have no such trades.
//
// TWO WORDS A MOMENTUM TRADER ACTUALLY TYPES. "bullish" and "bearish" went
// nowhere, though the app has carried the state they name since the MACD facet
// shipped. They map to that state and to nothing invented here.
//
// TWO PHRASES, AT THE APP'S OWN THRESHOLD. "low float" and "high float" are
// how the whole strategy is described, and neither resolved. The number is the
// one the Low-Float Hunter badge has always counted by. It is not chosen here.
//
// TWO WORDS THAT ARE ONLY EVER NOISE. "ive" is the tail of a contraction the
// tokenizer has already stripped, and "ranges" appears in no vocabulary key on
// any measured book. Both blocked whole sentences at the strict boundary.
//
// AND ONE WORD THAT MUST NOT BE PICKED FOR THE TRADER. "win" is three letters,
// below the substring floor, so it fell through to the unread set. It is also a
// WHOLE TOKEN inside a real mistake name. A word that is both filler and
// vocabulary is ambiguous by construction, so it OFFERS and applies nothing.
//
// THE SENTENCE HAD TO CHANGE WITH THEM. A word that is offered was still being
// reported as one that could not be read, which contradicts the chip sitting
// underneath it.

const NOW = new Date('2026-06-15T15:00:00Z')
const row = (over: Partial<TradeListRow>) => over as unknown as TradeListRow

/** The threshold this file checks against is written out in full ON PURPOSE.
 *  If the shared constant ever moves, this literal must be edited by hand and
 *  the edit is the point: a band that silently changes what it counts is the
 *  defect, not the fix. */
const LOW_FLOAT = 20_000_000

const VOCAB: ResolverVocabulary = {
  symbols: ['HLPX'],
  regions: ['USA'],
  countries: [],
  sectors: [],
  industries: [],
  playbooks: [
    { id: 1, name: 'Halt Resume Long', tier: null },
    { id: 2, name: 'Hidden Buyers', tier: null },
  ],
  catalystTypes: ['Halt Resume', 'Earnings'],
  mistakes: [
    { axis: 'psychological', name: 'Overconfidence after a win' },
    { axis: 'psychological', name: 'Broke my own rules' },
    { axis: 'psychological', name: 'Traded through max loss' },
  ],
  macdStates: MACD_STATE_CHOICES.map((c) => ({
    key: c.key, display: c.display, value: c.value,
  })),
}

const r = (q: string) => resolveQuery(q, VOCAB, NOW, emptyFilters())

// A BOOK SHAPED TO TELL THE SIX APART. Every count below is a property of these
// eight rows and can be read straight off them.
const BOOK: TradeListRow[] = [
  row({ symbol: 'AAA', side: 'long', playbook_id: 1, float_shares: 5_000_000, tf_1m_macd_positive: true, net_pnl: 100 }),
  row({ symbol: 'BBB', side: 'long', playbook_id: 1, float_shares: 19_999_999, tf_1m_macd_positive: false, net_pnl: -50 }),
  row({ symbol: 'CCC', side: 'long', playbook_id: 2, float_shares: LOW_FLOAT, tf_1m_macd_positive: true, net_pnl: 10 }),
  row({ symbol: 'DDD', side: 'short', playbook_id: 2, float_shares: 20_000_001, tf_1m_macd_positive: false, net_pnl: -10 }),
  row({ symbol: 'EEE', side: 'long', playbook_id: null, float_shares: 90_000_000, tf_1m_macd_positive: null, net_pnl: 5 }),
  row({ symbol: 'FFF', side: 'long', playbook_id: null, float_shares: null, tf_1m_macd_positive: true, net_pnl: 7 }),
  row({ symbol: 'GGG', side: 'short', playbook_id: null, float_shares: null, tf_1m_macd_positive: null, net_pnl: -3 }),
  row({
    symbol: 'HHH', side: 'long', playbook_id: null, float_shares: 1_000, tf_1m_macd_positive: false, net_pnl: -9,
    mistakes: ['Traded through max loss'],
    mistakeTags: [{ axis: 'psychological', name: 'Traded through max loss' }],
  }),
]
const rows = (q: string) => applyTradesFilters(BOOK, r(q).state).length

// ── V1 : A PLURAL REACHES THE ENTRY, NOT A SPLIT ────────────────────────────

describe('V1 a plural of an entry name reaches THAT entry', () => {
  it('"halt resume longs" reaches the playbook, exactly as the singular does', () => {
    const out = r('halt resume longs')
    expect(out.state.playbookIds, 'the plural did not reach the playbook').toEqual([1])
    expect(out.applied).toContain('playbook Halt Resume Long')
  })

  it('and it answers the SAME rows as the singular, which is the whole point', () => {
    expect(rows('halt resume longs')).toBe(rows('halt resume long'))
    expect(rows('halt resume longs'), 'the plural answered a different book').toBe(2)
  })

  it('the split reading is GONE -- no catalyst and no side came along with it', () => {
    const out = r('halt resume longs')
    expect(out.state.catalystTypes, 'the phrase still split into a catalyst').toEqual([])
    expect(out.state.side, 'the phrase still split off a side').toBe('all')
  })

  it('CONTROL -- the singular is untouched', () => {
    const out = r('halt resume long')
    expect(out.state.playbookIds).toEqual([1])
    expect(out.state.side).toBe('all')
  })

  it('CONTROL -- a bare plural side is still a side', () => {
    const out = r('longs')
    expect(out.state.side, 'an ordinary plural stopped resolving').toBe('long')
    expect(out.state.playbookIds).toEqual([])
  })
})

// ── V1b : THE COLLISION CONTROL ─────────────────────────────────────────────

describe('V1b the fold does NOT merge two distinct entries', () => {
  // The census over three books found ZERO merges. These are the two branches
  // that could produce one, driven rather than assumed.
  it('a name ending in a DOUBLE S is not a plural and keeps its own entry', () => {
    const out = r('traded through max loss')
    expect(out.state.mistakeKeys, 'the double-s name went unreachable').toEqual([
      { axis: 'psychological', name: 'Traded through max loss' },
    ])
    expect(rows('traded through max loss'), 'the entry stopped matching its row').toBe(1)
  })

  it('a name whose last word IS a plural still reaches its own entry', () => {
    const out = r('broke my own rules')
    expect(out.state.mistakeKeys).toEqual([
      { axis: 'psychological', name: 'Broke my own rules' },
    ])
  })

  it('and the two never arrive together', () => {
    expect(r('broke my own rules').state.mistakeKeys).toHaveLength(1)
    expect(r('traded through max loss').state.mistakeKeys).toHaveLength(1)
  })

  it('an ALREADY-plural stored name is still reachable by the word typed', () => {
    expect(r('earnings').state.catalystTypes).toEqual(['Earnings'])
  })
})

// ── V2 : THE TWO WORDS FOR THE MACD STATE ───────────────────────────────────

describe('V2 bullish and bearish reach the MACD state the app already has', () => {
  it('bullish is the positive one-minute state', () => {
    const out = r('bullish')
    expect(out.state.macdStates, 'bullish reached nothing').toEqual(['positive'])
    expect(rows('bullish')).toBe(3)
  })

  it('bearish is the negative one-minute state', () => {
    const out = r('bearish')
    expect(out.state.macdStates, 'bearish reached nothing').toEqual(['negative'])
    expect(rows('bearish')).toBe(3)
  })

  it('and each says the SAME sentence the canonical ask says', () => {
    expect(r('bullish').applied).toEqual(r('macd positive').applied)
    expect(r('bearish').applied).toEqual(r('macd negative').applied)
  })

  it('CONTROL -- a row with no computed MACD is in NEITHER', () => {
    expect(rows('bullish') + rows('bearish')).toBe(BOOK.length - 2)
  })
})

// ── V3 : THE TWO FLOAT PHRASES ──────────────────────────────────────────────

describe('V3 low float and high float use the app OWN threshold', () => {
  it('low float is at most the badge threshold', () => {
    expect(r('low float').state.ranges.float).toEqual({ min: null, max: LOW_FLOAT })
  })

  it('high float is at least it, and the boundary row belongs to LOW', () => {
    // The high band starts ONE SHARE ABOVE the low ceiling, because both
    // bounds are inclusive and a stock sitting exactly on the threshold must
    // not answer two opposite asks. A float is an integer share count, so
    // this is the same threshold expressed strictly.
    expect(r('high float').state.ranges.float).toEqual({ min: LOW_FLOAT + 1, max: null })
    expect(rows('low float'), 'the boundary row moved out of low').toBe(4)
    expect(rows('high float')).toBe(2)
  })

  it('a trade with NO float recorded is in neither, and is still counted as skipped', () => {
    const missing = BOOK.filter((t) => t.float_shares == null).length
    expect(missing).toBe(2)
    expect(rows('low float') + rows('high float') + missing).toBe(BOOK.length)
  })

  it('CONTROL -- an explicit float band is untouched by the phrases', () => {
    expect(r('float under 1 million').state.ranges.float).toEqual({ min: null, max: 1_000_000 })
  })
})

// ── V4 : THE TWO FILLER WORDS ───────────────────────────────────────────────

describe('V4 ive and ranges are noise and never reach anything', () => {
  it('neither applies a filter on its own', () => {
    expect(r('ive').state).toEqual(emptyFilters())
    expect(r('ranges').state).toEqual(emptyFilters())
  })

  it('neither offers a reading of itself', () => {
    expect(countOffers(r('ive').ambiguous)).toBe(0)
    expect(countOffers(r('ranges').ambiguous)).toBe(0)
  })

  it('and they no longer block the rest of the sentence', () => {
    // THE POINT OF THE PAIR. Before, one unread word threw the whole ask away
    // at the strict boundary, so the clauses around it applied nothing.
    const out = r('stocks ive traded with price ranges from 2-10')
    expect(out.state.ranges.avg_buy, 'the window was thrown away with the filler').toEqual({
      min: 2, max: 10,
    })
  })

  it('CONTROL -- "ranges" carrying its OTHER meaning applies nothing at all', () => {
    // The trader means the noun here. Dropping the word must not invent a band.
    const out = r('what price ranges do i trade')
    expect(out.state.ranges, 'a band was invented from a question').toEqual({})
    expect(out.state).toEqual(emptyFilters())
  })
})

// ── V5 : THE WORD THAT MUST OFFER, NOT PICK ─────────────────────────────────

describe('V5 win offers a reading and picks none', () => {
  it('it applies nothing at all', () => {
    const out = r('win')
    expect(out.applied, 'a three letter word picked a filter').toEqual([])
    expect(out.state).toEqual(emptyFilters())
  })

  it('the row count is the WHOLE book, because nothing was filtered', () => {
    expect(rows('win')).toBe(BOOK.length)
  })

  it('and it offers the mistake it is a whole token inside', () => {
    const out = r('win')
    expect(out.ambiguous.flatMap((a) => a.candidates)).toContain('Overconfidence after a win')
  })

  it('it is NOT left in the unread set, because it WAS read', () => {
    expect(r('win').unresolved).toEqual([])
  })

  it('CONTROL -- the full mistake name still beats the single word', () => {
    const out = r('overconfidence after a win')
    expect(out.state.mistakeKeys).toEqual([
      { axis: 'psychological', name: 'Overconfidence after a win' },
    ])
    expect(out.ambiguous, 'the whole name became ambiguous').toEqual([])
  })

  it('CONTROL -- a word BELOW the floor that is in no key stays unread', () => {
    expect(r('zzq').unresolved).toContain('zzq')
  })
})

// ── V6 : THE SENTENCE MUST NOT CALL AN OFFER AN UNREAD WORD ─────────────────

describe('V6 the line tells apart unread, offered and applied', () => {
  const say = (typed: string, offers?: { shown: number; total: number }) => {
    const out = r(typed)
    return responseLine({
      count: BOOK.length,
      applied: out.applied,
      unresolved: out.unresolved,
      limit: null,
      before: emptyFilters(),
      after: out.state,
      answer: null,
      typed,
      offers,
    })
  }

  it('a word that was OFFERED is not reported as one it could not read', () => {
    const line = say('win', { shown: 1, total: 1 })
    expect(line, 'the sentence contradicts the chip beneath it').not.toContain('could not read')
  })

  it('and the offer is spoken, not silently dropped', () => {
    expect(say('win', { shown: 1, total: 1 })).toContain('1 reading to offer')
  })

  it('a word that truly WAS unread still says so', () => {
    expect(say('zzq')).toContain('could not read')
  })

  it('and a truncated offer list still names how many were held back', () => {
    const line = say('win', { shown: 2, total: 9 })
    expect(line).toContain('2')
    expect(line).toContain('7')
  })

  it('CONTROL -- the applied path is untouched', () => {
    const out = r('longs')
    const line = responseLine({
      count: 5, applied: out.applied, unresolved: out.unresolved, limit: null,
      before: emptyFilters(), after: out.state, answer: null, typed: 'longs',
      offers: { shown: 0, total: 0 },
    })
    expect(line).toContain('5 trades')
    expect(line).toContain('side long')
    expect(line).not.toContain('could not read')
  })
})
