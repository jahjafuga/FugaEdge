// EMA distance band (spec §B Section 4 / §A5) — the second vertical-list section,
// the foundation arc's second non-MACD consumer. Six clickable BucketRows in §A5
// reading order (most-below → most-above), each with a click-to-expand accordion
// beneath it (single-open per section, via useBucketBand), then the 9/20 stacking
// crossover strip below the list. Composes the shared components: BucketRow (the
// row + DivergingBar), AccordionPanel, and the generic BucketTradeTable with the
// ema distance column. The SectionHeader + its unclassified chip are composed by
// TechnicalsTab.
//
// The DivergingBar shows each bucket's position on the 9-EMA equilibrium axis
// (barValue from EMA_BUCKETS, linear index − 2 centred on At-9-EMA); below =
// chartColors.loss (the broken "riding the 9" trend), above = chartColors.win. The
// bg-ema-N palette tint carries the ordinal weight separately.
//
// The crossover strip is an INDEPENDENT binary dimension (§A5): the 9/20 stacking
// order (ema9_above_ema20), surfaced as stacked-vs-broken stat cells rather than a
// distance bucket. It reads stats.crossover, which computeEmaBuckets aggregates on
// its own gate — so a side's counts need not sum to the distance denominator.
//
// Layout: each row + its accordion in an item div with mt between items and NO
// parent gap, so a collapsed panel (0fr) keeps the list tight; the open panel owns
// its top spacing via the AccordionPanel inner pt-3 (parallel to VwapDistanceBand).

import { useMemo } from 'react'
import type {
  EmaBucketStats,
  EmaBucketKey,
} from '@/core/technicals/emaBuckets'
import {
  rowsForEmaBucket,
  EMA_BUCKETS,
  EMA_BUCKET_EXTENT,
} from '@/core/technicals/emaBuckets'
import type { Timeframe } from '@/core/technicals/headerStrip'
import type { BucketStats } from '@/core/technicals/types'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'
import { percent, signed } from '@/lib/format'
import BucketRow from './BucketRow'
import BucketTradeTable from './BucketTradeTable'
import { emaDistanceColumn } from './distanceColumns'
import AccordionPanel from './AccordionPanel'
import LowSampleBadge from './LowSampleBadge'
import { useBucketBand } from './useBucketBand'

// Complete literal class strings so Tailwind's JIT detects them (the F4 idiom;
// `bg-ema-${i}/[0.NN]` would scan as plain text and never emit). Rest 0.12 +
// active 0.18, keyed by EmaBucketKey → the bg-ema-N palette tokens.
//
// Spec §J invariant 6 (visual at-vs-extended distinction) — DEFERRED: §G wants the
// bucket's color/opacity to make "near the level" (e2) vs "extended" readable at a
// glance. The position-weight half is realized via the DivergingBar barValue
// (tested in BucketRow.test.tsx); the color/opacity half waits because these
// bg-ema-N tokens are F8's gray placeholders, so the distinction isn't realized
// yet. Revisit when the real palette lands (visual session). Audit map:
// src/core/technicals/__tests__/section6-invariants.test.ts.
const TINT_REST: Record<EmaBucketKey, string> = {
  e1: 'bg-ema-1/[0.12]',
  e2: 'bg-ema-2/[0.12]',
  e3: 'bg-ema-3/[0.12]',
  e4: 'bg-ema-4/[0.12]',
  e5: 'bg-ema-5/[0.12]',
  e6: 'bg-ema-6/[0.12]',
}
const TINT_ACTIVE: Record<EmaBucketKey, string> = {
  e1: 'bg-ema-1/[0.18]',
  e2: 'bg-ema-2/[0.18]',
  e3: 'bg-ema-3/[0.18]',
  e4: 'bg-ema-4/[0.18]',
  e5: 'bg-ema-5/[0.18]',
  e6: 'bg-ema-6/[0.18]',
}

interface EmaDistanceBandProps {
  stats: EmaBucketStats
  filteredRows: TradeWithTechnicalsRow[]
  timeframe: Timeframe
}

export default function EmaDistanceBand({
  stats,
  filteredRows,
  timeframe,
}: EmaDistanceBandProps) {
  const { openBucket, displayBucket, onToggle } = useBucketBand<EmaBucketKey>()
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])

  // Rows for the displayed bucket — derived from displayBucket (not openBucket)
  // so they persist through the close animation. Empty when nothing is shown.
  const openRows = useMemo(
    () =>
      displayBucket === null
        ? []
        : rowsForEmaBucket(filteredRows, timeframe, displayBucket),
    [displayBucket, filteredRows, timeframe],
  )

  return (
    <div>
      <div className="flex flex-col">
        {EMA_BUCKETS.map((b, i) => (
          <div key={b.key} className={i > 0 ? 'mt-2' : undefined}>
            <BucketRow
              title={b.label}
              stats={stats.buckets[b.key]}
              isOpen={openBucket === b.key}
              onClick={() => onToggle(b.key)}
              restTintClass={TINT_REST[b.key]}
              activeTintClass={TINT_ACTIVE[b.key]}
              barValue={b.barValue}
              barExtent={EMA_BUCKET_EXTENT}
              barLeftColor={palette.loss}
              barRightColor={palette.win}
            />
            <AccordionPanel open={openBucket === b.key}>
              {displayBucket === b.key && (
                <BucketTradeTable
                  rows={openRows}
                  timeframe={timeframe}
                  distanceColumn={emaDistanceColumn}
                />
              )}
            </AccordionPanel>
          </div>
        ))}
      </div>

      <CrossoverStrip crossover={stats.crossover} />
    </div>
  )
}

// The 9/20 stacking strip (D-B3.1) — the independent binary signal §A5 calls for,
// rendered below the bucket list as two side-by-side cells (stacked = 9 EMA over
// 20, broken = not). No DivergingBar / no accordion: it isn't a distance bucket.
function CrossoverStrip({
  crossover,
}: {
  crossover: { stacked: BucketStats; broken: BucketStats }
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        9/20 stacking
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CrossoverCell label="Stacked" stats={crossover.stacked} />
        <CrossoverCell label="Broken" stats={crossover.broken} />
      </div>
    </div>
  )
}

function CrossoverCell({ label, stats }: { label: string; stats: BucketStats }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-2 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
          {label}
        </span>
        <LowSampleBadge n={stats.n} />
      </div>
      {/* Four stat cells — Trades, Win rate, Net P&L, Expectancy — matching the
          BucketRow face (StatCell is private there; replicated locally rather than
          refactoring BucketRow out of this beat's scope). */}
      <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
        <StatCell label="Trades" value={`${stats.n}`} />
        <StatCell label="Win rate" value={percent(stats.winRate, 0)} />
        <StatCell label="Net P&L" value={signed(stats.netPnl)} />
        <StatCell
          label="Expectancy"
          value={stats.expectancy === null ? '—' : signed(stats.expectancy)}
        />
      </div>
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start">
      <span className="text-[9px] uppercase tracking-wider text-fg-tertiary">
        {label}
      </span>
      <span className="font-mono text-[11px] text-fg-primary tnum">{value}</span>
    </div>
  )
}
