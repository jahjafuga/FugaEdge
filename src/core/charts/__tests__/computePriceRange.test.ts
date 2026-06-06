import { describe, it, expect } from 'vitest'
import { computeFramedBand, type FramedBandInput, type ComputePriceRangeOptions } from '../computePriceRange'

// epoch-ms bars; the window is [100, 200] throughout unless noted.
const bar = (t: number, h: number, l: number) => ({ t, h, l })
const WINDOW = { fromMs: 100, toMs: 200 }
const NOPAD = { padRatio: 0, minPadFraction: 0 }

function band(over: Partial<FramedBandInput>, opts: ComputePriceRangeOptions = NOPAD) {
  return computeFramedBand(
    { bars: [], fillPrices: [], indicatorSeries: [], window: WINDOW, ...over },
    opts,
  )
}

describe('computeFramedBand — fixed window-union band (v0.2.4 Step 0.5 pin)', () => {
  it('spans the in-window bar high/low union', () => {
    expect(band({ bars: [bar(100, 10, 9), bar(150, 12, 8), bar(200, 11, 9)] }))
      .toEqual({ minValue: 8, maxValue: 12 })
  })

  it('EXCLUDES out-of-window bars — a later runner spike does not expand the band', () => {
    // STI shape: in-window bars top out at 12; a $40 spike bar sits OUTSIDE the
    // window and must be ignored (else the scalp gets squashed ~32x).
    expect(band({ bars: [bar(150, 12, 8), bar(500, 40, 38)] }))
      .toEqual({ minValue: 8, maxValue: 12 })
  })

  it('INCLUDES an in-window indicator dipping BELOW the in-window bar low (STI lagging-MA)', () => {
    // bars in-window only reach down to 14.42; a lagging EMA/VWAP point is at
    // 12.37 INSIDE the window — the band must reach it or it would clip.
    const out = band({
      bars: [bar(150, 16.66, 14.42)],
      fillPrices: [15.8],
      indicatorSeries: [[{ time: 150, value: 12.37 }]],
    })!
    expect(out.minValue).toBeCloseTo(12.37, 6) // reached the indicator, not 14.42
    expect(out.maxValue).toBeCloseTo(16.66, 6)
  })

  it('INCLUDES fills and an in-window indicator above the bars', () => {
    expect(band({
      bars: [bar(150, 16, 15)],
      fillPrices: [16.06],
      indicatorSeries: [[{ time: 150, value: 17 }]],
    })).toEqual({ minValue: 15, maxValue: 17 })
  })

  it('is toggle-independent: skips null indicator series, honors present ones', () => {
    expect(band({
      bars: [bar(150, 16, 15)],
      indicatorSeries: [null, [{ time: 150, value: 20 }], null],
    })).toEqual({ minValue: 15, maxValue: 20 })
  })

  it('excludes out-of-window indicator points', () => {
    expect(band({
      bars: [bar(150, 16, 15)],
      indicatorSeries: [[{ time: 50, value: 100 }, { time: 150, value: 15.5 }, { time: 999, value: 0.1 }]],
    })).toEqual({ minValue: 15, maxValue: 16 }) // only the time=150 point (within [15,16]) counts
  })

  it('pads symmetrically: pad = max(span*padRatio, mid*minPadFraction)', () => {
    // span 10, padRatio 0.1 → pad 1 → [9, 21]
    expect(band({ bars: [bar(150, 20, 10)] }, { padRatio: 0.1, minPadFraction: 0 }))
      .toEqual({ minValue: 9, maxValue: 21 })
  })

  it('floors the pad via minPadFraction for a near-flat band', () => {
    // span 0 → pad = mid(15)*0.01 = 0.15 → [14.85, 15.15]
    const out = band({ bars: [bar(150, 15, 15)], fillPrices: [15] }, { padRatio: 0, minPadFraction: 0.01 })!
    expect(out.minValue).toBeCloseTo(14.85, 6)
    expect(out.maxValue).toBeCloseTo(15.15, 6)
  })

  it('returns null when nothing falls in the window (caller falls back to base autoscale)', () => {
    expect(band({ bars: [bar(500, 40, 38)], indicatorSeries: [[{ time: 999, value: 1 }]] }, {}))
      .toBeNull()
  })
})
