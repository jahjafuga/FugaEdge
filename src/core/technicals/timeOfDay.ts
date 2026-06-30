// Pure Time-of-Day cross-cut aggregation (spec §B Section 6 / §I) — the entry
// time-bucket × MACD-state matrix. Cross-tabs each data-complete, classifiable
// trade by entry time (open_time, ET-converted) on one axis and MACD state on the
// other, producing a 5 × 4 grid of BucketStats. The time buckets map Ross
// Cameron's volatility regimes (the first two hours, then midday): pre-9:30 /
// 9:30-10:00 / 10:00-11:00 / 11:00-12:00 / 12:00+, all US/Eastern.
//
// The time axis is timeframe-INVARIANT (open_time is fixed); the MACD-state axis
// is timeframe-dependent (classifyMacdBucket reads the toggled snapshot), so
// flipping 1M/5M moves a trade between columns but never between rows. A trade is
// dropped (excluded) when EITHER axis can't place it: a null/unparseable open_time
// (rare) or a null MACD state (gate-fail or §A3 first-bar). The matrix is
// cross-classified only; the global excluded count rides the §C filter-bar chip.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db imports. utcToEasternParts
// (pure Intl, DST-aware) is the same ET converter charts/vwap.ts uses.

import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import type { Timeframe } from './headerStrip'
import { classifyMacdBucket, type BucketKey } from './macdBuckets'
import type { BucketStats } from './types'
import { utcToEasternParts } from '@/lib/format'
import { isSummaryTrip } from '@/core/classify/summaryTrip'

/** The five entry-time buckets (§I), ordered earliest → latest. */
export type TimeOfDayKey = 'pre930' | 't0930' | 't1000' | 't1100' | 't1200'

export interface TimeOfDayBucketMeta {
  key: TimeOfDayKey
  /** §I label + range — the matrix row header. */
  label: string
  /** Inclusive lower edge, ET minutes-since-midnight (-Infinity = open below). */
  loMin: number
  /** Exclusive upper edge, ET minutes-since-midnight (+Infinity = open above). */
  hiMin: number
}

// The four MACD-state columns, in §G reading order (best → worst). The matrix
// iterates these for the column dimension; classifyMacdBucket resolves each cell.
const MACD_KEYS: readonly BucketKey[] = [
  'posRising',
  'posFalling',
  'negRising',
  'negFalling',
]

// Edge minutes — 9:30 / 10:00 / 11:00 / 12:00 ET as minutes-since-midnight. Edges
// are left-inclusive, right-exclusive (the §A4/§A5 distance-bucket convention), so
// 9:30:00 opens t0930 and 12:00:00 opens t1200.
const MIN_0930 = 9 * 60 + 30 // 570
const MIN_1000 = 10 * 60 // 600
const MIN_1100 = 11 * 60 // 660
const MIN_1200 = 12 * 60 // 720

/**
 * Single source of truth for the time axis: keys, §I labels, and the ET
 * minute edges the classifier partitions on. The matrix component maps over this
 * for its row headers.
 */
export const TIME_OF_DAY_BUCKETS: readonly TimeOfDayBucketMeta[] = [
  { key: 'pre930', label: 'Pre-9:30', loMin: -Infinity, hiMin: MIN_0930 },
  { key: 't0930', label: '9:30-10:00', loMin: MIN_0930, hiMin: MIN_1000 },
  { key: 't1000', label: '10:00-11:00', loMin: MIN_1000, hiMin: MIN_1100 },
  { key: 't1100', label: '11:00-12:00', loMin: MIN_1100, hiMin: MIN_1200 },
  { key: 't1200', label: '12:00+', loMin: MIN_1200, hiMin: Infinity },
]

/**
 * Aggregated stats for the Time-of-Day matrix. cells is a nested
 * time-bucket → MACD-state → BucketStats lookup (5 × 4 = 20 cells). Two tiers:
 * - excluded: a null axis (open_time unparseable, or MACD state null).
 * - denominator: cross-classified trades. Invariant: denominator === Σ cells[t][m].n.
 */
export interface TimeOfDayStats {
  excluded: number
  denominator: number
  cells: Record<TimeOfDayKey, Record<BucketKey, BucketStats>>
}

/**
 * The entry-time bucket a trade lands in, or null when open_time is unparseable.
 * No timeframe parameter — entry time is the same regardless of the 1M/5M toggle
 * (unlike classifyMacdBucket). Reads open_time through utcToEasternParts (DST-aware)
 * and partitions on ET minutes-since-midnight. Single source of truth for the time
 * axis: computeTimeOfDay and rowsForTimeOfDayCell both resolve through it.
 */
export function classifyTimeOfDay(
  row: TradeWithTechnicalsRow,
): TimeOfDayKey | null {
  const parts = utcToEasternParts(row.open_time)
  if (parts === null) return null
  const min = parts.hour * 60 + parts.minute
  const meta = TIME_OF_DAY_BUCKETS.find((b) => min >= b.loMin && min < b.hiMin)
  return meta ? meta.key : null
}

export function computeTimeOfDay(
  rows: TradeWithTechnicalsRow[],
  timeframe: Timeframe,
): TimeOfDayStats {
  // Phase 3 — summary trips carry a fake 09:30 anchor; drop them entirely up front
  // so they pollute neither the cells nor the `excluded` count. Keyed on
  // source_format, never the 0s-hold heuristic.
  rows = rows.filter((r) => !isSummaryTrip(r))
  let excluded = 0
  let denominator = 0

  interface Acc {
    n: number
    netPnl: number
    winnerCount: number
    winnerSum: number
    loserCount: number
    loserSum: number
  }
  const blank = (): Acc => ({
    n: 0,
    netPnl: 0,
    winnerCount: 0,
    winnerSum: 0,
    loserCount: 0,
    loserSum: 0,
  })

  // Fold one trade's P&L into a cell. Breakeven (net_pnl === 0) counts as a loss
  // per §A7, so a winner is strictly > 0.
  const tally = (a: Acc, net_pnl: number): void => {
    a.n += 1
    a.netPnl += net_pnl
    if (net_pnl > 0) {
      a.winnerCount += 1
      a.winnerSum += net_pnl
    } else {
      a.loserCount += 1
      a.loserSum += net_pnl
    }
  }

  const acc = {} as Record<TimeOfDayKey, Record<BucketKey, Acc>>
  for (const b of TIME_OF_DAY_BUCKETS) {
    acc[b.key] = {} as Record<BucketKey, Acc>
    for (const m of MACD_KEYS) acc[b.key][m] = blank()
  }

  for (const row of rows) {
    const tKey = classifyTimeOfDay(row)
    const mKey = classifyMacdBucket(row, timeframe)
    // Cross-classified only: a null on EITHER axis drops the trade (D-S6.4).
    if (tKey === null || mKey === null) {
      excluded += 1
      continue
    }
    denominator += 1
    tally(acc[tKey][mKey], row.net_pnl)
  }

  // Per-cell BucketStats — identical shape + math to the distance bands' toBucket
  // (expectancy = netPnl / n, suppressed to null below n=5 per §C:104).
  const toBucket = (a: Acc): BucketStats => ({
    n: a.n,
    winRate: a.n === 0 ? null : a.winnerCount / a.n,
    netPnl: a.netPnl,
    avgWinner: a.winnerCount === 0 ? null : a.winnerSum / a.winnerCount,
    avgLoser: a.loserCount === 0 ? null : a.loserSum / a.loserCount,
    expectancy: a.n < 5 ? null : a.netPnl / a.n,
  })

  const cells = {} as Record<TimeOfDayKey, Record<BucketKey, BucketStats>>
  for (const b of TIME_OF_DAY_BUCKETS) {
    cells[b.key] = {} as Record<BucketKey, BucketStats>
    for (const m of MACD_KEYS) cells[b.key][m] = toBucket(acc[b.key][m])
  }

  return { excluded, denominator, cells }
}

/**
 * The trades cross-classified into one (timeKey, macdKey) cell, in input order —
 * the accordion's row source. Re-uses both classifiers so the rows shown under a
 * cell exactly match its counts; excluded (null-axis) trades never appear.
 */
export function rowsForTimeOfDayCell(
  rows: TradeWithTechnicalsRow[],
  timeframe: Timeframe,
  timeKey: TimeOfDayKey,
  macdKey: BucketKey,
): TradeWithTechnicalsRow[] {
  return rows.filter(
    (row) =>
      !isSummaryTrip(row) &&
      classifyTimeOfDay(row) === timeKey &&
      classifyMacdBucket(row, timeframe) === macdKey,
  )
}
