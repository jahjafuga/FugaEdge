// VWAP ANCHOR UNIFICATION — core vwap() anchors from the FIRST BAR (premarket
// included), matching the chart's own vwap() at ChartTab.tsx:2030. Reverses the
// v0.2.4 §A9 09:30-ET session gate (founder ruling, djsevans87 ticket #5):
// "Above VWAP at entry" becomes the VWAP the trader was actually looking at.
// 421 of Dave's 534 data-complete rows were premarket entries whose
// vwap_dist_pct the gate NULLed while the chart drew a VWAP line on the same
// trades. NO TECHNICALS_SCHEMA_VERSION change — this rides the pending v3 sweep.
//
// 2026-05-01 is EDT (UTC-4): 07:00 ET = 11:00Z, 09:30 ET = 13:30Z.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { IntradayBar } from '@shared/market-types'
import { vwap } from '../vwap'
import { computeTradeTechnicals } from '@/core/technicals/computeTradeTechnicals'
import { computeHeaderStrip } from '@/core/technicals/headerStrip'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'

const MIN = 60_000
/** Flat bar: h=l=c=px so hlc3 = px exactly. */
const bar = (t: number, px: number, v = 1000): IntradayBar => ({ t, o: px, h: px, l: px, c: px, v })
const series = (startIso: string, n: number, px: number, v = 1000): IntradayBar[] => {
  const start = Date.parse(startIso)
  return Array.from({ length: n }, (_, i) => bar(start + i * MIN, px, v))
}
const longTrade = (entryTime: string, exitTime: string) => ({
  side: 'long' as const,
  executions: [
    { side: 'B' as const, qty: 100, price: 10, time: entryTime },
    { side: 'S' as const, qty: 100, price: 10.5, time: exitTime },
  ],
})

const warmup = series('2026-04-30T17:00:00Z', 40, 10)
// 150 premarket bars @ 9.00 (07:00→09:30 ET) then 60 RTH bars @ 10.00.
const premarketDay = [
  ...series('2026-05-01T11:00:00Z', 150, 9),
  ...series('2026-05-01T13:30:00Z', 60, 10),
]

describe('VWAP anchors from the first bar (premarket included)', () => {
  it('(1) THE 421-ROW CASE: premarket entry with premarket bars → vwap NON-null, cumulative from the first bar', () => {
    // Entry 08:30 ET (bar idx 90): every accumulated bar so far is @9 → vwap 9.
    const r = computeTradeTechnicals(
      longTrade('2026-05-01T12:30:10Z', '2026-05-01T14:20:10Z'),
      warmup,
      premarketDay,
    )
    expect(r.data_complete).toBe(true)
    expect(r.tf_1m.vwap).toBeCloseTo(9, 10)
    // Entry VWA 10 vs VWAP 9 → +11.11% — the row joins the VWAP tile population.
    expect(r.tf_1m.vwap_dist_pct).toBeCloseTo(((10 - 9) / 9) * 100, 6)
    expect(r.tf_5m.vwap).not.toBeNull()
  })

  it('(2) DELIBERATE VALUE CHANGE: an RTH entry on a day WITH premarket bars now includes premarket volume', () => {
    // Entry 09:35 ET = bar idx 155. NEW anchor: (150 bars × 9 + 6 bars × 10) / 156
    // = 1410/156 ≈ 9.0385 — the number the CHART has always drawn at that bar
    // (first-bar anchor), replacing the old RTH-only 10.00. Intended change,
    // not a regression: one name, one answer on both surfaces.
    const r = computeTradeTechnicals(
      longTrade('2026-05-01T13:35:10Z', '2026-05-01T14:20:10Z'),
      warmup,
      premarketDay,
    )
    expect(r.tf_1m.vwap).toBeCloseTo(1410 / 156, 10)
  })

  it('(3) TRUE NO-REGRESS: an RTH entry with NO premarket bars is unchanged', () => {
    const r = computeTradeTechnicals(
      longTrade('2026-05-01T13:35:10Z', '2026-05-01T14:00:10Z'),
      warmup,
      series('2026-05-01T13:30:00Z', 60, 10),
    )
    expect(r.data_complete).toBe(true)
    expect(r.tf_1m.vwap).toBeCloseTo(10, 10)
    expect(r.tf_1m.vwap_dist_pct).toBeCloseTo(0, 10)
  })

  it('(4) CHART PARITY: core vwap() equals the ChartTab.tsx:2030 algorithm on the same series (executable consistency)', () => {
    // Varied prices AND volumes across the 09:30 boundary so the parity check
    // has teeth. The mirror below is ChartTab.tsx:2030-2041 verbatim in shape:
    // tp = (h+l+c)/3, cumulative from the FIRST bar, no session gate.
    const mixed: IntradayBar[] = [
      { t: Date.parse('2026-05-01T13:25:00Z'), o: 9, h: 9.3, l: 8.9, c: 9.1, v: 500 },
      { t: Date.parse('2026-05-01T13:26:00Z'), o: 9.1, h: 9.6, l: 9.0, c: 9.5, v: 2500 },
      { t: Date.parse('2026-05-01T13:30:00Z'), o: 9.5, h: 10.2, l: 9.4, c: 10.0, v: 4000 },
      { t: Date.parse('2026-05-01T13:31:00Z'), o: 10, h: 10.4, l: 9.9, c: 10.2, v: 1200 },
    ]
    const chartMirror = (bars: IntradayBar[]) => {
      const out: { time: number; value: number }[] = []
      let cumPV = 0
      let cumV = 0
      for (const b of bars) {
        const tp = (b.h + b.l + b.c) / 3
        cumPV += tp * b.v
        cumV += b.v
        out.push({ time: b.t, value: cumV > 0 ? cumPV / cumV : tp })
      }
      return out
    }
    const core = vwap(mixed)
    const chart = chartMirror(mixed)
    expect(core).toHaveLength(chart.length)
    for (let i = 0; i < core.length; i++) {
      expect(core[i].time).toBe(chart[i].time)
      expect(core[i].value).not.toBeNull()
      expect(core[i].value!).toBeCloseTo(chart[i].value, 10)
    }
  })

  it('(5a) zero-volume fallback unchanged: all-zero-volume bars emit their own hlc3, never NaN', () => {
    const zeroVol = series('2026-05-01T13:30:00Z', 3, 10, 0)
    const out = vwap(zeroVol)
    for (const p of out) expect(p.value).toBeCloseTo(10, 10)
  })

  it('(5b) vwap === 0 → dist null unchanged (the degenerate guard lives in computeSnapshot)', () => {
    // Zero-priced bars: vwap accumulates to 0 → the dist guard nulls the pct.
    const r = computeTradeTechnicals(
      longTrade('2026-05-01T13:35:10Z', '2026-05-01T14:00:10Z'),
      warmup,
      series('2026-05-01T13:30:00Z', 60, 0),
    )
    expect(r.tf_1m.vwap).toBe(0)
    expect(r.tf_1m.vwap_dist_pct).toBeNull()
  })

  it('(6) the session gate is GONE: no time-dependent null path survives in vwap.ts', () => {
    const src = readFileSync(fileURLToPath(new URL('../vwap.ts', import.meta.url)), 'utf8')
    expect(src).not.toMatch(/atOrAfterRegularOpen/)
    expect(src).not.toMatch(/utcToEasternParts/)
    expect(src).not.toMatch(/09:30|9:30/)
  })

  it('(7) headerStrip: 3 complete rows (1 premarket, 2 RTH) → VWAP denominator 3, matching MACD', () => {
    const premarketTech = computeTradeTechnicals(
      longTrade('2026-05-01T12:30:10Z', '2026-05-01T14:20:10Z'),
      warmup,
      premarketDay,
    )
    const rthTech = computeTradeTechnicals(
      longTrade('2026-05-01T13:35:10Z', '2026-05-01T14:00:10Z'),
      warmup,
      series('2026-05-01T13:30:00Z', 60, 10),
    )
    const row = (
      id: number,
      openTime: string,
      tech: typeof premarketTech,
    ): TradeWithTechnicalsRow => ({
      id,
      symbol: 'TEST',
      date: '2026-05-01',
      side: 'long',
      net_pnl: 50,
      open_time: openTime,
      playbook_id: null,
      playbook_name: null,
      technicals: { trade_id: id, ...tech },
    })
    const stats = computeHeaderStrip(
      [
        row(1, '2026-05-01T12:30:10Z', premarketTech),
        row(2, '2026-05-01T13:35:10Z', rthTech),
        row(3, '2026-05-01T13:40:10Z', rthTech),
      ],
      '1m',
    )
    expect(stats.denominator).toBe(3)
    expect(stats.vwapDenominator).toBe(3) // was 2 under the 09:30 gate
  })
})
