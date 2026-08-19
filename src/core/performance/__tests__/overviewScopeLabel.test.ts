// v0.2.7 Feature 1, the missing half — the Overview tab's scope vocabulary.
//
// RULING: a scope label reflects the ACTIVE filter, or it says nothing. A chart
// headed "All time" while showing seven days is worse than an untitled chart,
// and a chart headed "All time" while showing one ticker is the same lie in a
// different dimension — the titles reacted to the date range only.
//
// Mirrors src/core/technicals/scopeLabel.ts, which solved this for the Technicals
// tab (the "vanishing 255" report): when a non-date filter narrows the set, naming
// the date range OVERCLAIMS, so the range is named only while it is the whole story.

import { describe, expect, it } from 'vitest'
import {
  overviewCountLine,
  overviewScope,
} from '../overviewScopeLabel'

describe('overviewScope — the one scope string the tab speaks', () => {
  it('names the range when the range is the whole story', () => {
    expect(overviewScope({ rangeLabel: 'All time', narrowed: false })).toBe('All time')
    expect(overviewScope({ rangeLabel: '7 days', narrowed: false })).toBe('7 days')
    expect(overviewScope({ rangeLabel: 'YTD', narrowed: false })).toBe('YTD')
  })

  it('DROPS "All time" the moment another filter narrows the set', () => {
    // The date scope really is all time, but the population is not, so saying so
    // would overclaim in exactly the way the ruling forbids.
    expect(overviewScope({ rangeLabel: 'All time', narrowed: true })).toBe('Filtered')
    expect(overviewScope({ rangeLabel: 'All time', narrowed: true })).not.toMatch(/all time/i)
  })

  it('keeps a REAL range and adds the narrowing beside it', () => {
    // Unlike "All time", a 7-day window is a genuine constraint worth naming — it
    // just is not the only one in play.
    expect(overviewScope({ rangeLabel: '7 days', narrowed: true })).toBe('7 days, filtered')
  })
})

describe('overviewCountLine — the in-tab X of Y bridge', () => {
  it('states the filtered count against the tab own population', () => {
    expect(
      overviewCountLine({ count: 2, total: 3, scope: 'Filtered' }),
    ).toBe('2 of 3 round trips · Filtered')
  })

  it('pluralises on the filtered count, not the total', () => {
    expect(overviewCountLine({ count: 1, total: 28, scope: 'All time' })).toContain(
      '1 of 28 round trip ·',
    )
    expect(overviewCountLine({ count: 2, total: 28, scope: 'All time' })).toContain(
      '2 of 28 round trips ·',
    )
  })

  it('says zero honestly rather than hiding', () => {
    expect(overviewCountLine({ count: 0, total: 28, scope: '7 days' })).toBe(
      '0 of 28 round trips · 7 days',
    )
  })
})
