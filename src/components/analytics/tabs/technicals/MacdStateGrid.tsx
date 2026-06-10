// The MACD State 4-bucket grid (spec §B Section 2 / §G + §97 inline expansion).
// Four clickable MacdBucketCards in fixed reading order (best → worst) as two
// 2-up rows, with a click-to-expand accordion beneath the open card's row
// (single-open per section). The SectionHeader + its unclassified chip are
// composed by TechnicalsTab; this owns the open-bucket interaction.
//
// Two-state smooth close (5b.1.3): openBucket drives each panel's open/closed
// animation; displayBucket drives which bucket's rows render and lags openBucket
// by the ~200ms collapse so the table stays mounted through the close (a bare
// unmount would collapse an empty box — no visible animation). A tracked timer
// performs the lag and is cleared on every click + on unmount so rapid toggles
// can't fire a stale displayBucket reset.
//
// Layout (Flag B): per-row grids inside a flex-col with NO parent gap, so a
// collapsed panel (grid-rows-[0fr], 0 height) contributes zero spacing. Row 1
// carries mt-3 for the resting inter-row gap; the open panel owns its spacing
// via the inner pt-3.

import { useMemo } from 'react'
import type { MacdBucketStats, BucketKey } from '@/core/technicals/macdBuckets'
import { rowsForBucket } from '@/core/technicals/macdBuckets'
import type { Timeframe } from '@/core/technicals/headerStrip'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import MacdBucketCard from './MacdBucketCard'
import BucketTradeTable from './BucketTradeTable'
import AccordionPanel from './AccordionPanel'
import { useBucketBand } from './useBucketBand'

interface MacdStateGridProps {
  stats: MacdBucketStats
  filteredRows: TradeWithTechnicalsRow[]
  timeframe: Timeframe
}

const isRow0 = (k: BucketKey | null): boolean =>
  k === 'posRising' || k === 'posFalling'
const isRow1 = (k: BucketKey | null): boolean =>
  k === 'negRising' || k === 'negFalling'

export default function MacdStateGrid({
  stats,
  filteredRows,
  timeframe,
}: MacdStateGridProps) {
  const { openBucket, displayBucket, onToggle } = useBucketBand<BucketKey>()

  // Rows for the displayed bucket — derived from displayBucket (not openBucket)
  // so they persist through the close animation. Empty when nothing is shown.
  const openRows = useMemo(
    () =>
      displayBucket === null
        ? []
        : rowsForBucket(filteredRows, timeframe, displayBucket),
    [displayBucket, filteredRows, timeframe],
  )

  return (
    <div className="flex flex-col">
      {/* Row 0 — best → caution */}
      <div className="grid grid-cols-2 gap-3">
        <MacdBucketCard
          title="Positive + Rising ▲"
          tint="pos-rising"
          stats={stats.posRising}
          isOpen={openBucket === 'posRising'}
          onClick={() => onToggle('posRising')}
        />
        <MacdBucketCard
          title="Positive + Falling ▼"
          tint="pos-falling"
          stats={stats.posFalling}
          isOpen={openBucket === 'posFalling'}
          onClick={() => onToggle('posFalling')}
        />
      </div>
      <AccordionPanel open={isRow0(openBucket)}>
        {isRow0(displayBucket) && (
          <BucketTradeTable rows={openRows} timeframe={timeframe} />
        )}
      </AccordionPanel>

      {/* Row 1 — recovering → worst */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <MacdBucketCard
          title="Negative + Rising ▲"
          tint="neg-rising"
          stats={stats.negRising}
          isOpen={openBucket === 'negRising'}
          onClick={() => onToggle('negRising')}
        />
        <MacdBucketCard
          title="Negative + Falling ▼"
          tint="neg-falling"
          stats={stats.negFalling}
          isOpen={openBucket === 'negFalling'}
          onClick={() => onToggle('negFalling')}
        />
      </div>
      <AccordionPanel open={isRow1(openBucket)}>
        {isRow1(displayBucket) && (
          <BucketTradeTable rows={openRows} timeframe={timeframe} />
        )}
      </AccordionPanel>
    </div>
  )
}
