// v0.2.7 — AN EXACT MULTI-TOKEN ENTRY WINS ACROSS PASSES.
//
// THE LAW: a multi-token exact vocabulary match reserves its span before any
// consuming pass. It is here because the vocabulary is USER-AUTHORED. A trader
// names their own setups, mistakes and catalysts, and Edge follows the trader's
// own words ahead of its own -- so the rule cannot be a list of which passes to
// exempt, because a name nobody has typed yet must win just as surely.
//
// WHAT WAS BROKEN, measured across beats 133 to 159. Six entries were
// unreachable by their own full names on the books that carry them. A
// single-word functional pass took a token belonging to a multi-word entry, and
// pass 3 then abandoned the span at its own `marks[i + k] !== 'free'` gate, so
// the phrase was never constructed and exact-wins never saw it. Two of the six
// showed the trader NOTHING at all -- no offer, no mention of the entry:
//
//   "parabolic short"    applied a 9 EMA parabolic band plus side short
//   "halt resume long"   applied side long plus the Halt Resume catalyst
//
// THE OTHER FOUR at least offered something. None of the six reached its entry.
//
// THE CURES ARE NOT EQUAL, and RK1 says so per book. Two deliver real rows on
// the demo book -- fourteen for Parabolic Short, sixteen for Halt Resume Long,
// both SQL-verified. Two deliver an HONEST EMPTY: no trade on any measured book
// carries the catalyst "Short Squeeze" or the mistake "Entered below VWAP", so
// naming the entry and showing zero is the correct answer, not a bug. That is
// asserted verbatim here so nobody later mistakes it for one.
//
// SINGLE TOKENS NEVER RESERVE -- RK4, and it is the reason the whole-vocabulary
// reorder was rejected rather than a detail. On the largest measured book "my"
// is the Malaysia ISO. A single-token reservation would apply the country to
// every sentence containing the word, reinstating the defect beat 152 removed.
//
// BEAT 133'S RULING STANDS. A refused word may not be claimed by another pass
// and must come back named. What changed is only the ORDER: an exact
// multi-token entry claims its span before the band pass can refuse a word
// inside it. Where no entry claims the span, the refusal behaves exactly as it
// did -- RB4a and RB5 in bandRefusalUnclaimable are untouched and still green.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { emptyFilters, applyTradesFilters } from '../tradesFilter'
import { answerText } from '../queryAnswer'
import { responseLine } from '../queryResponse'

const NOW = new Date('2026-06-15T15:00:00')

/** Every entry the six cures need, plus Malaysia so RK4's single-token probe has
 *  a real ISO to not-reserve, plus China so the negation pair has a term that is
 *  NOT an entry to contrast against. */
const BOOK: ResolverVocabulary = {
  symbols: ['NRVA'],
  regions: ['China'],
  countries: [{ iso: 'MY', name: 'Malaysia' }],
  sectors: [],
  industries: [],
  playbooks: [
    { id: 1, name: 'Parabolic Short', tier: null },
    { id: 2, name: 'Halt Resume Long', tier: null },
    { id: 3, name: 'No Setup', tier: null },
    { id: 4, name: 'Micro Pullback', tier: null },
  ],
  catalystTypes: ['Short Squeeze', 'Earnings'],
  mistakes: [
    { axis: 'technical', name: 'Chased extended' },
    { axis: 'technical', name: 'Entered below VWAP' },
    { axis: 'psychological', name: 'Cut winner early' },
    { axis: 'psychological', name: 'Added to a loser / averaged down' },
  ],
} as unknown as ResolverVocabulary

/** Four Parabolic Short trades -- two winners (+100, +200), two losers (-50,
 *  -150), so the win rate is 2 of 4 decided = 50.0%. Two Halt Resume Long. */
const t = (playbook_id: number | null, net_pnl: number) => ({
  id: net_pnl, date: '2026-06-10', symbol: 'NRVA', side: 'long' as const, net_pnl,
  open_time: '2026-06-10T13:30:00Z', close_time: '2026-06-10T13:35:00Z',
  is_open: false, playbook_id, playbook_tier: null, catalyst_type: null,
  region: null, country: null, sector: null, industry: null,
  mistakes: [] as string[], mistakeTags: [] as { name: string; axis: string }[],
})

const ROWS = [
  t(1, 100), t(1, 200), t(1, -50), t(1, -150),
  t(2, 300), t(2, -100),
] as unknown as Parameters<typeof applyTradesFilters>[0]

const r = (text: string) => resolveQuery(text, BOOK, NOW, emptyFilters())
const ask = (text: string) => {
  const res = r(text)
  const sub = applyTradesFilters(ROWS, res.state)
  return { res, sub, answer: answerText(res.answer, sub as never) }
}

// --- RK1 : EACH CAPTURE REACHES ITS ENTRY ------------------------------------

describe('RK1 an exact multi-token entry wins over the functional word inside it', () => {
  it('"short squeeze" is the CATALYST, not the side', () => {
    expect(r('short squeeze').state.catalystTypes).toEqual(['Short Squeeze'])
    expect(r('short squeeze').state.side).toBe('all')
  })

  it('"parabolic short" is the PLAYBOOK, not a band plus a side', () => {
    const out = r('my parabolic short trades')
    expect(out.state.playbookIds).toEqual([1])
    expect(out.state.side).toBe('all')
    expect(out.state.ranges).toEqual({})
  })

  it('"chased extended" is the MISTAKE, not the band', () => {
    expect(r('chased extended').state.mistakeKeys)
      .toEqual([{ axis: 'technical', name: 'Chased extended' }])
    expect(r('chased extended').state.ranges).toEqual({})
  })

  it('"entered below vwap" is the MISTAKE, not a vwap range', () => {
    const out = r('trades where i entered below vwap')
    expect(out.state.mistakeKeys).toEqual([{ axis: 'technical', name: 'Entered below VWAP' }])
    expect(out.state.ranges).toEqual({})
  })

  it('"halt resume long" is the PLAYBOOK, not a side plus a catalyst', () => {
    expect(r('halt resume long').state.playbookIds).toEqual([2])
    expect(r('halt resume long').state.side).toBe('all')
    expect(r('halt resume long').state.catalystTypes).toEqual([])
  })

  it('"cut winner early" is the MISTAKE, and no longer refuses on "cut"', () => {
    const out = r('cut winner early')
    expect(out.state.mistakeKeys).toEqual([{ axis: 'psychological', name: 'Cut winner early' }])
    expect(out.unresolved).toEqual([])
  })
})

// --- RK8 : THE TWO SILENT CAPTURES NOW NAME THEIR ENTRY ----------------------

describe('RK8 the entry appears in the line the trader reads', () => {
  const line = (text: string) => {
    const a = ask(text)
    return responseLine({
      count: a.sub.length, applied: a.res.applied, unresolved: a.res.unresolved,
      limit: null, before: emptyFilters(), after: a.res.state, answer: a.answer,
    })
  }

  it('"parabolic short" -- four rows, and the playbook is named', () => {
    expect(line('parabolic short')).toBe('4 trades - playbook Parabolic Short')
  })

  it('"halt resume long" -- two rows, and the playbook is named', () => {
    expect(line('halt resume long')).toBe('2 trades - playbook Halt Resume Long')
  })

  it('R256: an entry no trade carries is an HONEST EMPTY, named and zero', () => {
    // No row here carries the catalyst, exactly as no row on any measured book
    // does. Zero with the entry NAMED is the correct answer, not a defect.
    expect(line('short squeeze')).toBe('0 trades - catalyst Short Squeeze')
  })
})

// --- RK2 : THE LEGITIMATE COLUMN IS UNTOUCHED --------------------------------

describe('RK2 the functional word keeps its functional meaning', () => {
  it('a bare side word is still the side', () => {
    expect(r('my short trades').state.side).toBe('short')
    expect(r('my long trades').state.side).toBe('long')
  })

  it('a bare band word is still the band', () => {
    expect(r('extended').state.ranges).toEqual({ ema9_dist_pct: { min: 5, max: null } })
    expect(r('parabolic').state.ranges).toEqual({ ema9_dist_pct: { min: 20, max: null } })
  })

  it('a comparator and its column are still a comparison', () => {
    expect(r('vwap over five').state.ranges).toEqual({ vwap_dist_pct: { min: 5, max: null } })
  })

  it('an outcome word is still the outcome', () => {
    expect(r('winners').state.outcome).toBe('winners')
  })

  it('a governed negator still excludes', () => {
    expect(r('not china').state.excludeRegions).toEqual(['China'])
  })
})

// --- RK3 : WHAT ALREADY WORKED STILL WORKS -----------------------------------

describe('RK3 the entries that were already reachable are unchanged', () => {
  it('"no setup" is still the playbook -- the negation mask always had this', () => {
    expect(r('no setup').state.playbookIds).toEqual([3])
  })

  it('"micro pullback" still reaches its playbook', () => {
    expect(r('micro pullback').state.playbookIds).toEqual([4])
  })
})

// --- RK4 : SINGLE TOKENS NEVER RESERVE ---------------------------------------

describe('RK4 one token is never an entry claim -- the B-disqualifier, pinned', () => {
  it('a bare "my" still OFFERS the country, exactly as shipped', () => {
    // "my" is both a stopword and the Malaysia ISO. Beat 152 ruled the filler
    // reading wins by default and the vocabulary reading is OFFERED. A
    // single-token reservation would APPLY Malaysia here, to every sentence
    // containing the word. That is why the reorder was rejected.
    const out = r('my')
    expect(out.state.countries).toEqual([])
    expect(out.ambiguous.map((a) => a.text)).toContain('my')
    expect(out.ambiguous[0].candidates).toContain('Malaysia')
  })

  it('and inside a sentence it still does not apply', () => {
    expect(r('my long trades').state.countries).toEqual([])
  })
})

// --- RK5 : NEGATION, BOTH WAYS ROUND -----------------------------------------

describe('RK5 a reserved span respects the negation mask', () => {
  it('"not parabolic short" EXCLUDES the playbook', () => {
    const out = r('not parabolic short')
    expect(out.state.excludePlaybookIds).toEqual([1])
    expect(out.state.playbookIds).toEqual([])
  })

  it('and the same entry unnegated INCLUDES it -- beat 94, both ways', () => {
    expect(r('parabolic short').state.playbookIds).toEqual([1])
    expect(r('parabolic short').state.excludePlaybookIds).toEqual([])
  })

  it('"without cut winner early" excludes the mistake', () => {
    expect(r('without cut winner early').state.excludeMistakeKeys)
      .toEqual([{ axis: 'psychological', name: 'Cut winner early' }])
  })
})

// --- RK6 : THE BOUNDARY IS UNTOUCHED -----------------------------------------

describe('RK6 a reserved entry beside an unread token still discards everything', () => {
  it('"parabolic short zzzq" applies NOTHING and names the token', () => {
    const out = r('parabolic short zzzq')
    expect(out.state).toEqual(emptyFilters())
    expect(out.unresolved).toContain('zzzq')
    expect(out.answer ?? null).toBeNull()
  })

  it('a misspelled entry name is not the entry', () => {
    const out = r('parabolc short')
    expect(out.state.playbookIds).toEqual([])
    expect(out.unresolved).toContain('parabolc')
  })
})

// --- RK7 : AN ANSWER OVER THE ENTRY'S ROWS -----------------------------------

describe('RK7 an entry composes with the answer grammar', () => {
  it('"win rate parabolic short" -- 2 winners of 4 decided = 50.0%', () => {
    const a = ask('win rate parabolic short')
    expect(a.res.state.playbookIds).toEqual([1])
    expect(a.sub.length).toBe(4)
    expect(a.answer).toBe('Win rate: 50.0% — 2 winners of 4 decided trades.')
  })

  it('"how many halt resume long trades did i take" -- two', () => {
    const a = ask('how many halt resume long trades did i take')
    expect(a.res.state.playbookIds).toEqual([2])
    expect(a.answer).toBe('2 trades match.')
  })
})
