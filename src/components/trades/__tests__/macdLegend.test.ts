import { describe, it, expect } from 'vitest'
import { price } from '@/lib/format'
import type { MacdResult } from '@/core/charts/macd'
import {
  lastPointValue,
  macdLegendDisplay,
  showMacdLegend,
  lastHistogramMomentum,
  macdLegendTop,
  macdLegendLabel,
} from '../macdLegend'

// Dave #13 — the MACD pane legend's pure half. The pane-anchored readout in
// ChartTab reads hovered values off param.seriesData and falls back to the
// memoized MacdResult's latest points; these helpers carry the fallback, the
// gate, the pane-top offset mapping, and the label — pinned here so the JSX
// stays a thin consumer.

const EMPTY: MacdResult = { macd: [], signal: [], histogram: [] }

const POPULATED: MacdResult = {
  macd: [
    { time: 1000, value: 0.12 },
    { time: 1060, value: -0.0342 },
  ],
  signal: [
    { time: 1000, value: 0.08 },
    { time: 1060, value: 0.021 },
  ],
  histogram: [
    { time: 1000, value: 0.04, momentum: 'pos_rising' },
    { time: 1060, value: -0.0552, momentum: 'neg_falling' },
  ],
}

// ═══ (1) FORMAT — the house price() rule on signed MACD values ═══
describe('(1) format — signed values through the Math.abs-gated house rule', () => {
  it('-0.0342 -> exactly 4dp (|n| < 1)', () => {
    expect(price(-0.0342)).toBe('-0.0342')
  })

  it('-2.51 -> exactly 2dp (|n| >= 1) — the negative pins the abs gate', () => {
    expect(price(-2.51)).toBe('-2.51')
  })

  it('a tiny positive keeps the fixed 4dp bucket (no trailing-zero trim)', () => {
    expect(price(0.03)).toBe('0.0300')
  })
})

// ═══ (2) FALLBACK — lastValue over the MacdResult arrays ═══
describe('(2) fallback — off-chart shows the latest computed values', () => {
  it('populated arrays -> the LAST point of each', () => {
    expect(lastPointValue(POPULATED.macd)).toBe(-0.0342)
    expect(lastPointValue(POPULATED.signal)).toBe(0.021)
    expect(lastPointValue(POPULATED.histogram)).toBe(-0.0552)
  })

  it('empty array -> null (renders an em-dash, never 0.00)', () => {
    expect(lastPointValue([])).toBeNull()
  })

  it('hovered null (crosshair off the chart) -> all three fall back to the latest', () => {
    expect(macdLegendDisplay(null, POPULATED)).toEqual({
      line: -0.0342,
      signal: 0.021,
      histogram: -0.0552,
    })
  })

  it('hovered with a NULL field (warmup edge bar) keeps it null — em-dash, never swapped for the latest', () => {
    const display = macdLegendDisplay(
      { line: 0.5, signal: null, histogram: 0.1 },
      POPULATED,
    )
    expect(display).toEqual({ line: 0.5, signal: null, histogram: 0.1 })
  })

  it('the fallback color tag is the LAST histogram point momentum; null when empty', () => {
    expect(lastHistogramMomentum(POPULATED)).toBe('neg_falling')
    expect(lastHistogramMomentum(EMPTY)).toBeNull()
  })
})

// ═══ (3) GATE — the block lives and dies with the pane ═══
describe('(3) gate — EMPTY_MACD / torn-down pane renders nothing', () => {
  it('empty result -> false (toggle-off, 10S/Daily, warmup-empty)', () => {
    expect(showMacdLegend(EMPTY)).toBe(false)
  })

  it('populated result -> true', () => {
    expect(showMacdLegend(POPULATED)).toBe(true)
  })
})

// ═══ (4) OFFSET — pane-0 height -> the absolute top ═══
describe('(4) offset — the pane-1 anchor from the measured pane-0 height', () => {
  it('top = pane0Height + the separator/pad allowance (6px)', () => {
    expect(macdLegendTop(300)).toBe(306)
    expect(macdLegendTop(452)).toBe(458)
  })

  it('degenerate zero height still yields the pad (never negative)', () => {
    expect(macdLegendTop(0)).toBe(6)
  })
})

// ═══ (5) LABEL — the TradingView-style tag with the timeframe ═══
describe('(5) label — MACD 12 26 9 with the tf parenthetical', () => {
  it('1m and 5m', () => {
    expect(macdLegendLabel('1m')).toBe('MACD 12 26 9 (1m)')
    expect(macdLegendLabel('5m')).toBe('MACD 12 26 9 (5m)')
  })
})
