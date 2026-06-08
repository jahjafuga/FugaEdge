import { describe, it, expect } from 'vitest'
import type { IntradayBar } from '@shared/market-types'
import { computeMacd } from '../macd'
import { computeMacdWithWarmup } from '../macdWithWarmup'

const MIN = 60_000
const FIVE_MIN = 5 * MIN

// Deterministic, decelerating S-curve close → non-degenerate MACD line and
// histogram (a flat ramp would collapse the histogram to ~0). Mirrors the
// logistic generator in macd.test.ts; kept local per the build prompt.
function logisticClose(i: number, mid = 40, steep = 8, base = 100, amp = 50): number {
  return base + amp / (1 + Math.exp(-(i - mid) / steep))
}

// Deterministic ascending bar series. closeAt(i) drives O=H=L=C so the
// tests pin MACD plumbing, not candle shape; volume constant.
function makeBars(
  count: number,
  startT: number,
  stepMs: number,
  closeAt: (i: number) => number,
): IntradayBar[] {
  return Array.from({ length: count }, (_, i) => {
    const c = closeAt(i)
    return { t: startT + i * stepMs, o: c, h: c, l: c, c, v: 100 }
  })
}

const BASE = 1_800_000_000_000 // 5-min-aligned anchor (6_000_000 * 300_000)

describe('computeMacdWithWarmup — legacy empty-warmup parity', () => {
  it('empty warmup equals computeMacd on the active bars alone (legacy cache rows)', () => {
    const active = makeBars(50, BASE, MIN, (i) => logisticClose(i))
    const viaWarmup = computeMacdWithWarmup([], active, 1)
    const direct = computeMacd(active)
    expect(viaWarmup.macd).toEqual(direct.macd)
    expect(viaWarmup.signal).toEqual(direct.signal)
    expect(viaWarmup.histogram).toEqual(direct.histogram)
  })
})

describe('computeMacdWithWarmup — warmup gives the first active bar a real momentum tag', () => {
  // Continuous 90-bar curve: 60 warmup + 30 active, contiguous 1-min.
  const warmup = makeBars(60, BASE, MIN, (i) => logisticClose(i))
  const active = makeBars(30, BASE + 60 * MIN, MIN, (i) => logisticClose(60 + i))

  it('first output point lands on the first active bar (no warmup point leaks through)', () => {
    const r = computeMacdWithWarmup(warmup, active, 1)
    expect(r.macd[0].time).toBe(active[0].t)
    expect(r.signal[0].time).toBe(active[0].t)
    expect(r.histogram[0].time).toBe(active[0].t)
  })

  it('first active histogram point carries a real momentum tag (prior bar was a warmup bar, not null)', () => {
    const r = computeMacdWithWarmup(warmup, active, 1)
    expect(['pos_rising', 'pos_falling', 'neg_rising', 'neg_falling']).toContain(
      r.histogram[0].momentum,
    )
  })
})

describe('computeMacdWithWarmup — active-day filter is strict', () => {
  it('every output point in all three arrays has time >= activeBars[0].t', () => {
    const warmup = makeBars(60, BASE, MIN, (i) => logisticClose(i))
    const active = makeBars(30, BASE + 60 * MIN, MIN, (i) => logisticClose(60 + i))
    const cutoff = active[0].t
    const r = computeMacdWithWarmup(warmup, active, 1)
    expect(r.macd.length).toBeGreaterThan(0)
    expect(r.macd.every((p) => p.time >= cutoff)).toBe(true)
    expect(r.signal.every((p) => p.time >= cutoff)).toBe(true)
    expect(r.histogram.every((p) => p.time >= cutoff)).toBe(true)
  })
})

describe('computeMacdWithWarmup — 5-minute aggregation', () => {
  // 200 warmup + 60 active 1-min bars, both 5-min-aligned starts, with a
  // >5-min overnight-style gap between them so no bucket straddles. 200 1-min
  // warmup bars → 40 five-min buckets; +12 active buckets clears the
  // slow+signal warmup so the first active bucket has a MACD/histogram point.
  const WARMUP_START = BASE - 300 * MIN // 60 five-min buckets before BASE; aligned
  const warmup = makeBars(200, WARMUP_START, MIN, (i) => logisticClose(i, 100, 15))
  const active = makeBars(60, BASE, MIN, (i) => logisticClose(i, 30, 8))

  it('all output points are 5-min-grid-aligned and at/after the active start', () => {
    const r = computeMacdWithWarmup(warmup, active, 5)
    expect(r.macd.length).toBeGreaterThan(0)
    expect(r.histogram.length).toBeGreaterThan(0)
    const aligned = (pts: { time: number }[]) => pts.every((p) => p.time % FIVE_MIN === 0)
    const atOrAfter = (pts: { time: number }[]) => pts.every((p) => p.time >= BASE)
    expect(aligned(r.macd)).toBe(true)
    expect(aligned(r.signal)).toBe(true)
    expect(aligned(r.histogram)).toBe(true)
    expect(atOrAfter(r.macd)).toBe(true)
    expect(atOrAfter(r.signal)).toBe(true)
    expect(atOrAfter(r.histogram)).toBe(true)
  })
})

describe('computeMacdWithWarmup — ordering invariant', () => {
  it('throws when warmup does not strictly precede active', () => {
    const warmup = makeBars(10, 0, 100, (i) => 100 + i) // last t = 900
    const active = makeBars(10, 500, 100, (i) => 100 + i) // first t = 500 (overlaps)
    expect(() => computeMacdWithWarmup(warmup, active, 1)).toThrow(/warmup must precede active/)
  })
})

describe('computeMacdWithWarmup — both empty', () => {
  it('returns empty arrays without throwing', () => {
    const r = computeMacdWithWarmup([], [], 1)
    expect(r).toEqual({ macd: [], signal: [], histogram: [] })
  })
})
