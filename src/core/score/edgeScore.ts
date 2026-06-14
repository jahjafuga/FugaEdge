// v0.2.5 Edge Intelligence — Beat 2. The Edge Score: a single 0–100 "how sharp
// am I" composite over six weighted axes (spec §F). PURE per ARCHITECTURE rule
// #1 — no electron / fs / DB / React imports; it runs identically in a future
// Next.js + Postgres port. It reuses the ANALYTICS-side pure fns
// (computeHeaderStrip for discipline; isWin/isLoss for P&L) and NEVER imports
// src/core/xp — the Edge Score reads P&L to advise, it never feeds the XP/badge
// ledger (D19).
//
// Normalization (founder-ruled): every axis maps its raw metric to a 0–100
// sub-score by a linear clamp between two published band endpoints —
//   sub = clamp((raw − lo)/(hi − lo), 0, 1) × 100
// The band endpoints carry direction, so the inverted Drawdown axis (lo=1.0,
// hi=0.2) uses the same formula with no special-case. The composite is the
// weight-normalized mean over the axes that have data (a null axis — e.g. zero
// technicals coverage, or an all-scratch book with no decided trades — drops
// out and the remaining weights rescale, rather than being penalized as 0).

import { isWin, isLoss } from '@/core/classify/outcome'
import { computeHeaderStrip } from '@/core/technicals/headerStrip'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'

export type AxisKey =
  | 'discipline'
  | 'profit_factor'
  | 'win_rate'
  | 'avg_win_loss'
  | 'max_drawdown'
  | 'consistency'

/** Published formula — DATA the UI renders (the published-formula rule, §F:702).
 *  `lo` maps to sub-score 0, `hi` to 100; for the inverted Drawdown axis lo>hi. */
export interface AxisBand {
  key: AxisKey
  label: string
  weight: number // percent; the six sum to 100
  lo: number
  hi: number
  /** Short human band, e.g. "≤0.8 → ≥2.5". Rendered beside the axis. */
  band: string
  /** How to format `raw` on hover: 'pct' (a 0–100 percent), 'frac' (0–1 → %),
   *  or 'x' (a ratio shown with ×). */
  rawFormat: 'pct' | 'frac' | 'x'
}

export const EDGE_SCORE_BANDS: readonly AxisBand[] = [
  { key: 'discipline',    label: 'Discipline',      weight: 25, lo: 0,    hi: 100,  band: '0% → 100% aligned', rawFormat: 'pct' },
  { key: 'profit_factor', label: 'Profit Factor',   weight: 20, lo: 0.8,  hi: 2.5,  band: '≤0.8 → ≥2.5',       rawFormat: 'x' },
  { key: 'win_rate',      label: 'Win Rate',        weight: 15, lo: 0.30, hi: 0.65, band: '≤30% → ≥65%',       rawFormat: 'frac' },
  { key: 'avg_win_loss',  label: 'Avg Win/Loss',    weight: 15, lo: 0.5,  hi: 2.0,  band: '≤0.5 → ≥2.0',       rawFormat: 'x' },
  { key: 'max_drawdown',  label: 'Max DD / Gross',  weight: 15, lo: 1.0,  hi: 0.2,  band: '≥1.0 → ≤0.2',       rawFormat: 'x' },
  { key: 'consistency',   label: 'Consistency',     weight: 10, lo: 0.30, hi: 0.70, band: '≤30% → ≥70% green', rawFormat: 'frac' },
] as const

/** Whole-score suppression / provisional thresholds (window trade count). */
export const EDGE_SCORE_SUPPRESS_BELOW = 5
export const EDGE_SCORE_PROVISIONAL_BELOW = 20

export interface AxisResult {
  key: AxisKey
  label: string
  weight: number
  /** The underlying metric (percent, fraction, or ratio per the band's
   *  rawFormat). null when not computable (no decided trades / no coverage). */
  raw: number | null
  /** 0–100 sub-score. null when the axis has no data and drops from the mean. */
  sub: number | null
  /** Discipline only — the technicals data gate (62-of-98 chip). */
  coverage?: { complete: number; total: number }
}

export interface EdgeScoreResult {
  /** 0–100 weighted composite, rounded. null when suppressed (n < 5). */
  score: number | null
  axes: AxisResult[]
  /** Window trade count. */
  n: number
  /** n < 5 — too little to score at all. */
  suppressed: boolean
  /** 5 ≤ n < 20 — scored, but flag it as early. */
  provisional: boolean
}

const bandFor = (key: AxisKey): AxisBand => EDGE_SCORE_BANDS.find((b) => b.key === key)!

/** Linear clamp of a raw metric to 0–100 between the band endpoints. Infinity
 *  is handled by the clamp (no special-case): for an ascending band it pins to
 *  100, for the inverted Drawdown band it pins to 0. */
function clampSub(raw: number, lo: number, hi: number): number {
  const t = (raw - lo) / (hi - lo)
  return Math.max(0, Math.min(1, t)) * 100
}

/** Max peak-to-trough drawdown on the cumulative net-P&L curve (equity starts
 *  at 0). Ordered by `open_time` — a deliberate sub-minute approximation for day
 *  trades (entry and exit are minutes apart, so entry order ≈ realization
 *  order); adding close_time to the technicals row was ruled a disproportionate
 *  schema/IPC change. Always ≥ 0. */
export function maxDrawdownByOpenTime(rows: TradeWithTechnicalsRow[]): number {
  const sorted = [...rows].sort((a, b) =>
    a.open_time < b.open_time ? -1 : a.open_time > b.open_time ? 1 : 0,
  )
  let cum = 0
  let peak = 0
  let maxDD = 0
  for (const r of sorted) {
    cum += r.net_pnl
    if (cum > peak) peak = cum
    const dd = peak - cum
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

/** % of trading days that were net-positive (week.ts:210 greenDays formula —
 *  a day counts green when its summed net P&L is strictly > 0). null when there
 *  are no trading days. */
function greenDayRate(rows: TradeWithTechnicalsRow[]): number | null {
  const byDate = new Map<string, number>()
  for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.net_pnl)
  if (byDate.size === 0) return null
  let green = 0
  for (const net of byDate.values()) if (net > 0) green += 1
  return green / byDate.size
}

export function computeEdgeScore(rows: TradeWithTechnicalsRow[]): EdgeScoreResult {
  const n = rows.length
  const suppressed = n < EDGE_SCORE_SUPPRESS_BELOW
  const provisional = !suppressed && n < EDGE_SCORE_PROVISIONAL_BELOW

  // ── One P&L pass — gross win/loss + winner/loser counts (isWin/isLoss are the
  //    same scratch-aware classifier aggregate()/day.ts/week.ts use). ──
  let grossWin = 0
  let grossLoss = 0
  let winners = 0
  let losers = 0
  for (const r of rows) {
    if (isWin(r.net_pnl)) {
      winners += 1
      grossWin += r.net_pnl
    } else if (isLoss(r.net_pnl)) {
      losers += 1
      grossLoss += Math.abs(r.net_pnl)
    }
  }
  const decided = winners + losers

  // Profit Factor — day.ts:159-161 formula (winnerSum / -loserSum). No-losers
  // guard returns Infinity (clamps to 100) WITHOUT dividing; all-scratch → null.
  const pfRaw: number | null =
    decided === 0 ? null : losers === 0 ? Infinity : grossWin / grossLoss

  // Win Rate.
  const wrRaw: number | null = decided === 0 ? null : winners / decided

  // Avg Win/Loss — avg winner ÷ |avg loser|.
  const avgWin = winners > 0 ? grossWin / winners : null
  const avgLoss = losers > 0 ? grossLoss / losers : null
  const awlRaw: number | null =
    avgWin !== null && avgLoss !== null && avgLoss !== 0 ? avgWin / avgLoss : null

  // Max Drawdown / gross profit (inverted). grossProfit === 0 → sub 0 (no NaN),
  // with raw left null since the ratio is undefined.
  const maxDD = maxDrawdownByOpenTime(rows)
  const ddRaw: number | null = grossWin === 0 ? null : maxDD / grossWin

  // Consistency — % green days.
  const consRaw = greenDayRate(rows)

  // Discipline — REUSE the analytics-side §A9 full-alignment % (tf_1m). null
  // when no complete technicals exist (denominator 0). coverage = 62-of-98 chip.
  const hs = computeHeaderStrip(rows, '1m')
  const discRaw = hs.fullAlignment.percent
  const coverage = { complete: hs.denominator, total: hs.denominator + hs.excluded }

  const sub = (key: AxisKey, raw: number | null): number | null => {
    if (raw === null) return null
    const b = bandFor(key)
    return clampSub(raw, b.lo, b.hi)
  }

  const axes: AxisResult[] = [
    {
      key: 'discipline',
      label: bandFor('discipline').label,
      weight: bandFor('discipline').weight,
      raw: discRaw,
      sub: sub('discipline', discRaw),
      coverage,
    },
    { key: 'profit_factor', label: bandFor('profit_factor').label, weight: bandFor('profit_factor').weight, raw: pfRaw, sub: sub('profit_factor', pfRaw) },
    { key: 'win_rate',      label: bandFor('win_rate').label,      weight: bandFor('win_rate').weight,      raw: wrRaw, sub: sub('win_rate', wrRaw) },
    { key: 'avg_win_loss',  label: bandFor('avg_win_loss').label,  weight: bandFor('avg_win_loss').weight,  raw: awlRaw, sub: sub('avg_win_loss', awlRaw) },
    {
      key: 'max_drawdown',
      label: bandFor('max_drawdown').label,
      weight: bandFor('max_drawdown').weight,
      raw: ddRaw,
      // grossProfit 0 → explicit 0 (worst), not null, so the axis still counts.
      sub: grossWin === 0 ? 0 : sub('max_drawdown', ddRaw),
    },
    { key: 'consistency',   label: bandFor('consistency').label,   weight: bandFor('consistency').weight,   raw: consRaw, sub: sub('consistency', consRaw) },
  ]

  // Composite — weight-normalized mean over axes that have a sub-score.
  let score: number | null = null
  if (!suppressed) {
    const present = axes.filter((a) => a.sub !== null)
    const totalWeight = present.reduce((s, a) => s + a.weight, 0)
    if (totalWeight > 0) {
      const weighted = present.reduce((s, a) => s + a.weight * (a.sub as number), 0)
      score = Math.round(weighted / totalWeight)
    }
  }

  return { score, axes, n, suppressed, provisional }
}
