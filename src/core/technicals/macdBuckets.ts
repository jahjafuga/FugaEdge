// v0.2.4 Session 5a — pure MACD State 4-bucket aggregation (spec §B Section 2,
// the Technicals tab hero). Partitions data-complete, classifiable trades into
// the 2×2 grid (positive/negative × open/closed) for the toggled timeframe,
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
import type { BucketStats } from './types'

/** The four MACD-state cells, in §G reading order (best → worst). Shared with
 *  MacdStateGrid (open-bucket state) and rowsForBucket (accordion rows).
 *
 *  v0.2.7 — the SECOND AXIS IS OPEN/CLOSED (macd_line > signal_line), not
 *  rising/falling (histogram > histogram_prior). Founder-ruled: "open" is the
 *  momentum state a trader acts on; "rising" described the histogram's slope,
 *  which can rise while the line is still under its signal. macd_open has been
 *  stored per timeframe since schema 26, so this is a consumer-side change —
 *  no capture, schema, migration or backfill moved.
 *
 *  NOT to be confused with the CHART's macdHist colour keys (lib/chartColors),
 *  which stay rising/falling: colouring a histogram BAR by its slope is the
 *  correct semantic there and is a different concept entirely. */
export type BucketKey = 'posOpen' | 'posClosed' | 'negOpen' | 'negClosed'

/**
 * Aggregated stats for the MACD State 4-bucket grid.
 *
 * Three tiers account for every input row exactly once:
 * - excluded: failed the data gate (technicals === null || !data_complete).
 * - unclassified: data-complete but the toggled-timeframe macd_positive OR
 *   macd_open is null — at most one axis is known, so the trade can't land in
 *   a single cell. Surfaced in a neutral chip below the grid. The usual cause
 *   is an entry so near the open that the 9-period signal EMA has not settled
 *   (the line exists, the signal does not), which is why the chip now reads
 *   "signal not settled" rather than the old first-bar wording.
 * - denominator: classifiable trades (both axes non-null). Invariant:
 *   denominator === posRising.n + posFalling.n + negRising.n + negFalling.n.
 *
 * Buckets (positive/negative = macd_positive; open/closed = macd_open):
 * - posOpen:   macd_positive && macd_open      (spec §G "best")
 * - posClosed: macd_positive && !macd_open
 * - negOpen:   !macd_positive && macd_open
 * - negClosed: !macd_positive && !macd_open     (spec §G "worst")
 */
export interface MacdBucketStats {
  excluded: number
  unclassified: number
  denominator: number
  posOpen: BucketStats
  posClosed: BucketStats
  negOpen: BucketStats
  negClosed: BucketStats
}

/**
 * The bucket a single trade lands in on the given timeframe, or null when it
 * can't be placed — either the data gate failed (technicals null /
 * !data_complete) OR an axis is null (§A3 first-bar). Single source of truth
 * for classification: computeMacdBuckets accumulates through it and
 * rowsForBucket resolves accordion rows through it, so the two never drift.
 *
 * macd_positive / macd_open are read DIRECTLY (never re-derived from a
 * line-versus-signal comparison — a null operand silently compares false and
 * would mislabel an unsettled-signal entry as "closed" instead of
 * unclassifiable).
 */
export function classifyMacdBucket(
  row: TradeWithTechnicalsRow,
  timeframe: Timeframe,
): BucketKey | null {
  const t = row.technicals
  if (t === null || !t.data_complete) return null
  const snap = timeframe === '1m' ? t.tf_1m : t.tf_5m
  const pos = snap.macd_positive
  const open = snap.macd_open
  if (pos === null || open === null) return null
  if (pos && open) return 'posOpen'
  if (pos) return 'posClosed'
  if (open) return 'negOpen'
  return 'negClosed'
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
  const posOpen = blank()
  const posClosed = blank()
  const negOpen = blank()
  const negClosed = blank()

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
      key === 'posOpen'
        ? posOpen
        : key === 'posClosed'
          ? posClosed
          : key === 'negOpen'
            ? negOpen
            : negClosed

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
    posOpen: toBucket(posOpen),
    posClosed: toBucket(posClosed),
    negOpen: toBucket(negOpen),
    negClosed: toBucket(negClosed),
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
