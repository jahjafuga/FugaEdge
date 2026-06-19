// Beat 4c PART B — pure confluence count-bucketing for the Performance tab's
// "Does confluence pay?" section. Web-portable per ARCHITECTURE.md: no
// electron/sqlite/http/React imports.
//
// Input is PRE-CLASSIFIED: the renderer derives each trade's signalCount
// (primary-present-and-non-system ? 1 : 0, plus secondary_tag_count) and hands
// it here. This module knows NOTHING about playbook_tier / is_system — it just
// partitions by signalCount into 1 / 2 / 3+ buckets and defers every number to
// the Convention-A computeOutcomeStats helper (4a). NO new stats math.
//
// 0-signal trades are EXCLUDED: a No-Setup primary becomes the separate cost
// line, and an untagged-with-no-secondaries trade makes no confluence claim.

import { computeOutcomeStats } from '@/core/stats/outcomeStats'

export type SignalBucketKey = '1' | '2' | '3+'

/** Bucket ordering is fixed; all three always render (empty ones included). */
export const SIGNAL_BUCKETS: readonly SignalBucketKey[] = ['1', '2', '3+']

export interface SignalBucketRow {
  bucket: SignalBucketKey
  /** Trades in the bucket — winners + losers + scratches (mirrors the Tier
   *  card's `trades` count; the sample size, not the decided count). */
  count: number
  /** Convention-A win rate — winners / (winners + losers); null when no
   *  decided trades (e.g. an empty bucket). */
  win_rate: number | null
  /** Sum of net_pnl across the bucket's trades (0 for an empty bucket). */
  net_pnl: number
  /** WR·avgWinner − (1−WR)·|avgLoser|; null when it can't be computed. */
  expectancy: number | null
}

function bucketFor(signalCount: number): SignalBucketKey | null {
  if (signalCount <= 0) return null
  if (signalCount === 1) return '1'
  if (signalCount === 2) return '2'
  return '3+'
}

/** Partition pre-classified trades into 1 / 2 / 3+ signal buckets and compute
 *  each bucket's Convention-A stats. Always returns three rows in SIGNAL_BUCKETS
 *  order; 0-signal trades are dropped (never bucketed). */
export function computeSignalBuckets(
  trades: readonly { net_pnl: number; signalCount: number }[],
): SignalBucketRow[] {
  const byBucket: Record<SignalBucketKey, { net_pnl: number }[]> = {
    '1': [],
    '2': [],
    '3+': [],
  }

  for (const t of trades) {
    const key = bucketFor(t.signalCount)
    if (key) byBucket[key].push(t)
  }

  return SIGNAL_BUCKETS.map((bucket) => {
    const subset = byBucket[bucket]
    const s = computeOutcomeStats(subset)
    return {
      bucket,
      count: subset.length,
      win_rate: s.win_rate,
      net_pnl: s.net_pnl,
      expectancy: s.expectancy,
    }
  })
}
