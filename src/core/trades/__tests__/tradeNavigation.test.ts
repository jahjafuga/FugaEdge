import { describe, it, expect } from 'vitest'
import { getTradeNavPosition } from '../tradeNavigation'

// Trade navigation (prev/next + position) over the DISPLAYED ordered ids — pure,
// no wrap. Ids are arbitrary integers (mirrors trades.id) in their displayed order.
const IDS = [10, 20, 30, 40]

describe('getTradeNavPosition', () => {
  it('middle item: both neighbors, correct index/total', () => {
    expect(getTradeNavPosition(IDS, 20)).toEqual({
      prevId: 10,
      nextId: 30,
      index: 1,
      total: 4,
    })
  })

  it('first item: prevId null (no wrap), nextId set', () => {
    expect(getTradeNavPosition(IDS, 10)).toEqual({
      prevId: null,
      nextId: 20,
      index: 0,
      total: 4,
    })
  })

  it('last item: nextId null (no wrap), prevId set', () => {
    expect(getTradeNavPosition(IDS, 40)).toEqual({
      prevId: 30,
      nextId: null,
      index: 3,
      total: 4,
    })
  })

  it('single-item list: both null, index 0, total 1', () => {
    expect(getTradeNavPosition([99], 99)).toEqual({
      prevId: null,
      nextId: null,
      index: 0,
      total: 1,
    })
  })

  it('empty list: both null, index -1, total 0', () => {
    expect(getTradeNavPosition([], 5)).toEqual({
      prevId: null,
      nextId: null,
      index: -1,
      total: 0,
    })
  })

  it('currentId not in list: both null, index -1, total preserved', () => {
    expect(getTradeNavPosition([10, 20, 30], 999)).toEqual({
      prevId: null,
      nextId: null,
      index: -1,
      total: 3,
    })
  })

  it('currentId null: both null, index -1, total preserved', () => {
    expect(getTradeNavPosition([10, 20, 30], null)).toEqual({
      prevId: null,
      nextId: null,
      index: -1,
      total: 3,
    })
  })
})
