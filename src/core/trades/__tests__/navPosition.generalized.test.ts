import { describe, it, expect } from 'vitest'
import { getNavPosition } from '../tradeNavigation'

// DAVE day/week-modal cycling — the nav-position helper generalized to string
// date keys (the Day modal walks the month's days-with-trades, the Week modal
// walks the month grid's six week_starts). Same contract as the trade-id
// precedent: pure, operates on the DISPLAYED ordered keys, no wrap — ends
// resolve to null. getTradeNavPosition stays as the number-typed wrapper; its
// suite in tradeNavigation.test.ts is untouched.
const DAYS = ['2026-05-04', '2026-05-06', '2026-05-08', '2026-05-12']

describe('getNavPosition (generalized nav position, string date keys)', () => {
  it('middle date: both neighbours, correct index/total', () => {
    expect(getNavPosition(DAYS, '2026-05-06')).toEqual({
      prevId: '2026-05-04',
      nextId: '2026-05-08',
      index: 1,
      total: 4,
    })
  })

  it('first date: prev null (no wrap), next set', () => {
    expect(getNavPosition(DAYS, '2026-05-04')).toEqual({
      prevId: null,
      nextId: '2026-05-06',
      index: 0,
      total: 4,
    })
  })

  it('last date: next null (no wrap), prev set', () => {
    expect(getNavPosition(DAYS, '2026-05-12')).toEqual({
      prevId: '2026-05-08',
      nextId: null,
      index: 3,
      total: 4,
    })
  })

  it('single-day month: both null, index 0, total 1', () => {
    expect(getNavPosition(['2026-05-04'], '2026-05-04')).toEqual({
      prevId: null,
      nextId: null,
      index: 0,
      total: 1,
    })
  })

  it('key not in the population (e.g. a zero-trade day): both null, index -1, total preserved', () => {
    expect(getNavPosition(DAYS, '2026-05-05')).toEqual({
      prevId: null,
      nextId: null,
      index: -1,
      total: 4,
    })
  })

  it('null key: both null, index -1, total preserved', () => {
    expect(getNavPosition(DAYS, null)).toEqual({
      prevId: null,
      nextId: null,
      index: -1,
      total: 4,
    })
  })

  it('number keys flow through the same generic (trade-id parity)', () => {
    expect(getNavPosition([10, 20, 30], 20)).toEqual({
      prevId: 10,
      nextId: 30,
      index: 1,
      total: 3,
    })
  })
})
