// The 2×2 MACD State grid (spec §B Section 2 / §G) — four MacdBucketCards in
// fixed reading order, best → worst: posRising / posFalling / negRising /
// negFalling. The SectionHeader (and its unclassified-chip `right` slot) is
// composed by TechnicalsTab, not here, so this stays a focused cell layout.

import type { MacdBucketStats } from '@/core/technicals/macdBuckets'
import MacdBucketCard from './MacdBucketCard'

interface MacdStateGridProps {
  stats: MacdBucketStats
}

export default function MacdStateGrid({ stats }: MacdStateGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <MacdBucketCard
        title="Positive + Rising ▲"
        tint="pos-rising"
        stats={stats.posRising}
      />
      <MacdBucketCard
        title="Positive + Falling ▼"
        tint="pos-falling"
        stats={stats.posFalling}
      />
      <MacdBucketCard
        title="Negative + Rising ▲"
        tint="neg-rising"
        stats={stats.negRising}
      />
      <MacdBucketCard
        title="Negative + Falling ▼"
        tint="neg-falling"
        stats={stats.negFalling}
      />
    </div>
  )
}
