// Combined Signal Reads band (spec §B Section 5 / §A9) — the full-alignment vs
// any-misalignment comparison, the "are you trading the system or not" read. Two
// expandable BucketCards side by side (Full alignment / Any misalignment), each
// with a click-to-expand accordion beneath the row (single-open per section, via
// useBucketBand). Shares the MacdStateGrid expandable-card pattern exactly:
// BucketCard + AccordionPanel + the generic BucketTradeTable with macdLineColumn
// (alignment is MACD-anchored, so the MACD line is the natural drill column). The
// SectionHeader is composed by TechnicalsTab.
//
// Tint: the locked P&L-semantic win/loss tokens carry the discipline read at a
// glance — aligned = win-green (followed the system), misaligned = loss-red (broke
// it). These are designed, theme-independent colors (NOT the F8 gray placeholders
// the distance bands wait on), so Section 5's visual lands immediately. Complete
// literal class strings for Tailwind's JIT (the F4 idiom).
//
// Layout mirrors a single MacdStateGrid row: a grid-cols-2 of cards with NO parent
// gap, then one shared AccordionPanel beneath (open when either card is open), the
// open panel owning its top spacing via the AccordionPanel inner pt-3.

import { useMemo } from 'react'
import type {
  CombinedReadsStats,
  AlignmentKey,
} from '@/core/technicals/combinedReads'
import { rowsForAlignment } from '@/core/technicals/combinedReads'
import type { Timeframe } from '@/core/technicals/headerStrip'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import BucketCard from './BucketCard'
import BucketTradeTable from './BucketTradeTable'
import { macdLineColumn } from './distanceColumns'
import AccordionPanel from './AccordionPanel'
import { useBucketBand } from './useBucketBand'

interface CombinedReadsBandProps {
  stats: CombinedReadsStats
  filteredRows: TradeWithTechnicalsRow[]
  timeframe: Timeframe
}

export default function CombinedReadsBand({
  stats,
  filteredRows,
  timeframe,
}: CombinedReadsBandProps) {
  const { openBucket, displayBucket, onToggle } = useBucketBand<AlignmentKey>()

  // Rows for the displayed cell — derived from displayBucket (not openBucket) so
  // they persist through the close animation. Empty when nothing is shown.
  const openRows = useMemo(
    () =>
      displayBucket === null
        ? []
        : rowsForAlignment(filteredRows, timeframe, displayBucket),
    [displayBucket, filteredRows, timeframe],
  )

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-3">
        <BucketCard
          title="Full alignment"
          stats={stats.aligned}
          isOpen={openBucket === 'aligned'}
          onClick={() => onToggle('aligned')}
          restTintClass="bg-win/[0.12]"
          activeTintClass="bg-win/[0.18]"
        />
        <BucketCard
          title="Any misalignment"
          stats={stats.misaligned}
          isOpen={openBucket === 'misaligned'}
          onClick={() => onToggle('misaligned')}
          restTintClass="bg-loss/[0.12]"
          activeTintClass="bg-loss/[0.18]"
        />
      </div>
      <AccordionPanel open={openBucket !== null}>
        {displayBucket !== null && (
          <BucketTradeTable
            rows={openRows}
            timeframe={timeframe}
            distanceColumn={macdLineColumn}
          />
        )}
      </AccordionPanel>
    </div>
  )
}
