// Pure VWAP distance 7-bucket aggregation (spec §A4) — the first non-MACD
// consumer of the bucket-stats shape. Partitions data-complete, classifiable
// trades into the 7 signed-distance buckets (Below → Parabolic) for the toggled
// timeframe, tracks the excluded + unclassified tiers separately, and computes
// the per-bucket BucketStats. Direct parallel of macdBuckets.ts; the only
// structural difference is single-value range classification on vwap_dist_pct
// instead of the MACD 2×2 on two booleans.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db / React imports. The
// identical module runs server-side on the future Next.js + Postgres port.

import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import type { Timeframe } from './headerStrip'
import type { BucketStats } from './types'

/** The seven VWAP-distance buckets, ordered most-below → most-above (§A4),
 *  aligned with the bg-vwap-N palette slugs (v1 → vwap-1, … v7 → vwap-7). */
export type VwapBucketKey = 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7'

export interface VwapBucketMeta {
  key: VwapBucketKey
  /** §A4 label + range — the BucketRow title. */
  label: string
  /** Inclusive lower edge (-Infinity = open below). */
  lo: number
  /** Exclusive upper edge (+Infinity = open above). */
  hi: number
  /** DivergingBar position: index − 3, centred on At-VWAP (v3 = 0). */
  barValue: number
}

// DivergingBar symmetric extent — v7 (barValue +4) fills the right track; the
// below side (v1 = −2) reaches half, mirroring §A4's asymmetric boundaries.
export const VWAP_BUCKET_EXTENT = 4

/**
 * Single source of truth for the VWAP band: keys, labels, the numeric edges the
 * classifier partitions on (left-inclusive lo, right-exclusive hi per §A4), and
 * each bucket's DivergingBar barValue. The section component maps over this.
 */
export const VWAP_BUCKETS: readonly VwapBucketMeta[] = [
  { key: 'v1', label: 'Below / broken < -1.0%', lo: -Infinity, hi: -1.0, barValue: -2 },
  { key: 'v2', label: 'Just below VWAP -1.0% to -0.25%', lo: -1.0, hi: -0.25, barValue: -1 },
  { key: 'v3', label: 'At VWAP (equilibrium) -0.25% to +0.25%', lo: -0.25, hi: 0.25, barValue: 0 },
  { key: 'v4', label: 'Slightly extended +0.25% to +1.0%', lo: 0.25, hi: 1.0, barValue: 1 },
  { key: 'v5', label: 'Extended +1.0% to +3.0%', lo: 1.0, hi: 3.0, barValue: 2 },
  { key: 'v6', label: 'Stretched / chasing +3.0% to +6.0%', lo: 3.0, hi: 6.0, barValue: 3 },
  { key: 'v7', label: 'Parabolic / danger > +6.0%', lo: 6.0, hi: Infinity, barValue: 4 },
]

/**
 * Aggregated stats for the VWAP distance band. Three tiers account for every
 * input row exactly once (parallel to MacdBucketStats):
 * - excluded: failed the data gate (technicals === null || !data_complete).
 * - unclassified: data-complete but the toggled-timeframe vwap_dist_pct is null.
 *   Rare — VWAP is available from the first session bar (unlike MACD's first-bar
 *   macd_rising) — but kept for parity / defensiveness.
 * - denominator: classifiable trades. Invariant: denominator === Σ buckets[k].n.
 */
export interface VwapBucketStats {
  excluded: number
  unclassified: number
  denominator: number
  buckets: Record<VwapBucketKey, BucketStats>
}

/**
 * The VWAP bucket a single trade lands in on `timeframe`, or null when it can't
 * be placed (gate fail, or vwap_dist_pct null). Single source of truth for
 * classification: computeVwapBuckets accumulates through it and rowsForVwapBucket
 * resolves accordion rows through it, so the two never drift. The range partition
 * reads VWAP_BUCKETS' lo/hi edges (left-inclusive, right-exclusive per §A4).
 */
export function classifyVwapBucket(
  row: TradeWithTechnicalsRow,
  timeframe: Timeframe,
): VwapBucketKey | null {
  const t = row.technicals
  if (t === null || !t.data_complete) return null
  const snap = timeframe === '1m' ? t.tf_1m : t.tf_5m
  const d = snap.vwap_dist_pct
  if (d === null) return null
  // The edges partition all of ℝ, so a finite d always matches exactly one
  // bucket; find returns undefined only for NaN, which resolves to null.
  const meta = VWAP_BUCKETS.find((b) => d >= b.lo && d < b.hi)
  return meta ? meta.key : null
}

export function computeVwapBuckets(
  rows: TradeWithTechnicalsRow[],
  timeframe: Timeframe,
): VwapBucketStats {
  let excluded = 0
  let unclassified = 0
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
  const acc = {} as Record<VwapBucketKey, Acc>
  for (const b of VWAP_BUCKETS) acc[b.key] = blank()

  for (const row of rows) {
    const key = classifyVwapBucket(row, timeframe)
    if (key === null) {
      // Re-read the gate to split excluded (gate fail) from unclassified
      // (vwap_dist_pct null), parallel to computeMacdBuckets.
      const t = row.technicals
      if (t === null || !t.data_complete) excluded += 1
      else unclassified += 1
      continue
    }
    denominator += 1
    const bucket = acc[key]
    // Breakeven (net_pnl === 0) counts as a loss per §A7, so a winner is > 0.
    bucket.n += 1
    bucket.netPnl += row.net_pnl
    if (row.net_pnl > 0) {
      bucket.winnerCount += 1
      bucket.winnerSum += row.net_pnl
    } else {
      bucket.loserCount += 1
      bucket.loserSum += row.net_pnl
    }
  }

  // Per-bucket BucketStats — identical shape + math to macdBuckets' toBucket
  // (expectancy = netPnl / n, suppressed to null below n=5 per §C:104).
  const toBucket = (a: Acc): BucketStats => ({
    n: a.n,
    winRate: a.n === 0 ? null : a.winnerCount / a.n,
    netPnl: a.netPnl,
    avgWinner: a.winnerCount === 0 ? null : a.winnerSum / a.winnerCount,
    avgLoser: a.loserCount === 0 ? null : a.loserSum / a.loserCount,
    expectancy: a.n < 5 ? null : a.netPnl / a.n,
  })

  const buckets = {} as Record<VwapBucketKey, BucketStats>
  for (const b of VWAP_BUCKETS) buckets[b.key] = toBucket(acc[b.key])

  return { excluded, unclassified, denominator, buckets }
}

/**
 * The classifiable trades that land in `key` on `timeframe`, in input order —
 * the accordion's row source. Re-uses classifyVwapBucket so the rows shown under
 * a bucket exactly match its counts; excluded / unclassified trades never appear.
 */
export function rowsForVwapBucket(
  rows: TradeWithTechnicalsRow[],
  timeframe: Timeframe,
  key: VwapBucketKey,
): TradeWithTechnicalsRow[] {
  return rows.filter((row) => classifyVwapBucket(row, timeframe) === key)
}
