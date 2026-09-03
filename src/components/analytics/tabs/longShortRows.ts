// THE LONG-VS-SHORT ROW TABLES (beat 289). ROWS, the section grouping, the
// delta arms and their two covered-projection helpers, moved OUT of the tab
// component byte-identical in logic. No component lives here, which is the
// point: a module whose exports are all plain values lets vite fast-refresh
// the tab again (287's METRIC_ROW_KEYS export on the component file broke it).
import {
  formatProfitFactor,
  formatPnlRatio,
  money,
  percent,
  duration,
  int,
  signed,
} from '@/lib/format'
import type { SideStats } from '@/core/performance/direction'
import { DirectionWording as W, fillDirection } from '@shared/direction-wording'
import type { TradeListRow } from '@shared/trades-types'

// -- The delta arms (beat 288) ---------------------------------------------
// Every delta carries an explicit sign, formatted as Compare's private
// fmtDelta formats the SAME kind (CompareView.tsx:1061-1083), arm by arm:
//   money    :1064  signed(delta)      -- signed() is importable, so CALLED
//   int      :1072  `${d >= 0 ? '+' : ''}${Math.round(d)}`      -- mirrored
//   ratio    :1073  `${d >= 0 ? '+' : ''}${d.toFixed(2)}`       -- mirrored
//   duration :1076  sign + duration(Math.abs(d))                -- mirrored
//   pct      :1071  lives on the winRate row since beat 284     -- mirrored
// Compare has NO arm for R multiples, so expectancyR takes the ruled
// fallback: '+' or '-', then the row's own base format on the magnitude.
export const deltaMoney = (v: number) => signed(v)
export const deltaInt = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v)}`
export const deltaRatio = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
export const deltaDuration = (v: number) => `${v >= 0 ? '+' : '-'}${duration(Math.abs(v))}`
export const deltaR = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(2)}R`

export interface MetricRow {
  key: string
  value: (s: SideStats) => number | null
  fmt: (v: number) => string
  /** Delta formatter; defaults to fmt. Kept separate for the rows whose
   *  difference is not the same unit as the value (win rate in points). */
  deltaFmt?: (v: number) => string
  /** Optional small print under the value (coverage lines). */
  sub?: (s: SideStats) => string | null
  /** True when the value is withheld on a low-sample side (the SS-C:104
   *  convention: the earned ratios are withheld, the rest render). */
  earned?: boolean
}

/** Mean over the rows a projection covers; null when none are covered. */
function coveredMean(rows: readonly TradeListRow[], pick: (t: TradeListRow) => number | null): number | null {
  let sum = 0
  let k = 0
  for (const t of rows) {
    const v = pick(t)
    if (v != null && Number.isFinite(v)) {
      sum += v
      k++
    }
  }
  return k > 0 ? sum / k : null
}

/** Rows carrying an excursion value; the denominator of the coverage line. */
function coveredCount(rows: readonly TradeListRow[], pick: (t: TradeListRow) => number | null): number {
  let k = 0
  for (const t of rows) {
    const v = pick(t)
    if (v != null && Number.isFinite(v)) k++
  }
  return k
}

/** PeriodMetrics types.ts:123 phrases the R coverage "(of N trades with R)";
 *  the sub-lines reuse that phrasing and the excursion wording. */
export const ROWS: MetricRow[] = [
  { key: 'netPnL', value: (s) => s.snapshot.metrics.netPnL, fmt: money, deltaFmt: deltaMoney },
  { key: 'trades', value: (s) => s.n, fmt: int, deltaFmt: deltaInt },
  {
    key: 'winRate',
    value: (s) => s.snapshot.metrics.winRate,
    fmt: (v) => percent(v),
    // The delta formats as Compare's win-rate delta does (CompareView.tsx:835
    // kind="pct"; its private fmtDelta arm at :1071) -- signed, x100, one
    // decimal. The formatter is module-private there, so the expression is
    // mirrored byte for byte rather than imported.
    deltaFmt: (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`,
  },
  {
    // The design partner's payoff read (beat 289): avg winner over |avg
    // loser|, PeriodMetrics' own winLossRatio (types.ts:105, computed at
    // metrics.ts:255-258) -- USED, never recomputed here. The label follows
    // the app's precedent "P&L ratio" (OverviewTiles.tsx:100); the format is
    // profit factor's, whose null/infinity/2dp convention formatPnlRatio
    // shares byte for byte (format.ts:101-116).
    key: 'plRatio',
    value: (s) => s.snapshot.metrics.winLossRatio,
    // beat 290: the type doc's NAMED renderer for winLossRatio
    // (format.ts:112-116); profit factor keeps formatProfitFactor.
    fmt: formatPnlRatio,
    deltaFmt: deltaRatio,
    earned: true,
  },
  { key: 'profitFactor', value: (s) => s.snapshot.metrics.profitFactor, fmt: formatProfitFactor, deltaFmt: deltaRatio, earned: true },
  { key: 'expectancy', value: (s) => s.snapshot.metrics.expectancy, fmt: money, deltaFmt: deltaMoney, earned: true },
  {
    key: 'expectancyR',
    value: (s) => s.snapshot.metrics.expectancyR,
    fmt: (v) => `${v.toFixed(2)}R`,
    deltaFmt: deltaR,
    sub: (s) => `of ${int(s.snapshot.metrics.rCoverage)} trades with R`,
  },
  { key: 'avgWinner', value: (s) => s.snapshot.metrics.avgWinner, fmt: money, deltaFmt: deltaMoney },
  { key: 'avgLoser', value: (s) => s.snapshot.metrics.avgLoser, fmt: money, deltaFmt: deltaMoney },
  { key: 'largestWinner', value: (s) => s.snapshot.metrics.largestWinner, fmt: money, deltaFmt: deltaMoney },
  { key: 'largestLoser', value: (s) => s.snapshot.metrics.largestLoser, fmt: money, deltaFmt: deltaMoney },
  { key: 'avgHold', value: (s) => s.snapshot.metrics.avgHoldSeconds, fmt: (v) => duration(v), deltaFmt: deltaDuration },
  { key: 'maxDrawdown', value: (s) => s.snapshot.drawdown?.amount ?? null, fmt: money, deltaFmt: deltaMoney },
  // The Rules score row does NOT render here (beat 284): dna is attached only
  // by Trades.tsx:396, never by the Analytics fetch, so "0 of N scored" from
  // this path was a wrong figure. The row returns when this page's rows carry dna.
  {
    key: 'avgMfe',
    value: (s) => coveredMean(s.snapshot.trades, (t) => t.mfe),
    fmt: money,
    deltaFmt: deltaMoney,
    sub: (s) =>
      fillDirection(W.excursionCoverage, { k: coveredCount(s.snapshot.trades, (t) => t.mfe) }),
  },
  {
    // MAE renders the stored magnitude, unsigned, exactly as the app already
    // shows a single trade's MAE (TradeDetailSheet.tsx:467, TradesTable.tsx:853).
    key: 'avgMae',
    value: (s) => coveredMean(s.snapshot.trades, (t) => t.mae),
    fmt: money,
    deltaFmt: deltaMoney,
    sub: (s) =>
      fillDirection(W.excursionCoverage, { k: coveredCount(s.snapshot.trades, (t) => t.mae) }),
  },
]

/** Every grid key, exported so the polarity guard can hold the two tables to
 *  each other (G13b): a row without a polarity entry or an entry without a
 *  row is a drift either way. */
export const METRIC_ROW_KEYS = ROWS.map((r) => r.key)

/** The grid's four sections (beat 287), header rows from the wording. Every
 *  metric row is unchanged in value; the sections only group them. */
export const SECTIONS: { wordingKey: 'sectionOutcome' | 'sectionSize' | 'sectionRisk' | 'sectionExcursion'; keys: string[] }[] = [
  { wordingKey: 'sectionOutcome', keys: ['netPnL', 'trades', 'winRate', 'plRatio', 'profitFactor', 'expectancy', 'expectancyR'] },
  { wordingKey: 'sectionSize', keys: ['avgWinner', 'avgLoser', 'largestWinner', 'largestLoser'] },
  { wordingKey: 'sectionRisk', keys: ['avgHold', 'maxDrawdown'] },
  { wordingKey: 'sectionExcursion', keys: ['avgMfe', 'avgMae'] },
]
