import { describe, it, expect } from 'vitest'
import type { IntradayBar } from '@shared/market-types'
import { aggregate } from '../aggregate'

const MIN = 60_000

// Synthetic 1-minute bar with explicit OHLCV so each per-bucket rule
// (first-open / last-close / max-high / min-low / summed-volume) is
// independently observable.
function bar(t: number, o: number, h: number, l: number, c: number, v: number): IntradayBar {
  return { t, o, h, l, c, v }
}

describe('aggregate — pass-through', () => {
  it('returns the input array reference-equal when minutes <= 1', () => {
    const bars = [bar(0, 1, 1, 1, 1, 10), bar(MIN, 2, 2, 2, 2, 20)]
    expect(aggregate(bars, 1)).toBe(bars)
    expect(aggregate(bars, 0)).toBe(bars)
  })

  it('returns the input array reference-equal on empty input', () => {
    const empty: IntradayBar[] = []
    expect(aggregate(empty, 5)).toBe(empty)
  })
})

describe('aggregate — 5-minute bucketing', () => {
  // 25 one-minute bars anchored at a 5-min-aligned epoch → 5 buckets of 5.
  // o=i+1, h=i+2, l=i, c=i+1, v=1 so a 5-bar bucket has predictable OHLCV.
  const BASE = 1_800_000_000_000 // 5-min aligned (6_000_000 * 300_000)
  const bars = Array.from({ length: 25 }, (_, i) =>
    bar(BASE + i * MIN, i + 1, i + 2, i, i + 1, 1),
  )

  it('produces 5 buckets of 5 bars each', () => {
    expect(aggregate(bars, 5).length).toBe(5)
  })

  it('bucket OHLC = first-open / last-close / max-high / min-low / summed-volume', () => {
    const out = aggregate(bars, 5)
    // Bucket 0 covers bars 0..4 (closes 1..5).
    expect(out[0].o).toBe(1) // first bar's open
    expect(out[0].c).toBe(5) // last bar's close
    expect(out[0].h).toBe(6) // max high = close(5)+1
    expect(out[0].l).toBe(0) // min low = close(1)-1
    expect(out[0].v).toBe(5) // summed volume
    // Bucket 4 covers bars 20..24 (closes 21..25).
    expect(out[4].o).toBe(21)
    expect(out[4].c).toBe(25)
    expect(out[4].h).toBe(26)
    expect(out[4].l).toBe(20)
    expect(out[4].v).toBe(5)
  })

  it('labels each bucket with its grid-aligned start time (floor(t/bucketMs)*bucketMs)', () => {
    const out = aggregate(bars, 5)
    const bucketMs = 5 * MIN
    expect(out[0].t).toBe(BASE)
    expect(out[1].t).toBe(BASE + bucketMs)
    expect(out[4].t).toBe(BASE + 4 * bucketMs)
  })
})

describe('aggregate — bucket boundaries', () => {
  it('places two bars on opposite sides of a 5-minute boundary in different buckets', () => {
    const bucketMs = 5 * MIN
    const boundary = 1_800_000_000_000 // 5-min aligned
    const before = bar(boundary - MIN, 10, 10, 10, 10, 1)
    const onBoundary = bar(boundary, 20, 20, 20, 20, 1)
    const out = aggregate([before, onBoundary], 5)
    expect(out.length).toBe(2)
    expect(out[0].t).toBe(boundary - bucketMs) // before-bar's bucket
    expect(out[1].t).toBe(boundary) // on-boundary bar's bucket
  })
})

describe('aggregate — ordering', () => {
  it('emits buckets strictly ascending by t for ascending input', () => {
    const BASE = 1_800_000_000_000
    const bars = Array.from({ length: 30 }, (_, i) => bar(BASE + i * MIN, i, i, i, i, 1))
    const out = aggregate(bars, 5)
    for (let i = 1; i < out.length; i++) {
      expect(out[i].t).toBeGreaterThan(out[i - 1].t)
    }
  })
})
