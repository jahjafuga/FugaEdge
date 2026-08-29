// v0.2.7 — EDGE ANSWERS, SLICE B: aggregates and ratios over the live filter.
//
// WHAT SHIPPED AND WHY THIS SHAPE. Beat 156 measured the gap: fifteen demand
// sentences, forty-five runs, one hundred percent honest refusal — the
// answered-as-a-filter bucket had been empty since the strict boundary landed.
// It also measured the supply: twelve aggregation sites, every one in src/core,
// every one taking rows as its first argument. So the answer is not a new
// computation engine. It is a grammar that names a metric, and one call to the stats
// function the app already trusts, over the rows the page is already showing.
//
// R242 — TWO PATHS OR NO VERDICT. A wrong average has no zero-row tell; nothing
// on screen contradicts it. Every number below was computed a second time by
// hand, from the six-trade fixture, and the arithmetic is written out beside the
// assertion. The corpus that judged the shipped build was verified the same way,
// against independent SQL over the same books.
//
// R246 — THE FIXTURE IS HAND-COMPUTABLE, and it contains, deliberately:
//   three winners  +300, +100, +500   sum 900   avg 300
//   two losers     -200, -400         sum -600  avg -300
//   one scratch    0                            (decided = 5, not 6)
//   holds 300 + 60 + 120 + 360 + 180 + 60 = 1080 seconds over 6 = 180 = 3m 0s
//   net P&L        900 - 600 + 0 = 300
//   win rate       3 of 5 decided = 60.0%
//   profit factor  900 / 600 = 1.50
//   a symbol that exists in the vocabulary and has NO trades (QMTX), so the
//   zero-match branch has something real to bite
//   a mistake named "Added to a loser / averaged down", so the collision word
//   "average" has somewhere to land if the answer pass ever stops taking it
//
// R243 — DESCRIPTIVE, NEVER COUNTERFACTUAL. RJ7 pins the refusal of "how much
// did chasing cost me". The sum over chased trades is computable and is NOT the
// answer to that question: "cost" names a world that did not happen.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary, ANSWER_METRIC_PHRASES, ANSWER_FILLER } from '../queryResolver'
import { answerText } from '../queryAnswer'
import { emptyFilters, applyTradesFilters } from '../tradesFilter'
import { responseLine } from '../queryResponse'
import { STOPWORDS } from '../queryResolver'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const NOW = new Date('2026-06-15T15:00:00')
const SRC = readFileSync(resolve(__dirname, '..', 'queryResolver.ts'), 'utf8')

const BOOK: ResolverVocabulary = {
  symbols: ['NRVA', 'ZYPH', 'QMTX'],
  regions: [],
  countries: [{ iso: 'US', name: 'United States' }],
  sectors: [],
  industries: [],
  playbooks: [{ id: 7, name: 'Halt Resume Long', tier: null }],
  catalystTypes: [],
  mistakes: [
    { axis: 'psychological', name: 'Added to a loser / averaged down' },
    { axis: 'psychological', name: 'Chased extended' },
  ],
} as unknown as ResolverVocabulary

/** Six trades, all on one day so no date filter can interfere. The cast is the
 *  one the driver uses too: applyTradesFilters reads a dozen fields and this
 *  fixture supplies exactly the ones the guarded paths touch. */
const t = (
  symbol: string, side: 'long' | 'short', net_pnl: number, open: string, close: string,
) => ({
  id: net_pnl, date: '2026-06-10', symbol, side, net_pnl,
  open_time: '2026-06-10T13:' + open + 'Z', close_time: '2026-06-10T13:' + close + 'Z',
  is_open: false, playbook_id: null, playbook_tier: null, catalyst_type: null,
  region: null, country: null, sector: null, industry: null,
  mistakes: [] as string[], mistakeTags: [] as { name: string; axis: string }[],
})

const ROWS = [
  t('NRVA', 'long', 300, '30:00', '35:00'),   // 300s
  t('NRVA', 'long', 100, '40:00', '41:00'),   //  60s
  t('NRVA', 'short', -200, '50:00', '52:00'), // 120s
  t('ZYPH', 'long', 500, '10:00', '16:00'),   // 360s
  t('ZYPH', 'long', -400, '20:00', '23:00'),  // 180s
  t('ZYPH', 'short', 0, '00:00', '01:00'),    //  60s  scratch
] as unknown as Parameters<typeof applyTradesFilters>[0]

/** The whole pipeline in one line, exactly as QueryBubble wires it: resolve,
 *  filter with the resolved state, answer over THOSE rows. */
const ask = (text: string) => {
  const r = resolveQuery(text, BOOK, NOW, emptyFilters())
  const sub = applyTradesFilters(ROWS, r.state)
  return { r, sub, answer: answerText(r.answer, sub as never) }
}

// --- RJ1 : THE NUMBER, NOT THE SHAPE -----------------------------------------

describe('RJ1 each target sentence answers, and the VALUE is the right one', () => {
  it('"what is my average loss" — (-200 + -400) / 2 = -300', () => {
    expect(ask('what is my average loss').answer)
      .toBe('Average loss: -$300.00, over 2 losing trades.')
  })

  it('"what is my average gain on winners" — (300 + 100 + 500) / 3 = 300', () => {
    expect(ask('what is my average gain on winners').answer)
      .toBe('Average gain: $300.00, over 3 winning trades.')
  })

  it('"whats my profit factor" — 900 / 600 = 1.50', () => {
    expect(ask('whats my profit factor').answer)
      .toBe('Profit factor: 1.50 — $900.00 won against $600.00 lost, over 6 trades.')
  })

  it('"what percent of my trades were winners" — 3 of 5 decided = 60.0%', () => {
    // The scratch is EXCLUDED from the denominator: five decided, not six.
    expect(ask('what percent of my trades were winners').answer)
      .toBe('Win rate: 60.0% — 3 winners of 5 decided trades.')
  })

  it('"how many losing trades did i have" — two', () => {
    expect(ask('how many losing trades did i have').answer).toBe('2 trades match.')
  })

  it('"whats my average hold time" — 1080s / 6 = 180s', () => {
    expect(ask('whats my average hold time').answer)
      .toBe('Average hold: 3m 0s, over 6 closed trades.')
  })

  it('"how many trades did i take on nrva" — three', () => {
    expect(ask('how many trades did i take on nrva').answer).toBe('3 trades match.')
  })

  it('"what is my total pnl on longs" — 300 + 100 + 500 - 400 = 500', () => {
    expect(ask('what is my total pnl on longs').answer)
      .toBe('Total P&L: $500.00, over 4 trades.')
  })
})

// --- RJ2 : THE ANSWER IS COMPUTED OVER THE FILTERED SUBSET, AND ONLY IT ------

describe('RJ2 answer and filter compose; neither changes the other', () => {
  it('the subset is the filtered one, not the book', () => {
    const a = ask('whats my win rate on shorts')
    // Shorts are the -200 and the scratch: one loser, no winners, one decided.
    expect(a.sub.length).toBe(2)
    expect(a.answer).toBe('Win rate: 0.0% — 0 winners of 1 decided trade.')
  })

  it('and the state is exactly what the same filter alone would produce', () => {
    expect(ask('whats my win rate on shorts').r.state.side)
      .toBe(resolveQuery('shorts', BOOK, NOW, emptyFilters()).state.side)
  })

  it('a symbol filter narrows the count the answer is taken over', () => {
    // NRVA holds 300 + 60 + 120 = 480 over three trades = 160s.
    expect(ask('whats my average hold time on nrva').answer)
      .toBe('Average hold: 2m 40s, over 3 closed trades.')
  })
})

// --- RJ3 : THE BOUNDARY GOVERNS ANSWERS ---------------------------------------

describe('RJ3 one unread token discards the answer, the filter and all', () => {
  it('"what is my average loss zzzq" answers NOTHING and filters NOTHING', () => {
    const a = ask('what is my average loss zzzq')
    expect(a.r.answer ?? null).toBeNull()
    expect(a.answer).toBeNull()
    expect(a.r.state).toEqual(emptyFilters())
    expect(a.r.unresolved).toContain('zzzq')
  })

  it('and the response the trader reads carries no number, driven through responseLine', () => {
    const a = ask('what is my average loss zzzq')
    const line = responseLine({
      count: 6, applied: a.r.applied, unresolved: a.r.unresolved,
      limit: null, before: emptyFilters(), after: a.r.state, answer: a.answer,
    })
    expect(line).toContain('could not read')
    expect(line).toContain('zzzq')
    expect(line).not.toContain('Average loss')
    expect(line).not.toContain('300')
  })
})

// --- RJ4 : R244, THE DENOMINATOR IS IN THE SENTENCE ---------------------------

describe('RJ4 no number without the count it was computed over', () => {
  const NUMERIC = [
    'what is my average loss',
    'what is my average gain on winners',
    'whats my profit factor',
    'whats my average hold time',
    'what is my total pnl on longs',
  ]

  it('every numeric answer names its count', () => {
    for (const q of NUMERIC) {
      expect(ask(q).answer, q).toMatch(/over \d+ (trade|closed trade|winning trade|losing trade)s?\./)
    }
  })

  it('every ratio names numerator AND denominator in words', () => {
    expect(ask('what percent of my trades were winners').answer)
      .toMatch(/\d+ winners of \d+ decided trades\./)
    expect(ask('whats my profit factor').answer)
      .toMatch(/\$[\d,.]+ won against \$[\d,.]+ lost/)
  })
})

// --- RJ5 : R245, EVERY COLLISION WORD STILL CARRIES ITS OTHER MEANING ---------

describe('RJ5 no answer word entered the filler set', () => {
  it('"averaged down" still reaches the mistake, and answers nothing', () => {
    // MEASURED, not assumed. In this fixture "averaged down" is a SUBSTRING
    // one-hit, so beat 152's rule offers it rather than applying it — and the
    // three books disagree with each other on which happens, because their
    // mistake vocabularies differ: the demo book applies a technical-axis
    // mistake, the large book offers. What matters for R245 is that the cure
    // changes NEITHER, and driving both trees confirms it changes neither.
    const r = resolveQuery('trades where i averaged down', BOOK, NOW, emptyFilters())
    expect(r.ambiguous.map((a) => a.text)).toContain('averaged down')
    expect(r.ambiguous[0].candidates).toContain('Added to a loser / averaged down')
    expect(r.answer ?? null).toBeNull()
  })

  it('"wins" alone still applies the outcome filter, and answers nothing', () => {
    const a = ask('wins')
    expect(a.r.state.outcome).toBe('winners')
    expect(a.answer).toBeNull()
  })

  it('"how many trades in germany" reads BOTH meanings in one sentence', () => {
    // The dual reading R245 names: "many" as count grammar AND the country as
    // a filter. On a book with no Germany the country is unread and the whole
    // ask refuses, which is the boundary doing its job — this fixture has no
    // Germany, so that is what it asserts.
    const a = ask('how many trades in germany')
    expect(a.answer).toBeNull()
    expect(a.r.state).toEqual(emptyFilters())
    expect(a.r.unresolved).toContain('germany')
  })

  it('a question word ALONE is still unread — nothing here is unconditional filler', () => {
    // "what was my worst day" is out of slice. It keeps refusing precisely
    // because no metric phrase matches, so "was" is never consumed.
    const a = ask('what was my worst day')
    expect(a.answer).toBeNull()
    expect(a.r.state).toEqual(emptyFilters())
    expect(a.r.unresolved).toContain('was')
  })

  it('and not one of them is in STOPWORDS, asserted from the shipped set', () => {
    for (const w of ANSWER_FILLER) expect(STOPWORDS.has(w), w + ' became filler').toBe(false)
    for (const w of ['average', 'rate', 'many', 'percent', 'profit', 'win', 'total', 'count']) {
      expect(STOPWORDS.has(w), w + ' became filler').toBe(false)
    }
  })
})

// --- RJ6 : ZERO AND TINY ------------------------------------------------------

describe('RJ6 an empty or undefined metric prints no number at all', () => {
  it('a filter matching NOTHING says so and shows no digit', () => {
    const a = ask('what is my average loss on qmtx')
    expect(a.sub.length).toBe(0)
    expect(a.answer).toBe('No trades match, so there is no average loss to report.')
  })

  it('a metric undefined over a non-empty set names the count AND what is missing', () => {
    // Three winners match; none of them is a loss. Zero here would invent one.
    const a = ask('what is my average loss on winners')
    expect(a.sub.length).toBe(3)
    expect(a.answer).toBe('3 trades match, but none of them is a losing trade — no average loss to report.')
  })

  it('a ratio over a tiny set is honest BECAUSE the denominator is in the sentence', () => {
    expect(ask('whats my win rate on shorts').answer).toContain('of 1 decided trade')
  })
})

// --- RJ7 : WHAT SLICE B DELIBERATELY LEAVES REFUSING --------------------------

describe('RJ7 the out-of-slice shapes refuse, and that is CHOSEN', () => {
  /** CHOSEN, this beat, slice B. Each of these is computable from what already
   *  ships; none of them is answered, and the reasons differ. */
  it('cost-of-tag refuses — R243, a sum is not a counterfactual', () => {
    const a = ask('how much did chasing cost me')
    expect(a.answer).toBeNull()
    expect(a.r.state).toEqual(emptyFilters())
    expect(a.r.unresolved.join(' ')).toContain('cost')
  })

  it('comparison refuses — two filtered aggregates, one state', () => {
    const a = ask('am i better on mondays or fridays')
    expect(a.answer).toBeNull()
    expect(a.r.state).toEqual(emptyFilters())
  })

  it('grouped superlative refuses — the answer is a day, not a number', () => {
    const a = ask('what was my worst day')
    expect(a.answer).toBeNull()
    expect(a.r.state).toEqual(emptyFilters())
  })

  it('and no metric phrase names a cost, a saving, or a what-if', () => {
    for (const k of Object.keys(ANSWER_METRIC_PHRASES)) {
      expect(k, 'a counterfactual reached the phrase table')
        .not.toMatch(/cost|save|saved|would|could/)
    }
  })
})

// --- RJ8 : THE FIELD IS ABSENT FROM THE DISCARD -------------------------------

describe('RJ8 the discard literal cannot carry an answer out', () => {
  it('the boundary return does not mention the field', () => {
    const at = SRC.indexOf('if (unresolved.length > 0) {')
    expect(at, 'the strict boundary is gone').toBeGreaterThan(-1)
    const discard = SRC.slice(at, SRC.indexOf('}', SRC.indexOf('return', at)))
    expect(discard, 'the discard literal names the answer field').not.toContain('answer')
  })

  it('and the success return does', () => {
    expect(SRC).toContain('return { state, applied, appliedSources, unresolved, ambiguous, answer }')
  })
})
