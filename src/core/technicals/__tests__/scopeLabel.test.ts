import { describe, it, expect } from 'vitest'
import { technicalsScopeLabel } from '../scopeLabel'

// The filter-aware in-tab scope line (Beat 2). The line must NEVER name the date
// range when a ticker/playbook filter has narrowed the population beyond it — it
// reads "matching filters" instead. Singular/plural on the count.

describe('technicalsScopeLabel', () => {
  it('no filters → names the range', () => {
    expect(
      technicalsScopeLabel({
        count: 98,
        hasTickerFilter: false,
        hasPlaybookFilter: false,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('98 round trips in the last 30 days')
  })

  it('ticker filter active → "matching filters", range NOT named', () => {
    expect(
      technicalsScopeLabel({
        count: 98,
        hasTickerFilter: true,
        hasPlaybookFilter: false,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('98 round trips matching filters')
  })

  it('playbook filter active → "matching filters", range NOT named', () => {
    expect(
      technicalsScopeLabel({
        count: 98,
        hasTickerFilter: false,
        hasPlaybookFilter: true,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('98 round trips matching filters')
  })

  it('both filters active → still "matching filters"', () => {
    expect(
      technicalsScopeLabel({
        count: 98,
        hasTickerFilter: true,
        hasPlaybookFilter: true,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('98 round trips matching filters')
  })

  it('singular at count=1', () => {
    expect(
      technicalsScopeLabel({
        count: 1,
        hasTickerFilter: false,
        hasPlaybookFilter: false,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('1 round trip in the last 30 days')
  })

  it('count=0 → shown as "0 round trips in {range}" (helper does not suppress; the component hides only while loading)', () => {
    expect(
      technicalsScopeLabel({
        count: 0,
        hasTickerFilter: false,
        hasPlaybookFilter: false,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('0 round trips in the last 30 days')
  })
})
