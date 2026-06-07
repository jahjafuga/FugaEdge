import { describe, it, expect } from 'vitest'
import type { IntradayBar } from '@shared/market-types'
// RED: module under test — the only unresolved import when first written.
import { computeMacd } from '../macd'

// ── Fixtures ───────────────────────────────────────────────────────────────
// computeMacd reads only IntradayBar.t (epoch ms) and .c (close); o/h/l mirror
// the close and volume is a constant. Bars are one-per-minute from a fixed
// epoch anchor so the time-copy assertions are exact.
const BASE = 1_700_000_000_000
const MIN = 60_000

function bar(tMs: number, close: number): IntradayBar {
  return { t: tMs, o: close, h: close, l: close, c: close, v: 100 }
}

// Build a 1-minute bar series from a close array, anchored at BASE.
function barsFrom(closes: number[]): IntradayBar[] {
  return closes.map((c, i) => bar(BASE + i * MIN, c))
}

// closes = [1, 2, 3, ..., n].
function ramp(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1)
}

// Logistic (S-curve) closes: a strictly-monotonic but DECELERATING move.
// `mid` = inflection bar index, `steep` = width; `amp` < 0 flips it to a
// decelerating decline. Used to drive the rising-then-decaying MACD-line shape
// (test 6) and the single-hump histogram momentum flips (tests 7/8). A linear
// ramp can't: its SMA-seeded EMA sits at the steady-state lag, so its MACD is
// mathematically constant — see the note on test 6.
function logistic(n: number, mid: number, steep: number, base = 100, amp = 100): number[] {
  return Array.from({ length: n }, (_, i) => base + amp / (1 + Math.exp(-(i - mid) / steep)))
}

// Independent SMA-seeded EMA for the test-10 cross-check — deliberately a
// separate copy of the convention (not the module's private ema) so the
// assertion validates computeMacd against an outside reference, not itself.
function refEma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(values.length).fill(null)
  if (period <= 0 || values.length < period) return out
  const k = 2 / (period + 1)
  let sum = 0
  for (let i = 0; i < period; i++) sum += values[i]
  let prev = sum / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

// (1)(2) guards: too little data ⇒ all-empty, never throws ─────────────────────
describe('computeMacd — guards (insufficient data ⇒ empty)', () => {
  it('returns empty arrays when bars.length is 0', () => {
    const r = computeMacd([])
    expect(r.macd).toEqual([])
    expect(r.signal).toEqual([])
    expect(r.histogram).toEqual([])
  })

  it('returns empty arrays when bars.length < slowPeriod + signalPeriod', () => {
    // 33 bars sits below the module's `slowPeriod + signalPeriod` (= 35) floor,
    // so every array is empty. (Strictly, the first signal point needs 34 bars —
    // (slowPeriod-1) + signalPeriod; the guard is one bar more conservative. 33
    // is empty under either reading, so this test is unambiguous.)
    const r = computeMacd(barsFrom(ramp(33)))
    expect(r.macd).toEqual([])
    expect(r.signal).toEqual([])
    expect(r.histogram).toEqual([])
  })
})

// (3)(4)(5)(9) index alignment & warmup, and bar-time copy ─────────────────────
describe('computeMacd — index alignment & warmup', () => {
  // 50 monotonically-rising bars clear the slow-EMA warmup (index 25) and the
  // signal warmup (9 more) with margin.
  const closes = ramp(50)
  const bars = barsFrom(closes)

  it('first MACD value appears at index slowPeriod - 1 (= 25)', () => {
    const r = computeMacd(bars)
    expect(r.macd[0].time).toBe(bars[25].t)
  })

  it('first signal value appears at index slowPeriod + signalPeriod - 2 (= 33)', () => {
    const r = computeMacd(bars)
    expect(r.signal[0].time).toBe(bars[33].t)
  })

  it('first histogram value appears at the same index as the first signal', () => {
    const r = computeMacd(bars)
    expect(r.histogram[0].time).toBe(r.signal[0].time)
  })

  it('time field is copied from source bar t (epoch ms)', () => {
    const r = computeMacd(bars)
    expect(r.macd[0].time).toBe(BASE + 25 * MIN)
  })
})

// (6) MACD line shape on a sustained, decelerating rise ────────────────────────
describe('computeMacd — MACD line shape on a sustained rise', () => {
  it('monotonically rising closes produce a positive MACD line that rises then decays as the spread between ema12 and ema26 stabilizes', () => {
    // SPEC DEVIATION — flagged for review. The brief suggested closes = [1..50].
    // A pure linear ramp's SMA-seeded EMA sits exactly at its steady-state lag,
    // so emaFast − emaSlow is mathematically CONSTANT (= (slow-1)/2 − (fast-1)/2
    // = 7.0): it cannot "rise then decay", and last === max (not last < max).
    // The test's own title — "converges … as the spread stabilizes" — describes
    // a DECELERATING rise, which a logistic curve gives while STILL being
    // monotonically increasing. So we keep "monotonically rising closes" but use
    // an early-inflection S-curve. (Test 10 keeps the [1..50] ramp, where a
    // constant MACD is exactly what the independent cross-check wants.)
    const r = computeMacd(barsFrom(logistic(50, 26, 5)))
    const vals = r.macd.map((p) => p.value)
    const max = Math.max(...vals)
    const peakIdx = vals.indexOf(max)
    const last = vals[vals.length - 1]

    expect(Math.min(...vals)).toBeGreaterThan(0) // positive line throughout
    expect(peakIdx).toBeGreaterThan(0) // rose into an interior peak…
    expect(peakIdx).toBeLessThan(vals.length - 1) // …with decay after it
    expect(last).toBeLessThan(max) // soft check from the spec: decayed from peak
    expect(last).toBeGreaterThan(0) // still positive at the end
  })
})

// (7)(8) histogram momentum tagging ────────────────────────────────────────────
describe('computeMacd — histogram momentum tagging', () => {
  it('histogram momentum tagging: pos_rising vs pos_falling', () => {
    // A clean positive hump (no zero-cross): the histogram rises to an interior
    // peak then falls, staying > 0 throughout — isolating the pos_* contract.
    const r = computeMacd(barsFrom(logistic(50, 40, 6)))
    const hist = r.histogram
    expect(hist.length).toBeGreaterThan(2)
    expect(hist.every((h) => h.value > 0)).toBe(true)

    // self-consistency: every tag matches the rule recomputed from raw values.
    for (let i = 0; i < hist.length; i++) {
      const prior = i > 0 ? hist[i - 1].value : null
      const expected = prior === null || hist[i].value >= prior ? 'pos_rising' : 'pos_falling'
      expect(hist[i].momentum).toBe(expected)
    }

    // the flip lands at the peak: pos_rising up to & including it, pos_falling after.
    const peakIdx = hist.reduce((best, h, i) => (h.value > hist[best].value ? i : best), 0)
    expect(peakIdx).toBeGreaterThan(0)
    expect(peakIdx).toBeLessThan(hist.length - 1)
    expect(hist.slice(0, peakIdx + 1).every((h) => h.momentum === 'pos_rising')).toBe(true)
    expect(hist.slice(peakIdx + 1).every((h) => h.momentum === 'pos_falling')).toBe(true)
  })

  it('histogram momentum tagging: neg_falling vs neg_rising', () => {
    // Mirror of the positive case: an exact negation (MACD is linear and kills
    // the additive constant), so the histogram is a clean negative trough.
    const r = computeMacd(barsFrom(logistic(50, 40, 6, 200, -100)))
    const hist = r.histogram
    expect(hist.length).toBeGreaterThan(2)
    expect(hist.every((h) => h.value < 0)).toBe(true)

    for (let i = 0; i < hist.length; i++) {
      const prior = i > 0 ? hist[i - 1].value : null
      const expected = prior === null || hist[i].value <= prior ? 'neg_falling' : 'neg_rising'
      expect(hist[i].momentum).toBe(expected)
    }

    // the flip lands at the trough: neg_falling down to & including it, neg_rising after.
    const troughIdx = hist.reduce((best, h, i) => (h.value < hist[best].value ? i : best), 0)
    expect(troughIdx).toBeGreaterThan(0)
    expect(troughIdx).toBeLessThan(hist.length - 1)
    expect(hist.slice(0, troughIdx + 1).every((h) => h.momentum === 'neg_falling')).toBe(true)
    expect(hist.slice(troughIdx + 1).every((h) => h.momentum === 'neg_rising')).toBe(true)
  })
})

// (10) classic MACD math, cross-checked against an independent EMA ──────────────
describe('computeMacd — classic MACD math cross-check', () => {
  it('classic MACD math: MACD line equals ema12 - ema26 at a shared index', () => {
    const closes = ramp(50)
    const r = computeMacd(barsFrom(closes))
    const e12 = refEma(closes, 12)
    const e26 = refEma(closes, 26)

    // r.macd[0] is bar index 25 (slowPeriod-1) and the dense line has no holes,
    // so r.macd[k] ↔ bar index 25 + k. Check k = 10 ⇒ bar index 35.
    const k = 10
    const barIdx = 25 + k
    expect(r.macd[k].time).toBe(BASE + barIdx * MIN) // alignment sanity
    expect(r.macd[k].value).toBeCloseTo((e12[barIdx] as number) - (e26[barIdx] as number), 6)
  })
})
