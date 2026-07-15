import { describe, it, expect } from 'vitest'
import type { IntradayBar } from '@shared/market-types'
import { vwap } from '../vwap'

// Fixtures anchored on 2026-07-15 (EDT, UTC-4), so 09:30 ET = 13:30 UTC.
// Since the v0.2.5 anchor unification (reversing the v0.2.4 §A9 session gate),
// the 09:30 boundary carries NO special meaning here — VWAP accumulates from
// the FIRST bar of the input (premarket included), matching the chart's own
// overlay (ChartTab.tsx:2030). The pre/post-open bar times are kept so the
// fixtures prove the boundary's irrelevance, not just avoid it.
//   09:25 ET = 13:25:00Z  (premarket — now a full accumulator member)
//   09:30 ET = 13:30:00Z
//   09:31 ET = 13:31:00Z
const T_0925 = Date.parse('2026-07-15T13:25:00Z')
const T_0930 = Date.parse('2026-07-15T13:30:00Z')
const T_0931 = Date.parse('2026-07-15T13:31:00Z')

// hlc3(09:25) = (8 + 6 + 7) / 3 = 7
const BAR_0925: IntradayBar = { t: T_0925, o: 7, h: 8, l: 6, c: 7, v: 50 }
// hlc3(09:30) = (11 + 9 + 10) / 3 = 10
const BAR_0930: IntradayBar = { t: T_0930, o: 10, h: 11, l: 9, c: 10, v: 100 }
// hlc3(09:31) = (13 + 11 + 12) / 3 = 12
const BAR_0931: IntradayBar = { t: T_0931, o: 12, h: 13, l: 11, c: 12, v: 300 }

describe('vwap — day VWAP anchored at the FIRST bar (premarket included)', () => {
  it('(1) premarket bars are numeric accumulator members, not null', () => {
    const out = vwap([BAR_0925, BAR_0930, BAR_0931])
    expect(out[0].value).toBe(7) // its own hlc3 — first accumulator member
    // (7*50 + 10*100) / 150 = 1350 / 150 = 9
    expect(out[1].value).toBe(9)
    // (7*50 + 10*100 + 12*300) / 450 = 4950 / 450 = 11
    expect(out[2].value).toBe(11)
  })

  it('(2) the first bar of the input equals its own hlc3 (sole accumulator member) — wherever it falls in the day', () => {
    expect(vwap([BAR_0925, BAR_0930])[0].value).toBe(7)
    expect(vwap([BAR_0930, BAR_0931])[0].value).toBe(10)
  })

  it('(3) the 09:31 bar VWAP is the volume-weighted mean of 09:30 + 09:31', () => {
    const out = vwap([BAR_0930, BAR_0931])
    // (10*100 + 12*300) / (100 + 300) = 4600 / 400 = 11.5
    expect(out[1].value).toBe(11.5)
  })

  it('(4) empty input returns an empty array', () => {
    expect(vwap([])).toEqual([])
  })

  it('(5) a premarket-only series is fully numeric (was all-null under the retired session gate)', () => {
    expect(vwap([BAR_0925])).toEqual([{ time: T_0925, value: 7 }])
  })

  it('(6) output length equals input length', () => {
    expect(vwap([BAR_0925, BAR_0930, BAR_0931])).toHaveLength(3)
  })

  it('(7) the output time field maps 1:1 to the input bar.t', () => {
    const out = vwap([BAR_0925, BAR_0930, BAR_0931])
    expect(out.map((p) => p.time)).toEqual([T_0925, T_0930, T_0931])
  })
})
