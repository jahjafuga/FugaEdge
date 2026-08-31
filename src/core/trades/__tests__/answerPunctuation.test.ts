import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '@/core/trades/queryResolver'
import { answerText } from '@/core/trades/queryAnswer'
import { applyTradesFilters, emptyFilters } from '@/core/trades/tradesFilter'

// NO EM DASH AND NO EN DASH IN ANYTHING EDGE SAYS BACK.
//
// Beat 206 censused the character across the whole tree and split it by
// surface. The Edge query surface held exactly THREE, all of them in
// queryAnswer.ts, against five hundred and ninety nine across the rest of the
// product. Those three are cured here and the rest is on the ledger.
//
// THE ROLES DIFFER, SO THE REPLACEMENTS DIFFER, and that is the whole reason
// a blanket find and replace was refused:
//   the win rate and profit factor sentences used the dash to join a HEADLINE
//   VALUE to the working that supports it, and a colon was already doing the
//   label-to-value job in the same sentence. Those take a FULL STOP, which
//   lets the number land on its own.
//   the empty-metric sentence used it to join a clause to its CONSEQUENCE,
//   with a comma already in play earlier. That takes a COLON.
//
// MEASURED BEFORE IT WAS RULED. Every composed form was driven on three books
// first and checked for a double stop or a double space. There were none, and
// the two scans were proven live against deliberately malformed strings. The
// profit factor value carries a decimal point of its own, so the ruled stop
// lands just after one; that is a number-dot then a sentence-dot, and it is
// the only place the ruling puts two dots near each other.
//
// THE LAST GUARD HERE IS THE ONE THAT MATTERS LONGEST. It drives a set of
// answer asks and asserts that NO sentence carries either character, so a
// future string that reintroduces one goes red without anybody remembering
// this beat happened.

const NOW = new Date('2026-06-15T15:00:00')
const EM = String.fromCharCode(8212)
const EN = String.fromCharCode(8211)

const BOOK: ResolverVocabulary = {
  symbols: ['NRVA', 'ZYPH'],
  regions: [],
  countries: [],
  sectors: [],
  industries: [],
  playbooks: [],
  catalystTypes: [],
  mistakes: [],
} as unknown as ResolverVocabulary

/** The same hand-computable six the answers battery uses:
 *    three winners  +300, +100, +500   sum 900   avg 300
 *    two losers     -200, -400         sum -600  avg -300
 *    one scratch    0                  so decided is five, not six
 *    win rate       three of five decided = 60.0%
 *    profit factor  900 / 600 = 1.50 */
const t = (symbol: string, side: 'long' | 'short', net_pnl: number) => ({
  id: net_pnl, date: '2026-06-10', symbol, side, net_pnl,
  open_time: '2026-06-10T13:30:00Z', close_time: '2026-06-10T13:35:00Z',
  is_open: false, playbook_id: null, playbook_tier: null, catalyst_type: null,
  region: null, country: null, sector: null, industry: null,
  mistakes: [] as string[], mistakeTags: [] as { name: string; axis: string }[],
})
const ROWS = [
  t('NRVA', 'long', 300), t('NRVA', 'long', 100), t('NRVA', 'short', -200),
  t('ZYPH', 'long', 500), t('ZYPH', 'long', -400), t('ZYPH', 'short', 0),
] as unknown as Parameters<typeof applyTradesFilters>[0]

const ask = (text: string) => {
  const r = resolveQuery(text, BOOK, NOW, emptyFilters())
  const sub = applyTradesFilters(ROWS, r.state)
  return answerText(r.answer, sub as never)
}

const noDash = (s: string | null) =>
  s !== null && !s.includes(EM) && !s.includes(EN)

// ── A : THE WIN RATE SENTENCE ───────────────────────────────────────────────

describe('A the win rate sentence carries neither character', () => {
  it('holds no em dash and no en dash', () => {
    expect(noDash(ask('what percent of my trades were winners')),
      'the win rate sentence still carries a dash').toBe(true)
  })
  it('and reads with a full stop between the value and the working', () => {
    expect(ask('what percent of my trades were winners'))
      .toBe('Win rate: 60.0%. 3 winners of 5 decided trades.')
  })
})

// ── B : THE PROFIT FACTOR SENTENCE ──────────────────────────────────────────

describe('B the profit factor sentence carries neither character', () => {
  it('holds no em dash and no en dash', () => {
    expect(noDash(ask('whats my profit factor')),
      'the profit factor sentence still carries a dash').toBe(true)
  })
  it('and reads with a full stop, even though the value ends in a decimal', () => {
    expect(ask('whats my profit factor'))
      .toBe('Profit factor: 1.50. $900.00 won against $600.00 lost, over 6 trades.')
  })
})

// ── C : THE EMPTY-METRIC SENTENCE ───────────────────────────────────────────

describe('C the empty-metric sentence carries neither character', () => {
  it('holds no em dash and no en dash', () => {
    expect(noDash(ask('what is my average loss on winners')),
      'the empty-metric sentence still carries a dash').toBe(true)
  })
  it('and reads with a COLON, because the clause introduces a consequence', () => {
    expect(ask('what is my average loss on winners'))
      .toBe('3 trades match, but none of them is a losing trade: no average loss to report.')
  })
})

// ── D : NOTHING THE ANSWER PATH EMITS MAY CARRY EITHER CHARACTER ────────────

/** The guard that outlives the beat. Every one of these produces an answer;
 *  none of them may carry either character, now or ever. */
const ANSWER_ASKS = [
  'what percent of my trades were winners',
  'whats my profit factor',
  'what is my average loss on winners',
  'what is my average loss',
  'what is my average gain on winners',
  'how many losing trades did i have',
  'what is my total pnl',
  'whats my average hold time',
]

describe('D no answer sentence carries an em dash or an en dash', () => {
  it.each(ANSWER_ASKS)('%s', (q) => {
    const a = ask(q)
    expect(a, 'this ask stopped producing an answer at all').not.toBeNull()
    expect(noDash(a), 'an answer sentence carries a dash').toBe(true)
  })
  it('and the set really does produce answers, so the sweep is not vacuous', () => {
    const answered = ANSWER_ASKS.map(ask).filter((a) => a !== null)
    expect(answered.length, 'the sweep asserted over nothing').toBe(ANSWER_ASKS.length)
  })
})

// ── E : THE NUMBERS DID NOT MOVE ────────────────────────────────────────────

describe('E a wording cure moved no number', () => {
  // These assert on the NUMBERS ONLY, never on the punctuation, so they pass
  // before and after. If a punctuation cure ever changed an answer, they go red
  // while A, B and C stay green, and the shape of the failure names the cause.
  it('the win rate keeps its value and its working', () => {
    const a = ask('what percent of my trades were winners') ?? ''
    expect(a).toContain('60.0%')
    expect(a).toContain('3 winners of 5 decided trades')
  })
  it('the profit factor keeps its value and both sums', () => {
    const a = ask('whats my profit factor') ?? ''
    expect(a).toContain('1.50')
    expect(a).toContain('$900.00 won against $600.00 lost')
    expect(a).toContain('over 6 trades')
  })
  it('the empty-metric sentence keeps its count and its label', () => {
    const a = ask('what is my average loss on winners') ?? ''
    expect(a).toContain('3 trades match')
    expect(a).toContain('no average loss to report')
  })
})
