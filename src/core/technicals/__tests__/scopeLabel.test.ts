import { describe, it, expect } from 'vitest'
import { technicalsScopeLabel } from '../scopeLabel'

// The filter-aware in-tab scope line (Beat 2), EXTENDED to the "X of Y"
// bridge by the TA definition-drift fix (2026-07-03 fork ruling): X = the
// tab's windowed population, Y = the all-time total the page subtitle
// shows — two populations, labeled apart on one line. The line still never
// names the date range when a ticker/playbook filter has narrowed the
// population beyond it. Singular/plural stays keyed on X (the pre-fix
// behavior, preserved exactly). The prior single-number pins INVERTED here
// with the extension.

describe('technicalsScopeLabel — the X of Y bridge', () => {
  it('no filters → names the range with both populations', () => {
    expect(
      technicalsScopeLabel({
        count: 35,
        totalCount: 98,
        hasTickerFilter: false,
        hasPlaybookFilter: false,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('35 of 98 round trips in the last 30 days')
  })

  it('the whole-book case renders normally — never special-cased away', () => {
    expect(
      technicalsScopeLabel({
        count: 98,
        totalCount: 98,
        hasTickerFilter: false,
        hasPlaybookFilter: false,
        rangeLabel: 'the selected range',
      }),
    ).toBe('98 of 98 round trips in the selected range')
  })

  it('ticker filter active → "matching filters", range NOT named, bridge kept', () => {
    expect(
      technicalsScopeLabel({
        count: 12,
        totalCount: 98,
        hasTickerFilter: true,
        hasPlaybookFilter: false,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('12 of 98 round trips matching filters')
  })

  it('playbook filter active → "matching filters", range NOT named', () => {
    expect(
      technicalsScopeLabel({
        count: 12,
        totalCount: 98,
        hasTickerFilter: false,
        hasPlaybookFilter: true,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('12 of 98 round trips matching filters')
  })

  it('both filters active → still "matching filters"', () => {
    expect(
      technicalsScopeLabel({
        count: 12,
        totalCount: 98,
        hasTickerFilter: true,
        hasPlaybookFilter: true,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('12 of 98 round trips matching filters')
  })

  it("singular at count=1 — X's pre-fix handling preserved exactly (noun keyed on X)", () => {
    expect(
      technicalsScopeLabel({
        count: 1,
        totalCount: 98,
        hasTickerFilter: false,
        hasPlaybookFilter: false,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('1 of 98 round trip in the last 30 days')
  })

  it('count=0 → "0 of Y ..." (helper does not suppress; the component hides only while loading)', () => {
    expect(
      technicalsScopeLabel({
        count: 0,
        totalCount: 98,
        hasTickerFilter: false,
        hasPlaybookFilter: false,
        rangeLabel: 'the last 30 days',
      }),
    ).toBe('0 of 98 round trips in the last 30 days')
  })
})
