import { describe, it, expect } from 'vitest'
import type { IntradayBar } from '@shared/market-types'
import {
  computeTradeTechnicals,
  TECHNICALS_SCHEMA_VERSION,
  type TradeForTechnicals,
} from '../computeTradeTechnicals'

// ── Fixtures ────────────────────────────────────────────────────────────────
// Anchored on 2026-07-15 (EDT, UTC-4) so 09:30 ET = 13:30:00 UTC; warmup lives
// on the prior trading day (2026-07-14) so the warmup/active split is clean.
const MIN = 60_000
const WARMUP_START = Date.parse('2026-07-14T13:30:00Z') // prior day 09:30 ET
const ACTIVE_START = Date.parse('2026-07-15T13:30:00Z') // active day 09:30 ET

const iso = (ms: number) => new Date(ms).toISOString()

// Deterministic ascending 1-minute bars; o=h=l=c so hlc3 == the close.
function makeBars(
  count: number,
  startT: number,
  stepMs: number,
  basePrice: number,
  priceStep = 0,
): IntradayBar[] {
  return Array.from({ length: count }, (_, i) => {
    const p = basePrice + i * priceStep
    return { t: startT + i * stepMs, o: p, h: p, l: p, c: p, v: 100 }
  })
}

describe('computeTradeTechnicals — per-trade entry-state indicator extractor', () => {
  it('(1) happy path: single-fill long mid-active-day yields a complete 1M snapshot', () => {
    const warmup = makeBars(100, WARMUP_START, MIN, 50, 0.05)
    const active = makeBars(60, ACTIVE_START, MIN, 60, 0.05)
    const fillMs = ACTIVE_START + 30 * MIN
    const trade: TradeForTechnicals = {
      side: 'long',
      executions: [{ side: 'B', qty: 100, price: 61.5, time: iso(fillMs) }],
    }
    const r = computeTradeTechnicals(trade, warmup, active)
    expect(r.tf_1m.macd_line).not.toBeNull()
    expect(r.tf_1m.signal_line).not.toBeNull()
    expect(r.tf_1m.histogram).not.toBeNull()
    expect(r.tf_1m.vwap).not.toBeNull()
    expect(r.tf_1m.ema9).not.toBeNull()
    expect(r.tf_1m.ema20).not.toBeNull()
    expect(r.data_complete).toBe(true)
    expect(r.schema_version).toBe(1)
    expect(r.schema_version).toBe(TECHNICALS_SCHEMA_VERSION)
    expect(Number.isNaN(Date.parse(r.computed_at))).toBe(false)
  })

  it('(2) multi-fill long: vwap_dist_pct uses the volume-weighted entry price', () => {
    const warmup = makeBars(100, WARMUP_START, MIN, 60, 0.05)
    const active = makeBars(60, ACTIVE_START, MIN, 60, 0.05)
    const fillMs = ACTIVE_START + 30 * MIN
    const trade: TradeForTechnicals = {
      side: 'long',
      executions: [
        { side: 'B', qty: 100, price: 10, time: iso(fillMs) },
        { side: 'B', qty: 200, price: 11, time: iso(fillMs + 10_000) },
      ],
    }
    const r = computeTradeTechnicals(trade, warmup, active)
    const vwa = (100 * 10 + 200 * 11) / 300 // 10.6666...
    const v = r.tf_1m.vwap as number
    expect(r.tf_1m.vwap).not.toBeNull()
    expect(r.tf_1m.vwap_dist_pct).toBeCloseTo(((vwa - v) / v) * 100, 9)
  })

  it('(3) short trade: the S fill is the entry; B (exit) fills are ignored', () => {
    const warmup = makeBars(100, WARMUP_START, MIN, 60) // constant 60
    const active = makeBars(60, ACTIVE_START, MIN, 60) // constant → vwap == 60 everywhere
    const entryMs = ACTIVE_START + 30 * MIN
    const exitMs = ACTIVE_START + 50 * MIN
    const trade: TradeForTechnicals = {
      side: 'short',
      executions: [
        { side: 'S', qty: 100, price: 5, time: iso(entryMs) },
        { side: 'B', qty: 100, price: 7, time: iso(exitMs) },
      ],
    }
    const r = computeTradeTechnicals(trade, warmup, active)
    // entry VWAP bar value is the constant 60; entry price is the S fill's 5.
    expect(r.tf_1m.vwap).toBeCloseTo(60, 9)
    // (5 - 60)/60*100 = -91.667; had the B fill (7) been used it would be -88.33.
    expect(r.tf_1m.vwap_dist_pct).toBeCloseTo(((5 - 60) / 60) * 100, 9)
  })

  it('(4) empty warmup: active-only seed still yields numeric 1M fields + data_complete', () => {
    const active = makeBars(60, ACTIVE_START, MIN, 60, 0.05)
    const fillMs = ACTIVE_START + 50 * MIN
    const trade: TradeForTechnicals = {
      side: 'long',
      executions: [{ side: 'B', qty: 100, price: 62, time: iso(fillMs) }],
    }
    const r = computeTradeTechnicals(trade, [], active)
    expect(r.tf_1m.macd_line).not.toBeNull()
    expect(r.tf_1m.ema9).not.toBeNull()
    expect(r.tf_1m.ema20).not.toBeNull()
    expect(r.tf_1m.vwap).not.toBeNull()
    expect(r.data_complete).toBe(true)
  })

  it('(5) fill before the first active bar → both timeframes empty, data_complete false', () => {
    const warmup = makeBars(100, WARMUP_START, MIN, 60)
    const active = makeBars(60, ACTIVE_START, MIN, 60)
    const fillMs = ACTIVE_START - 5 * MIN // 5 min before the active open
    const trade: TradeForTechnicals = {
      side: 'long',
      executions: [{ side: 'B', qty: 100, price: 60, time: iso(fillMs) }],
    }
    const r = computeTradeTechnicals(trade, warmup, active)
    expect(r.tf_1m.macd_line).toBeNull()
    expect(r.tf_1m.vwap).toBeNull()
    expect(r.tf_5m.vwap).toBeNull()
    expect(r.data_complete).toBe(false)
  })

  it('(6) fill after the last active bar → both timeframes empty, data_complete false', () => {
    const warmup = makeBars(100, WARMUP_START, MIN, 60)
    const active = makeBars(60, ACTIVE_START, MIN, 60)
    const fillMs = active[active.length - 1].t + 1 * MIN
    const trade: TradeForTechnicals = {
      side: 'long',
      executions: [{ side: 'B', qty: 100, price: 60, time: iso(fillMs) }],
    }
    const r = computeTradeTechnicals(trade, warmup, active)
    expect(r.tf_1m.vwap).toBeNull()
    expect(r.tf_5m.vwap).toBeNull()
    expect(r.data_complete).toBe(false)
  })

  it('(7) 5M containment: a 09:33:47 ET fill reads the 09:30 5M bar', () => {
    // active 1M bars 09:30–09:44 ET, prices stepped per 5M bucket:
    //   bucket 09:30 (idx 0–4)   = 100
    //   bucket 09:35 (idx 5–9)   = 110
    //   bucket 09:40 (idx 10–14) = 120
    const active: IntradayBar[] = Array.from({ length: 15 }, (_, i) => {
      const p = 100 + Math.floor(i / 5) * 10
      return { t: ACTIVE_START + i * MIN, o: p, h: p, l: p, c: p, v: 100 }
    })
    const fillMs = ACTIVE_START + 3 * MIN + 47_000 // 09:33:47 ET
    const trade: TradeForTechnicals = {
      side: 'long',
      executions: [{ side: 'B', qty: 100, price: 100, time: iso(fillMs) }],
    }
    const r = computeTradeTechnicals(trade, [], active)
    // The 09:30 5M bar is the first VWAP accumulator → its own hlc3 = 100.
    // Had the locator picked 09:35, vwap would be the 100/110 vol-weighted mean.
    expect(r.tf_5m.vwap).toBeCloseTo(100, 9)
  })

  it('(8) VWAP is active-only: warmup prices never leak into the entry VWAP', () => {
    const warmup = makeBars(100, WARMUP_START, MIN, 1000) // wildly different prices
    const active = makeBars(20, ACTIVE_START, MIN, 50, 1) // 50, 51, …, 69
    const fillMs = ACTIVE_START + 5 * MIN
    const trade: TradeForTechnicals = {
      side: 'long',
      executions: [{ side: 'B', qty: 100, price: 50, time: iso(fillMs) }],
    }
    const r = computeTradeTechnicals(trade, warmup, active)
    // active-only VWAP at bar 5 = mean of prices[0..5] (equal volumes)
    //   = (50+51+52+53+54+55)/6 = 52.5  (≈1000 if warmup leaked)
    expect(r.tf_1m.vwap).toBeCloseTo(52.5, 9)
  })

  it('(9) macd_positive reflects the sign of macd_line at the entry bar', () => {
    const fillMs = ACTIVE_START + 30 * MIN
    const trade: TradeForTechnicals = {
      side: 'long',
      executions: [{ side: 'B', qty: 100, price: 60, time: iso(fillMs) }],
    }
    // Rising trend → fast EMA above slow → macd_line > 0.
    const up = computeTradeTechnicals(
      trade,
      makeBars(100, WARMUP_START, MIN, 50, 0.1),
      makeBars(60, ACTIVE_START, MIN, 60, 0.1),
    )
    expect(up.tf_1m.macd_line).not.toBeNull()
    expect((up.tf_1m.macd_line as number) > 0).toBe(true)
    expect(up.tf_1m.macd_positive).toBe(true)
    // Falling trend → fast EMA below slow → macd_line < 0.
    const dn = computeTradeTechnicals(
      trade,
      makeBars(100, WARMUP_START, MIN, 100, -0.1),
      makeBars(60, ACTIVE_START, MIN, 90, -0.1),
    )
    expect(dn.tf_1m.macd_line).not.toBeNull()
    expect((dn.tf_1m.macd_line as number) < 0).toBe(true)
    expect(dn.tf_1m.macd_positive).toBe(false)
  })

  it('(10) ema9_above_ema20 reflects the 9-vs-20 EMA stack at the entry bar', () => {
    const fillMs = ACTIVE_START + 30 * MIN
    const trade: TradeForTechnicals = {
      side: 'long',
      executions: [{ side: 'B', qty: 100, price: 60, time: iso(fillMs) }],
    }
    const up = computeTradeTechnicals(
      trade,
      makeBars(100, WARMUP_START, MIN, 50, 0.1),
      makeBars(60, ACTIVE_START, MIN, 60, 0.1),
    )
    expect(up.tf_1m.ema9).not.toBeNull()
    expect(up.tf_1m.ema20).not.toBeNull()
    expect((up.tf_1m.ema9 as number) > (up.tf_1m.ema20 as number)).toBe(true)
    expect(up.tf_1m.ema9_above_ema20).toBe(true)
    const dn = computeTradeTechnicals(
      trade,
      makeBars(100, WARMUP_START, MIN, 100, -0.1),
      makeBars(60, ACTIVE_START, MIN, 90, -0.1),
    )
    expect((dn.tf_1m.ema9 as number) < (dn.tf_1m.ema20 as number)).toBe(true)
    expect(dn.tf_1m.ema9_above_ema20).toBe(false)
  })

  it('(11) vwap_dist_pct matches the hand-computed (entry - vwap)/vwap*100', () => {
    const warmup = makeBars(100, WARMUP_START, MIN, 9.8)
    const active = makeBars(40, ACTIVE_START, MIN, 9.8) // constant → vwap == 9.8
    const fillMs = ACTIVE_START + 20 * MIN
    const trade: TradeForTechnicals = {
      side: 'long',
      executions: [{ side: 'B', qty: 100, price: 10, time: iso(fillMs) }],
    }
    const r = computeTradeTechnicals(trade, warmup, active)
    expect(r.tf_1m.vwap).toBeCloseTo(9.8, 9)
    const expected = ((10 - 9.8) / 9.8) * 100 // ≈ 2.040816
    expect(r.tf_1m.vwap_dist_pct).toBeCloseTo(expected, 9)
  })

  it('(12) zero-qty entry: entry price falls back to 0 without crashing', () => {
    const warmup = makeBars(100, WARMUP_START, MIN, 50)
    const active = makeBars(40, ACTIVE_START, MIN, 50) // constant → vwap == 50
    const fillMs = ACTIVE_START + 20 * MIN
    const trade: TradeForTechnicals = {
      side: 'long',
      executions: [{ side: 'B', qty: 0, price: 12, time: iso(fillMs) }],
    }
    const r = computeTradeTechnicals(trade, warmup, active)
    // totalQty 0 → entryPriceVwa 0 → (0 - 50)/50*100 = -100
    expect(r.tf_1m.vwap_dist_pct).toBeCloseTo(-100, 9)
  })
})
