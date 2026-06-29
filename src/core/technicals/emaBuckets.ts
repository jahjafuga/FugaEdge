// Pure EMA distance 7-bucket aggregation (spec §A5) — the Section 4 sibling of
// vwapBuckets.ts. Partitions data-complete, classifiable trades into the 7 signed
// 9-EMA-distance buckets (Below → Blow-off) for the toggled timeframe, tracks the
// excluded + unclassified tiers separately, and computes the per-bucket
// BucketStats. Adds one dimension VWAP lacks: the 9/20 crossover
// (ema9_above_ema20), aggregated as an INDEPENDENT stacked-vs-broken pair (spec
// §A5's "20 EMA — binary crossover only" + the L387 independence invariant). The
// crossover runs through its own gate, so a trade can land in a distance bucket
// yet be crossover-null (or vice versa); stacked.n + broken.n need not equal the
// distance denominator.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db / React imports. The
// identical module runs server-side on the future Next.js + Postgres port.

import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import type { Timeframe } from './headerStrip'
import type { BucketStats } from './types'

/** The seven 9-EMA-distance buckets, ordered most-below → most-above (§A5),
 *  aligned with the bg-ema-N palette slugs (e1 → ema-1, … e6 → ema-6; e7 reuses
 *  ema-6 as a placeholder pending its own palette token). */
export type EmaBucketKey = 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6' | 'e7'

export interface EmaBucketMeta {
  key: EmaBucketKey
  /** §A5 label + range — the BucketRow title. */
  label: string
  /** Inclusive lower edge (-Infinity = open below). */
  lo: number
  /** Exclusive upper edge (+Infinity = open above). */
  hi: number
  /** DivergingBar position: linear index − 2 (1-based), centred on At-9-EMA
   *  (e2 = 0). §A5 has a single below bucket, so the axis is right-weighted. */
  barValue: number
}

// DivergingBar symmetric extent — e7 (barValue +5) fills the right track; the
// lone below bucket (e1 = −1) reaches a fifth, mirroring §A5's one-below /
// six-at-or-above asymmetry.
export const EMA_BUCKET_EXTENT = 5

/**
 * Single source of truth for the EMA band: keys, labels, the numeric edges the
 * classifier partitions on (left-inclusive lo, right-exclusive hi per §A5), and
 * each bucket's DivergingBar barValue. The section component maps over this.
 * Labels are §A5 verbatim with the range appended, ASCII hyphens for the negative
 * edges (matching the VWAP precedent).
 */
// Canonical signed 7-band scheme (Bug C — djsevans's proposal, adopted wholesale:
// +2% is still a good pullback, so "extended" must not start until +5%). SIGNED,
// not absolute distance — a negative value is "below the 9 EMA", never extended.
export const EMA_BUCKETS: readonly EmaBucketMeta[] = [
  { key: 'e1', label: 'Below 9 EMA / broken trend < -0.5%', lo: -Infinity, hi: -0.5, barValue: -1 },
  { key: 'e2', label: 'At 9 EMA (ideal pullback zone) -0.5% to +0.5%', lo: -0.5, hi: 0.5, barValue: 0 },
  { key: 'e3', label: 'Near EMA (pullback zone) +0.5% to +2.0%', lo: 0.5, hi: 2.0, barValue: 1 },
  { key: 'e4', label: 'Above EMA (trending) +2.0% to +5.0%', lo: 2.0, hi: 5.0, barValue: 2 },
  { key: 'e5', label: 'Extended +5.0% to +10.0%', lo: 5.0, hi: 10.0, barValue: 3 },
  { key: 'e6', label: 'Very extended +10.0% to +20.0%', lo: 10.0, hi: 20.0, barValue: 4 },
  { key: 'e7', label: 'Blow-off / parabolic > +20.0%', lo: 20.0, hi: Infinity, barValue: 5 },
]

/**
 * Aggregated stats for the EMA distance band. The distance dimension uses the
 * same three tiers as VwapBucketStats — every input row counted exactly once on
 * the distance axis:
 * - excluded: failed the data gate (technicals === null || !data_complete).
 * - unclassified: data-complete but the toggled-timeframe ema9_dist_pct is null.
 * - denominator: distance-classifiable trades. Invariant: denominator === Σ buckets[k].n.
 *
 * crossover is an INDEPENDENT dimension (spec §A5 / the L387 invariant): the 9/20
 * stacking order, aggregated over its own gate (classifyEmaCrossover), NOT a
 * partition of the distance buckets. A trade can be distance-classified yet
 * crossover-null (ema9_above_ema20 null) or vice versa, so stacked.n + broken.n
 * need not equal denominator.
 */
export interface EmaBucketStats {
  excluded: number
  unclassified: number
  denominator: number
  buckets: Record<EmaBucketKey, BucketStats>
  crossover: { stacked: BucketStats; broken: BucketStats }
}

/**
 * Classify a SIGNED 9-EMA distance % into a canonical band key, or null when the
 * value is null/NaN. The single source of truth for the canonical scheme, shared
 * by BOTH the Technicals band (classifyEmaBucket, which reads the per-timeframe
 * snapshot) AND the Momentum analytics surfaces (ema9DistanceBuckets.ts, which
 * read trades.entry_ema9_distance_pct). Edges are left-inclusive / right-exclusive
 * per §A5, so e.g. +5.0% is Extended (e5), not Above-EMA (e4).
 */
export function classifyEma9Distance(distPct: number | null): EmaBucketKey | null {
  if (distPct === null) return null
  // The edges partition all of ℝ, so a finite value matches exactly one bucket;
  // find returns undefined only for NaN, which resolves to null.
  const meta = EMA_BUCKETS.find((b) => distPct >= b.lo && distPct < b.hi)
  return meta ? meta.key : null
}

/**
 * The EMA bucket a single trade lands in on `timeframe`, or null when it can't be
 * placed (gate fail, or ema9_dist_pct null). Single source of truth for the
 * distance axis: computeEmaBuckets accumulates through it and rowsForEmaBucket
 * resolves accordion rows through it, so the two never drift. Delegates the
 * number→band partition to classifyEma9Distance (the shared canonical classifier).
 */
export function classifyEmaBucket(
  row: TradeWithTechnicalsRow,
  timeframe: Timeframe,
): EmaBucketKey | null {
  const t = row.technicals
  if (t === null || !t.data_complete) return null
  const snap = timeframe === '1m' ? t.tf_1m : t.tf_5m
  return classifyEma9Distance(snap.ema9_dist_pct)
}

/**
 * The 9/20 stacking side a single trade reads on `timeframe`, or null when it
 * can't be placed. Independent of classifyEmaBucket — its own data gate, then the
 * ema9_above_ema20 boolean (true → stacked-bullish, false → broken). A trade may
 * be distance-classifiable but crossover-null, and vice versa (spec §A5).
 */
export function classifyEmaCrossover(
  row: TradeWithTechnicalsRow,
  timeframe: Timeframe,
): 'stacked' | 'broken' | null {
  const t = row.technicals
  if (t === null || !t.data_complete) return null
  const snap = timeframe === '1m' ? t.tf_1m : t.tf_5m
  const above = snap.ema9_above_ema20
  if (above === null) return null
  return above ? 'stacked' : 'broken'
}

export function computeEmaBuckets(
  rows: TradeWithTechnicalsRow[],
  timeframe: Timeframe,
): EmaBucketStats {
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

  // Fold one trade's P&L into an accumulator. Breakeven (net_pnl === 0) counts as
  // a loss per §A7, so a winner is strictly > 0. Shared by the distance buckets
  // and the two crossover sides (EMA aggregates into two dimensions, unlike VWAP's
  // single one — hence the extracted helper rather than VWAP's inlined block).
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

  const acc = {} as Record<EmaBucketKey, Acc>
  for (const b of EMA_BUCKETS) acc[b.key] = blank()
  const crossAcc: Record<'stacked' | 'broken', Acc> = {
    stacked: blank(),
    broken: blank(),
  }

  for (const row of rows) {
    // Distance dimension (three-tier, parallel to VWAP).
    const key = classifyEmaBucket(row, timeframe)
    if (key === null) {
      // Re-read the gate to split excluded (gate fail) from unclassified
      // (ema9_dist_pct null), parallel to computeVwapBuckets.
      const t = row.technicals
      if (t === null || !t.data_complete) excluded += 1
      else unclassified += 1
    } else {
      denominator += 1
      tally(acc[key], row.net_pnl)
    }

    // Crossover dimension — independent gate, no effect on the tiers above. A
    // gate-failed or axis-null row simply contributes to neither side.
    const side = classifyEmaCrossover(row, timeframe)
    if (side !== null) tally(crossAcc[side], row.net_pnl)
  }

  // Per-bucket BucketStats — identical shape + math to vwapBuckets' toBucket
  // (expectancy = netPnl / n, suppressed to null below n=5 per §C:104).
  const toBucket = (a: Acc): BucketStats => ({
    n: a.n,
    winRate: a.n === 0 ? null : a.winnerCount / a.n,
    netPnl: a.netPnl,
    avgWinner: a.winnerCount === 0 ? null : a.winnerSum / a.winnerCount,
    avgLoser: a.loserCount === 0 ? null : a.loserSum / a.loserCount,
    expectancy: a.n < 5 ? null : a.netPnl / a.n,
  })

  const buckets = {} as Record<EmaBucketKey, BucketStats>
  for (const b of EMA_BUCKETS) buckets[b.key] = toBucket(acc[b.key])

  return {
    excluded,
    unclassified,
    denominator,
    buckets,
    crossover: {
      stacked: toBucket(crossAcc.stacked),
      broken: toBucket(crossAcc.broken),
    },
  }
}

/**
 * The classifiable trades that land in `key` on `timeframe`, in input order — the
 * accordion's row source. Re-uses classifyEmaBucket so the rows shown under a
 * bucket exactly match its counts; excluded / unclassified trades never appear.
 */
export function rowsForEmaBucket(
  rows: TradeWithTechnicalsRow[],
  timeframe: Timeframe,
  key: EmaBucketKey,
): TradeWithTechnicalsRow[] {
  return rows.filter((row) => classifyEmaBucket(row, timeframe) === key)
}
