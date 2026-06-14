import { describe, it, expect } from 'vitest'
import type {
  TradeWithTechnicalsRow,
  TechnicalSnapshot,
  TradeTechnicalsRow,
} from '@shared/technicals-types'
import {
  computeEdgeScore,
  maxDrawdownByOpenTime,
  EDGE_SCORE_BANDS,
} from '../edgeScore'

// ── Fixtures ────────────────────────────────────────────────────────────────
function snap(over: Partial<TechnicalSnapshot> = {}): TechnicalSnapshot {
  return {
    macd_line: null, signal_line: null, histogram: null, histogram_prior: null,
    macd_positive: null, macd_open: null, macd_rising: null,
    vwap: null, vwap_dist_pct: null, ema9: null, ema9_dist_pct: null,
    ema20: null, ema20_dist_pct: null, ema9_above_ema20: null,
    ...over,
  }
}
// D7 full-alignment on tf_1m: macd_positive AND vwap_dist_pct>0 AND ema9_dist_pct>0.
const ALIGNED = snap({ macd_positive: true, vwap_dist_pct: 1, ema9_dist_pct: 1 })
const MISALIGNED = snap({ macd_positive: false, vwap_dist_pct: -1, ema9_dist_pct: -1 })

function tech(tf1m: TechnicalSnapshot, complete = true): TradeTechnicalsRow {
  return { trade_id: 0, tf_1m: tf1m, tf_5m: snap(), data_complete: complete, computed_at: '', schema_version: 1 }
}

let _id = 0
function mkRow(net_pnl: number, over: Partial<TradeWithTechnicalsRow> = {}): TradeWithTechnicalsRow {
  _id += 1
  return {
    id: _id, symbol: 'XYZ', date: '2026-03-02', side: 'long', net_pnl,
    open_time: `2026-03-02T09:${String(30 + (_id % 25)).padStart(2, '0')}:00Z`,
    playbook_id: null, playbook_name: null, technicals: null,
    ...over,
  }
}

const subOf = (rows: TradeWithTechnicalsRow[], key: string) =>
  computeEdgeScore(rows).axes.find((a) => a.key === key)!.sub

// Pad a focused book with neutral scratch rows so n>=5 (axes compute regardless
// of suppression, but this keeps the score non-null where a test reads it).
const pad = (rows: TradeWithTechnicalsRow[], to = 20) => [
  ...rows,
  ...Array.from({ length: Math.max(0, to - rows.length) }, () => mkRow(0)),
]

// ── Bands sanity ────────────────────────────────────────────────────────────
describe('EDGE_SCORE_BANDS', () => {
  it('six axes whose weights sum to 100', () => {
    expect(EDGE_SCORE_BANDS).toHaveLength(6)
    expect(EDGE_SCORE_BANDS.reduce((s, b) => s + b.weight, 0)).toBe(100)
  })
})

// ── Profit Factor: ≤0.8 → 0, ≥2.5 → 100 ─────────────────────────────────────
describe('axis: profit_factor', () => {
  it('PF 2.5 → sub 100', () => {
    expect(subOf([mkRow(250), mkRow(-100)], 'profit_factor')).toBeCloseTo(100, 6)
  })
  it('PF 0.8 → sub 0', () => {
    expect(subOf([mkRow(80), mkRow(-100)], 'profit_factor')).toBeCloseTo(0, 6)
  })
  it('PF 1.65 (band midpoint) → sub 50', () => {
    expect(subOf([mkRow(165), mkRow(-100)], 'profit_factor')).toBeCloseTo(50, 6)
  })
  it('no losers → sub 100 (no Infinity divide)', () => {
    expect(subOf([mkRow(100), mkRow(50)], 'profit_factor')).toBeCloseTo(100, 6)
  })
})

// ── Win Rate: ≤30% → 0, ≥65% → 100 ──────────────────────────────────────────
describe('axis: win_rate', () => {
  it('WR 30% → sub 0', () => {
    const rows = [...Array(3).fill(0).map(() => mkRow(100)), ...Array(7).fill(0).map(() => mkRow(-100))]
    expect(subOf(rows, 'win_rate')).toBeCloseTo(0, 6)
  })
  it('WR 65% → sub 100', () => {
    const rows = [...Array(13).fill(0).map(() => mkRow(100)), ...Array(7).fill(0).map(() => mkRow(-100))]
    expect(subOf(rows, 'win_rate')).toBeCloseTo(100, 6)
  })
  it('WR 47.5% (midpoint) → sub 50', () => {
    const rows = [...Array(19).fill(0).map(() => mkRow(100)), ...Array(21).fill(0).map(() => mkRow(-100))]
    expect(subOf(rows, 'win_rate')).toBeCloseTo(50, 6)
  })
})

// ── Avg Win/Loss: ≤0.5 → 0, ≥2.0 → 100 ──────────────────────────────────────
describe('axis: avg_win_loss', () => {
  it('AWL 0.5 → sub 0', () => {
    expect(subOf([mkRow(50), mkRow(-100)], 'avg_win_loss')).toBeCloseTo(0, 6)
  })
  it('AWL 2.0 → sub 100', () => {
    expect(subOf([mkRow(200), mkRow(-100)], 'avg_win_loss')).toBeCloseTo(100, 6)
  })
  it('AWL 4.0 → clamps to 100', () => {
    expect(subOf([mkRow(400), mkRow(-100)], 'avg_win_loss')).toBeCloseTo(100, 6)
  })
})

// ── Max Drawdown / gross profit (inverted): ≥1.0 → 0, ≤0.2 → 100 ─────────────
describe('axis: max_drawdown', () => {
  it('ratio 0.2 → sub 100', () => {
    // +100 then -20: maxDD 20, gross profit 100 → ratio 0.2.
    expect(subOf([mkRow(100), mkRow(-20)], 'max_drawdown')).toBeCloseTo(100, 6)
  })
  it('ratio 1.0 → sub 0', () => {
    // +100 then -100: maxDD 100, gross profit 100 → ratio 1.0.
    expect(subOf([mkRow(100), mkRow(-100)], 'max_drawdown')).toBeCloseTo(0, 6)
  })
  it('gross profit 0 → sub 0 (no NaN)', () => {
    expect(subOf([mkRow(-50), mkRow(-50)], 'max_drawdown')).toBeCloseTo(0, 6)
  })
  it('maxDrawdownByOpenTime sorts by open_time, not array order', () => {
    const a = mkRow(100, { open_time: '2026-03-02T09:30:00Z' })
    const b = mkRow(-50, { open_time: '2026-03-02T09:31:00Z' })
    const c = mkRow(200, { open_time: '2026-03-02T09:32:00Z' })
    // Out-of-order array; chronological is +100,-50,+200 → peak 100, trough 50 → maxDD 50.
    expect(maxDrawdownByOpenTime([c, a, b])).toBeCloseTo(50, 6)
  })
})

// ── Consistency (% green days): ≤30% → 0, ≥70% → 100 ────────────────────────
describe('axis: consistency', () => {
  it('30% green days → sub 0', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      mkRow(i < 3 ? 100 : -100, { date: `2026-03-${String(i + 1).padStart(2, '0')}` }))
    expect(subOf(rows, 'consistency')).toBeCloseTo(0, 6)
  })
  it('70% green days → sub 100', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      mkRow(i < 7 ? 100 : -100, { date: `2026-03-${String(i + 1).padStart(2, '0')}` }))
    expect(subOf(rows, 'consistency')).toBeCloseTo(100, 6)
  })
})

// ── Discipline (full-alignment % from technicals, tf_1m) ─────────────────────
describe('axis: discipline', () => {
  it('60% aligned → sub 60, coverage all-complete', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      mkRow(100, { technicals: tech(i < 6 ? ALIGNED : MISALIGNED) }))
    const r = computeEdgeScore(rows)
    const disc = r.axes.find((a) => a.key === 'discipline')!
    expect(disc.sub).toBeCloseTo(60, 6)
    expect(disc.coverage).toEqual({ complete: 10, total: 10 })
  })
  it('coverage counts data-incomplete / null-technicals rows as excluded', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => mkRow(100, { technicals: tech(i < 6 ? ALIGNED : MISALIGNED) })),
      ...Array.from({ length: 5 }, () => mkRow(100, { technicals: null })),
    ]
    const disc = computeEdgeScore(rows).axes.find((a) => a.key === 'discipline')!
    expect(disc.sub).toBeCloseTo(60, 6) // 6/10 complete aligned
    expect(disc.coverage).toEqual({ complete: 10, total: 15 }) // the 62-of-98 chip shape
  })
  it('zero complete technicals → discipline sub null (axis drops out)', () => {
    const rows = Array.from({ length: 10 }, () => mkRow(100, { technicals: null }))
    expect(computeEdgeScore(rows).axes.find((a) => a.key === 'discipline')!.sub).toBeNull()
  })
})

// ── Composite weighting + renormalization ───────────────────────────────────
describe('composite score', () => {
  it('score = weighted mean of present axes, renormalized, rounded', () => {
    const rows = pad([
      ...Array.from({ length: 13 }, () => mkRow(200, { technicals: tech(ALIGNED) })),
      ...Array.from({ length: 7 }, () => mkRow(-100, { technicals: tech(MISALIGNED) })),
    ], 20)
    const r = computeEdgeScore(rows)
    const present = r.axes.filter((a) => a.sub !== null)
    const expected = Math.round(
      present.reduce((s, a) => s + a.weight * (a.sub as number), 0) /
        present.reduce((s, a) => s + a.weight, 0),
    )
    expect(r.score).toBe(expected)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })
  it('renormalizes over the 5 P&L axes when discipline is absent (0% coverage)', () => {
    const rows = pad([mkRow(200), mkRow(-100)], 20) // all technicals null → discipline null
    const r = computeEdgeScore(rows)
    expect(r.axes.find((a) => a.key === 'discipline')!.sub).toBeNull()
    const pnl = r.axes.filter((a) => a.key !== 'discipline' && a.sub !== null)
    const expected = Math.round(
      pnl.reduce((s, a) => s + a.weight * (a.sub as number), 0) /
        pnl.reduce((s, a) => s + a.weight, 0),
    )
    expect(r.score).toBe(expected)
  })
})

// ── Gates ───────────────────────────────────────────────────────────────────
describe('sample-size gates', () => {
  it('n < 5 → suppressed, score null', () => {
    const r = computeEdgeScore([mkRow(100), mkRow(-50), mkRow(100), mkRow(-50)])
    expect(r.n).toBe(4)
    expect(r.suppressed).toBe(true)
    expect(r.score).toBeNull()
    expect(r.provisional).toBe(false)
  })
  it('5 ≤ n < 20 → provisional, score present', () => {
    const r = computeEdgeScore(Array.from({ length: 10 }, (_, i) => mkRow(i % 2 ? 100 : -50)))
    expect(r.suppressed).toBe(false)
    expect(r.provisional).toBe(true)
    expect(r.score).not.toBeNull()
  })
  it('n ≥ 20 → not provisional', () => {
    const r = computeEdgeScore(Array.from({ length: 25 }, (_, i) => mkRow(i % 2 ? 100 : -50)))
    expect(r.provisional).toBe(false)
    expect(r.suppressed).toBe(false)
  })
})
