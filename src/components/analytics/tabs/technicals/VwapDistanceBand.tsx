// VWAP distance band (spec §B Section 3 / §A4) — the first vertical-list section,
// the foundation arc's first non-MACD consumer. Seven clickable BucketRows in
// §A4 reading order (most-below → most-above), each with a click-to-expand
// accordion beneath it (single-open per section, via useBucketBand). Composes the
// shared components: BucketRow (the row + DivergingBar), AccordionPanel, and the
// generic BucketTradeTable with the vwap distance column. The SectionHeader + its
// unclassified chip are composed by TechnicalsTab.
//
// The DivergingBar shows each bucket's position on the equilibrium axis (barValue
// from VWAP_BUCKETS, index − 3 centred on At-VWAP); below = chartColors.loss
// (bearish, per Ross Cameron's "below VWAP" framing), above = chartColors.win.
// The bg-vwap-N palette tint carries the ordinal weight separately.
//
// Layout: each row + its accordion in an item div with mt between items and NO
// parent gap, so a collapsed panel (0fr) keeps the list tight; the open panel
// owns its top spacing via the AccordionPanel inner pt-3 (parallel to
// MacdStateGrid's Flag-B layout).

import { useMemo } from 'react'
import type {
  VwapBucketStats,
  VwapBucketKey,
} from '@/core/technicals/vwapBuckets'
import {
  rowsForVwapBucket,
  VWAP_BUCKETS,
  VWAP_BUCKET_EXTENT,
} from '@/core/technicals/vwapBuckets'
import type { Timeframe } from '@/core/technicals/headerStrip'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'
import BucketRow from './BucketRow'
import BucketTradeTable from './BucketTradeTable'
import { vwapDistanceColumn } from './distanceColumns'
import AccordionPanel from './AccordionPanel'
import { useBucketBand } from './useBucketBand'

// Complete literal class strings so Tailwind's JIT detects them (the F4 idiom;
// `bg-vwap-${i}/[0.NN]` would scan as plain text and never emit). Rest 0.12 +
// active 0.18, keyed by VwapBucketKey → the bg-vwap-N palette tokens.
//
// Spec §J invariant 6 (visual at-vs-extended distinction) — DEFERRED: §G wants the
// bucket's color/opacity to make "near the level" (v3) vs "extended" readable at a
// glance. The position-weight half is realized via the DivergingBar barValue
// (tested in BucketRow.test.tsx); the color/opacity half waits because these
// bg-vwap-N tokens are F8's gray placeholders, so the distinction isn't realized
// yet. Revisit when the real palette lands (visual session). Audit map:
// src/core/technicals/__tests__/section6-invariants.test.ts.
const TINT_REST: Record<VwapBucketKey, string> = {
  v1: 'bg-vwap-1/[0.12]',
  v2: 'bg-vwap-2/[0.12]',
  v3: 'bg-vwap-3/[0.12]',
  v4: 'bg-vwap-4/[0.12]',
  v5: 'bg-vwap-5/[0.12]',
  v6: 'bg-vwap-6/[0.12]',
  v7: 'bg-vwap-7/[0.12]',
}
const TINT_ACTIVE: Record<VwapBucketKey, string> = {
  v1: 'bg-vwap-1/[0.18]',
  v2: 'bg-vwap-2/[0.18]',
  v3: 'bg-vwap-3/[0.18]',
  v4: 'bg-vwap-4/[0.18]',
  v5: 'bg-vwap-5/[0.18]',
  v6: 'bg-vwap-6/[0.18]',
  v7: 'bg-vwap-7/[0.18]',
}

interface VwapDistanceBandProps {
  stats: VwapBucketStats
  filteredRows: TradeWithTechnicalsRow[]
  timeframe: Timeframe
}

export default function VwapDistanceBand({
  stats,
  filteredRows,
  timeframe,
}: VwapDistanceBandProps) {
  const { openBucket, displayBucket, onToggle } = useBucketBand<VwapBucketKey>()
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])

  // Rows for the displayed bucket — derived from displayBucket (not openBucket)
  // so they persist through the close animation. Empty when nothing is shown.
  const openRows = useMemo(
    () =>
      displayBucket === null
        ? []
        : rowsForVwapBucket(filteredRows, timeframe, displayBucket),
    [displayBucket, filteredRows, timeframe],
  )

  return (
    <div className="flex flex-col">
      {VWAP_BUCKETS.map((b, i) => (
        <div key={b.key} className={i > 0 ? 'mt-2' : undefined}>
          <BucketRow
            title={b.label}
            stats={stats.buckets[b.key]}
            isOpen={openBucket === b.key}
            onClick={() => onToggle(b.key)}
            restTintClass={TINT_REST[b.key]}
            activeTintClass={TINT_ACTIVE[b.key]}
            barValue={b.barValue}
            barExtent={VWAP_BUCKET_EXTENT}
            barLeftColor={palette.loss}
            barRightColor={palette.win}
          />
          <AccordionPanel open={openBucket === b.key}>
            {displayBucket === b.key && (
              <BucketTradeTable
                rows={openRows}
                timeframe={timeframe}
                distanceColumn={vwapDistanceColumn}
              />
            )}
          </AccordionPanel>
        </div>
      ))}
    </div>
  )
}
