import { describe, it, expect } from 'vitest'
// RED: module under test.
import { ema } from '../ema'

describe('ema — SMA-seeded exponential moving average', () => {
  // Hand-computed reference fixture: values [2,4,6,8,10,12], period 3.
  //   k = 2 / (3 + 1) = 0.5
  //   seed (idx 2)   = SMA(2,4,6) = 12 / 3 = 4
  //   idx 3 = 8*0.5  + 4*0.5  = 6
  //   idx 4 = 10*0.5 + 6*0.5  = 8
  //   idx 5 = 12*0.5 + 8*0.5  = 10
  const VALUES = [2, 4, 6, 8, 10, 12]
  const PERIOD = 3
  const K = 2 / (PERIOD + 1)

  it('(1) output length equals input length', () => {
    expect(ema(VALUES, PERIOD)).toHaveLength(VALUES.length)
  })

  it('(2) the first period-1 outputs are null, the seed index is not', () => {
    const out = ema(VALUES, PERIOD)
    for (let i = 0; i < PERIOD - 1; i++) expect(out[i]).toBeNull()
    expect(out[PERIOD - 1]).not.toBeNull()
  })

  it('(3) index period-1 is seeded with the SMA of the first period values', () => {
    const out = ema(VALUES, PERIOD)
    const sma = (VALUES[0] + VALUES[1] + VALUES[2]) / 3
    expect(out[PERIOD - 1]).toBe(sma) // 4
  })

  it('(4) the recurrence holds after the seed (bit-exact)', () => {
    const out = ema(VALUES, PERIOD)
    const expectedAtPeriod =
      VALUES[PERIOD] * K + (out[PERIOD - 1] as number) * (1 - K)
    expect(out[PERIOD]).toBe(expectedAtPeriod) // 6
    expect(out).toEqual([null, null, 4, 6, 8, 10])
  })

  it('(5) period = 1 ⇒ K = 1 ⇒ output mirrors input at every index', () => {
    expect(ema([5, 7, 9, 11], 1)).toEqual([5, 7, 9, 11])
  })

  it('(6) empty input returns an empty array', () => {
    expect(ema([], PERIOD)).toEqual([])
  })

  it('(7) input shorter than period ⇒ all null (no seed point reachable)', () => {
    expect(ema([1, 2], 3)).toEqual([null, null])
  })
})
