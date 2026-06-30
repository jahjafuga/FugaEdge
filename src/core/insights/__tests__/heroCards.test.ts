import { describe, it, expect } from 'vitest'
import type { InsightResult } from '../types'
import { selectHeroCards } from '../heroCards'

// v0.2.5 Edge Intelligence Beat 3 — the three prescriptive hero cards are a PURE
// SELECTOR over runAllInsightRules output (no new detection). These pin the
// floor (n>=10), the secondary sort, the positive/negative picks, the Focus-from-
// leak derivation, and the degrade-in-place empty cases.

let _id = 0
function mk(over: Partial<InsightResult>): InsightResult {
  _id += 1
  return {
    id: `i${_id}`,
    rule: 'r',
    tone: 'positive',
    title: 'Title',
    body: 'A stat sentence. Do the thing.',
    metric: '+$100',
    priority: 100,
    n: 20,
    ...over,
  }
}

describe('selectHeroCards — picks', () => {
  it('edge = top-priority POSITIVE; leak = top-priority NEGATIVE', () => {
    const insights = [
      mk({ tone: 'positive', priority: 300, n: 20, title: 'Edge A' }),
      mk({ tone: 'positive', priority: 150, n: 20, title: 'Edge B' }),
      mk({ tone: 'negative', priority: 250, n: 20, title: 'Leak A', metric: '−$250' }),
      mk({ tone: 'neutral', priority: 999, n: 20, title: 'Neutral' }),
    ]
    const r = selectHeroCards(insights)
    expect(r.edge?.title).toBe('Edge A')
    expect(r.leak?.title).toBe('Leak A')
  })
})

describe('selectHeroCards — low-sample floor (n >= 10)', () => {
  it('a top-priority n=3 insight is NOT featured; falls to the next n>=10 candidate', () => {
    const insights = [
      mk({ tone: 'positive', priority: 500, n: 3, title: 'Flukey' }),
      mk({ tone: 'positive', priority: 120, n: 14, title: 'Robust' }),
    ]
    expect(selectHeroCards(insights).edge?.title).toBe('Robust')
  })
  it('no positive clears the floor → edge null', () => {
    const insights = [mk({ tone: 'positive', priority: 900, n: 4 })]
    expect(selectHeroCards(insights).edge).toBeNull()
  })
  it('the floor is configurable', () => {
    const insights = [mk({ tone: 'positive', priority: 100, n: 6, title: 'Six' })]
    expect(selectHeroCards(insights, { minHeroN: 5 }).edge?.title).toBe('Six')
    expect(selectHeroCards(insights, { minHeroN: 10 }).edge).toBeNull()
  })
})

describe('selectHeroCards — secondary sort (priority tie → n desc, then |metric|)', () => {
  it('same priority → higher n wins', () => {
    const insights = [
      mk({ tone: 'negative', priority: 100, n: 12, title: 'Fewer', metric: '−$50' }),
      mk({ tone: 'negative', priority: 100, n: 30, title: 'More', metric: '−$50' }),
    ]
    expect(selectHeroCards(insights).leak?.title).toBe('More')
  })
  it('same priority AND n → larger |metric| wins', () => {
    const insights = [
      mk({ tone: 'negative', priority: 100, n: 20, metric: '−$40', title: 'Small' }),
      mk({ tone: 'negative', priority: 100, n: 20, metric: '−$1,200', title: 'Big' }),
    ]
    expect(selectHeroCards(insights).leak?.title).toBe('Big')
  })
})

describe('selectHeroCards — Focus Area (derived from the SAME leak)', () => {
  it('action = the leak body’s trailing directive sentence; leakInsight === leak', () => {
    const leak = mk({ tone: 'negative', priority: 100, n: 20, metric: '−$30', body: 'You bleed in the open. Wait for the pullback.' })
    const r = selectHeroCards([leak])
    expect(r.focus.leakInsight).toBe(r.leak)
    expect(r.focus.action).toBe('Wait for the pullback.')
  })
  it('dollar present only when the leak metric is a money figure', () => {
    const money = selectHeroCards([mk({ tone: 'negative', priority: 100, n: 20, metric: '−$30' })])
    expect(money.focus.dollar).toBe('−$30')
    const ratio = selectHeroCards([mk({ tone: 'negative', priority: 100, n: 20, metric: '2.5×' })])
    expect(ratio.focus.dollar).toBeNull()
  })
})

describe('selectHeroCards — degrade-in-place empties', () => {
  it('no positive → edge null; no negative → leak + focus null/empty', () => {
    const r = selectHeroCards([mk({ tone: 'positive', priority: 100, n: 20 })])
    expect(r.edge).not.toBeNull()
    expect(r.leak).toBeNull()
    expect(r.focus.leakInsight).toBeNull()
    expect(r.focus.dollar).toBeNull()
    expect(r.focus.action).toBe('')
  })
  it('empty input → all null/empty', () => {
    const r = selectHeroCards([])
    expect(r.edge).toBeNull()
    expect(r.leak).toBeNull()
    expect(r.focus).toEqual({ leakInsight: null, action: '', dollar: null })
  })
})

describe('selectHeroCards — leak-slot sign guard (defense-in-depth)', () => {
  it('RED#b: positive strongest-day → edge; negative weakest-day → leak', () => {
    const insights = [
      mk({ tone: 'positive', title: 'strongest day', metric: '+$1,280', priority: 1570, n: 29 }),
      mk({ tone: 'negative', title: 'weakest day', metric: '−$300', priority: 420, n: 12 }),
    ]
    const r = selectHeroCards(insights)
    expect(r.edge?.title).toBe('strongest day')
    expect(r.leak?.title).toBe('weakest day')
    expect(r.leak?.tone).toBe('negative')
  })

  it('RED#c: a negative-tone insight with a POSITIVE money metric is rejected from the leak slot', () => {
    const insights = [
      // mislabeled — negative tone but positive dollar metric, AND higher priority
      mk({ tone: 'negative', title: 'Mislabeled', metric: '+$1,280', priority: 900, n: 29 }),
      mk({ tone: 'negative', title: 'Real loss', metric: '−$200', priority: 100, n: 12 }),
    ]
    const r = selectHeroCards(insights)
    // the genuine loss wins despite lower priority — a positive metric can't be a leak
    expect(r.leak?.title).toBe('Real loss')
  })

  it('RED#c: a lone mislabeled positive-money negative → no leak and no Focus', () => {
    const r = selectHeroCards([mk({ tone: 'negative', metric: '+$1,280', priority: 900, n: 29 })])
    expect(r.leak).toBeNull()
    expect(r.focus.leakInsight).toBeNull()
    expect(r.focus.dollar).toBeNull()
  })

  it('non-money negative metrics (%, ×, R) are unaffected by the guard', () => {
    const r = selectHeroCards([
      mk({ tone: 'negative', title: 'Inverted RR', metric: '0.62×', priority: 300, n: 20 }),
    ])
    expect(r.leak?.title).toBe('Inverted RR')
  })
})
