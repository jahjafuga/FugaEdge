import { describe, it, expect } from 'vitest'
import type { IntradayBar } from '@shared/market-types'
// RED: module under test.
import { vwap } from '../vwap'

// Fixtures anchored on 2026-07-15 (EDT, UTC-4), so 09:30 ET = 13:30 UTC.
// The 13:30Z → 09:30 ET mapping is independently locked by format.test.ts.
//   09:25 ET = 13:25:00Z  (pre-open)
//   09:30 ET = 13:30:00Z  (session open — first accumulator)
//   09:31 ET = 13:31:00Z
const T_0925 = Date.parse('2026-07-15T13:25:00Z')
const T_0930 = Date.parse('2026-07-15T13:30:00Z')
const T_0931 = Date.parse('2026-07-15T13:31:00Z')

// hlc3(09:30) = (11 + 9 + 10) / 3 = 10
const BAR_0925: IntradayBar = { t: T_0925, o: 7, h: 8, l: 6, c: 7, v: 50 }
const BAR_0930: IntradayBar = { t: T_0930, o: 10, h: 11, l: 9, c: 10, v: 100 }
// hlc3(09:31) = (13 + 11 + 12) / 3 = 12
const BAR_0931: IntradayBar = { t: T_0931, o: 12, h: 13, l: 11, c: 12, v: 300 }

describe('vwap — session VWAP anchored at the 09:30 ET regular-session open', () => {
  it('(1) pre-9:30 bars are null; the 09:30 bar and later are numeric', () => {
    const out = vwap([BAR_0925, BAR_0930, BAR_0931])
    expect(out[0].value).toBeNull()
    expect(typeof out[1].value).toBe('number')
    expect(typeof out[2].value).toBe('number')
  })

  it('(2) the 09:30 bar VWAP equals its own hlc3 (sole accumulator member)', () => {
    const out = vwap([BAR_0925, BAR_0930])
    expect(out[1].value).toBe(10) // (11 + 9 + 10) / 3
  })

  it('(3) the 09:31 bar VWAP is the volume-weighted mean of 09:30 + 09:31', () => {
    const out = vwap([BAR_0930, BAR_0931])
    // (10*100 + 12*300) / (100 + 300) = 4600 / 400 = 11.5
    expect(out[1].value).toBe(11.5)
  })

  it('(4) empty input returns an empty array', () => {
    expect(vwap([])).toEqual([])
  })

  it('(5) only pre-9:30 bars ⇒ every value null', () => {
    expect(vwap([BAR_0925])).toEqual([{ time: T_0925, value: null }])
  })

  it('(6) output length equals input length', () => {
    expect(vwap([BAR_0925, BAR_0930, BAR_0931])).toHaveLength(3)
  })

  it('(7) the output time field maps 1:1 to the input bar.t', () => {
    const out = vwap([BAR_0925, BAR_0930, BAR_0931])
    expect(out.map((p) => p.time)).toEqual([T_0925, T_0930, T_0931])
  })
})
