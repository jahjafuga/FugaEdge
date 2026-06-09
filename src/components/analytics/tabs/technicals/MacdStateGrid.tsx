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

import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react'
import type { MacdBucketStats, BucketKey } from '@/core/technicals/macdBuckets'
import { rowsForBucket } from '@/core/technicals/macdBuckets'
import type { Timeframe } from '@/core/technicals/headerStrip'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import MacdBucketCard from './MacdBucketCard'
import BucketTradeTable from './BucketTradeTable'

// ~200ms grid-rows transition + a 10ms buffer, so the table unmounts only after
// the collapse has finished.
const CLOSE_MS = 210

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
  // openBucket: which panel is visually open (drives the grid-rows animation).
  // displayBucket: which bucket's rows are mounted — lags openBucket on close
  // so the table animates out instead of vanishing.
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null)
  const [displayBucket, setDisplayBucket] = useState<BucketKey | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  // Clear any pending lag timer if the grid unmounts mid-close.
  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    }
  }, [])

  const onCardClick = (key: BucketKey) => {
    clearCloseTimer()
    if (openBucket === key) {
      // (1) Close the open card — keep its rows mounted until the collapse ends.
      setOpenBucket(null)
      closeTimer.current = setTimeout(() => setDisplayBucket(null), CLOSE_MS)
    } else if (openBucket === null) {
      // (2) Open fresh.
      setDisplayBucket(key)
      setOpenBucket(key)
    } else {
      // (3) Switch — collapse the current panel, then open the new one once the
      // close animation has finished (sequential, never two animating at once).
      setOpenBucket(null)
      closeTimer.current = setTimeout(() => {
        setDisplayBucket(key)
        setOpenBucket(key)
      }, CLOSE_MS)
    }
  }

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
          onClick={() => onCardClick('posRising')}
        />
        <MacdBucketCard
          title="Positive + Falling ▼"
          tint="pos-falling"
          stats={stats.posFalling}
          isOpen={openBucket === 'posFalling'}
          onClick={() => onCardClick('posFalling')}
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
          onClick={() => onCardClick('negRising')}
        />
        <MacdBucketCard
          title="Negative + Falling ▼"
          tint="neg-falling"
          stats={stats.negFalling}
          isOpen={openBucket === 'negFalling'}
          onClick={() => onCardClick('negFalling')}
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

// Inline-expansion panel (§97) — SettingsAccordion's grid-rows-[0fr]→[1fr]
// technique. The inner min-h-0 overflow-hidden is load-bearing: it lets the row
// track collapse to 0 and clips content during the transition. Reduced-motion
// is handled globally (index.css zeroes transition-duration). pt-3 spaces the
// table from the card row above when open; it contributes nothing when the row
// track is 0fr (closed), so the resting grid stays tight.
function AccordionPanel({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-200 ease-out-soft ${
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className="min-h-0 overflow-hidden" aria-hidden={!open}>
        <div className="pt-3">{children}</div>
      </div>
    </div>
  )
}
