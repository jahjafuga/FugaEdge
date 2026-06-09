// v0.2.4 Session 5a — pure MACD State 4-bucket aggregation (spec §B Section 2,
// the Technicals tab hero). Partitions data-complete, classifiable trades into
// the 2×2 grid (positive/negative × rising/falling) for the toggled timeframe,
// tracks the two non-classifiable tiers separately, and computes per-bucket
// count / win rate / net P&L / avg winner / avg loser / dollar expectancy.
//
// Sibling of computeHeaderStrip; shares its Timeframe type and data-gate idiom.
//
// Session 5b.1.1 extracted the shared classifier: classifyMacdBucket (+ the
// BucketKey union) is the single source of truth for "which bucket is this
// trade in" — called internally here AND by rowsForBucket, the renderer's
// accordion row resolver, so aggregation and row display never drift.
// MacdStateGrid reuses BucketKey for its open-bucket state. computeMacdBuckets'
// output is byte-identical to 5a.1.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db / React imports. The
// identical module runs server-side on the future Next.js + Postgres port.

import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import type { Timeframe } from './headerStrip'

/** The four MACD-state cells, in §G reading order (best → worst). Shared with
 *  MacdStateGrid (open-bucket state) and rowsForBucket (accordion rows). */
export type BucketKey = 'posRising' | 'posFalling' | 'negRising' | 'negFalling'

/**
 * Stats for a single MACD-state bucket cell.
 *
 * - n: trades in the bucket.
 * - winRate: winners / n, as a 0..1 FRACTION (NOT a percent) — null only when
 *   n === 0. The renderer formats it via percent() from @/lib/format, which
 *   takes a fraction; consistent with HeaderStrip CardStats.winRate. Shown for
 *   every non-empty bucket (a low-sample badge is the caveat, not suppression).
 * - netPnl: sum of net_pnl across the bucket (always computed).
 * - avgWinner: mean net_pnl among winners (net_pnl > 0); null when no winners.
 * - avgLoser: mean net_pnl among losers (net_pnl <= 0; breakeven counts as a
 *   loss per §A7); null when no losers. Naturally negative or zero.
 * - expectancy: dollar expectancy = netPnl / n; null when n < 5 (§C:104).
 */
export interface BucketStats {
  n: number
  winRate: number | null
  netPnl: number
  avgWinner: number | null
  avgLoser: number | null
  expectancy: number | null
}

/**
 * Aggregated stats for the MACD State 4-bucket grid.
 *
 * Three tiers account for every input row exactly once:
 * - excluded: failed the data gate (technicals === null || !data_complete).
 * - unclassified: data-complete but the toggled-timeframe macd_positive OR
 *   macd_rising is null (§A3 first-bar case) — at most one axis is known, so
 *   the trade can't land in a single cell. Surfaced in a neutral chip below
 *   the grid.
 * - denominator: classifiable trades (both axes non-null). Invariant:
 *   denominator === posRising.n + posFalling.n + negRising.n + negFalling.n.
 *
 * Buckets (positive/negative = macd_positive; rising/falling = macd_rising):
 * - posRising:  macd_positive && macd_rising      (spec §G "best")
 * - posFalling: macd_positive && !macd_rising
 * - negRising:  !macd_positive && macd_rising
 * - negFalling: !macd_positive && !macd_rising     (spec §G "worst")
 */
export interface MacdBucketStats {
  excluded: number
  unclassified: number
  denominator: number
  posRising: BucketStats
  posFalling: BucketStats
  negRising: BucketStats
  negFalling: BucketStats
}

/**
 * The bucket a single trade lands in on the given timeframe, or null when it
 * can't be placed — either the data gate failed (technicals null /
 * !data_complete) OR an axis is null (§A3 first-bar). Single source of truth
 * for classification: computeMacdBuckets accumulates through it and
 * rowsForBucket resolves accordion rows through it, so the two never drift.
 *
 * macd_positive / macd_rising are read DIRECTLY (never re-derived from a
 * histogram comparison — a null operand silently compares false and would
 * mislabel a first-bar entry as "falling" instead of unclassifiable).
 */
export function classifyMacdBucket(
  row: TradeWithTechnicalsRow,
  timeframe: Timeframe,
): BucketKey | null {
  const t = row.technicals
  if (t === null || !t.data_complete) return null
  const snap = timeframe === '1m' ? t.tf_1m : t.tf_5m
  const pos = snap.macd_positive
  const rising = snap.macd_rising
  if (pos === null || rising === null) return null
  if (pos && rising) return 'posRising'
  if (pos) return 'posFalling'
  if (rising) return 'negRising'
  return 'negFalling'
}

export function computeMacdBuckets(
  rows: TradeWithTechnicalsRow[],
  timeframe: Timeframe,
): MacdBucketStats {
  let excluded = 0
  let unclassified = 0
  let denominator = 0

  // Per-bucket accumulators: count, net P&L sum, and winner/loser tallies +
  // sums (the latter feed avgWinner / avgLoser).
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
  const posRising = blank()
  const posFalling = blank()
  const negRising = blank()
  const negFalling = blank()

  for (const row of rows) {
    const key = classifyMacdBucket(row, timeframe)
    if (key === null) {
      // Split the single null into the two tier counters — the classifier is
      // intentionally bucket-or-null, so re-read the gate state here to tell
      // excluded (gate fail) from unclassified (axis null). Cheap.
      const t = row.technicals
      if (t === null || !t.data_complete) excluded += 1
      else unclassified += 1
      continue
    }

    // Classifiable — lands in exactly one bucket.
    denominator += 1
    const bucket =
      key === 'posRising'
        ? posRising
        : key === 'posFalling'
          ? posFalling
          : key === 'negRising'
            ? negRising
            : negFalling

    // Breakeven (net_pnl === 0) counts as a loss per §A7, so a winner is
    // strictly > 0.
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

  const toBucket = (a: Acc): BucketStats => {
    // Per-bucket dollar expectancy — the mean net P&L per
    // trade in the bucket. The spec formulates this as
    //   (winRate * avgWinner) + ((1 - winRate) * avgLoser)
    // which algebraically simplifies to netPnl / n:
    //   (Wc/n)(Ws/Wc) + (Lc/n)(Ls/Lc) = (Ws + Ls) / n = netPnl / n
    // We compute it the simplified way for three reasons:
    //   1. Bit-exact integer arithmetic — no IEEE-754 dust
    //      accumulated by the multiplied fractions; tests
    //      assert via toBe rather than toBeCloseTo.
    //   2. Natural treatment of avgWinner-null and avgLoser-null
    //      edge cases — when a bucket is all-winners or
    //      all-losers, the missing term's coefficient is
    //      already zero (winRate or 1-winRate), so the
    //      missing average never participates.
    //   3. Faithful to spec §C:104 — suppression below n=5
    //      is applied on top, not within, the formula.
    const expectancy = a.n < 5 ? null : a.netPnl / a.n
    return {
      n: a.n,
      winRate: a.n === 0 ? null : a.winnerCount / a.n,
      netPnl: a.netPnl,
      avgWinner: a.winnerCount === 0 ? null : a.winnerSum / a.winnerCount,
      avgLoser: a.loserCount === 0 ? null : a.loserSum / a.loserCount,
      expectancy,
    }
  }

  return {
    excluded,
    unclassified,
    denominator,
    posRising: toBucket(posRising),
    posFalling: toBucket(posFalling),
    negRising: toBucket(negRising),
    negFalling: toBucket(negFalling),
  }
}

/**
 * The classifiable trades that land in `key` on `timeframe`, in input order —
 * the accordion's row source (5b). Re-uses classifyMacdBucket so the rows shown
 * under a cell exactly match that cell's counts; excluded / unclassified trades
 * land in no bucket and never appear here.
 */
export function rowsForBucket(
  rows: TradeWithTechnicalsRow[],
  timeframe: Timeframe,
  key: BucketKey,
): TradeWithTechnicalsRow[] {
  return rows.filter((row) => classifyMacdBucket(row, timeframe) === key)
}
