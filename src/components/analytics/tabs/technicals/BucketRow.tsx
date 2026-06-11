// BucketRow — the horizontal row analog of BucketCard for the VWAP (Section 3)
// and EMA (Section 4) distance bands. It shares BucketCard's chrome (a clickable
// button with the isOpen-conditional border + tint and aria-expanded) but lays
// its content out horizontally: [title + LowSampleBadge] grows on the left, the
// centered DivergingBar sits in the middle, and four compact stat cells (label
// over mono value) sit on the right.
//
// Renders only four of BucketStats' fields — Trades, Win rate, Net P&L,
// Expectancy — the set spec invariant 5 + §366 L370 require on the row face
// without expansion. Avg winner / avg loser are reserved for the band's
// expansion accordion. Value formatting matches BucketCard exactly (win rate via
// percent()'s own null sentinel; expectancy via the inline "—" ternary).
//
// The DivergingBar is decorative here (aria-hidden by default) — the title
// carries the distance range, so the bar is a redundant at-a-glance visual. It
// is value-agnostic (D-F5.2 deferred): BucketRow passes a barValue whose meaning
// (bucket center vs mean vs index position) is settled at section wiring.
//
// BucketStats is imported as-is from macdBuckets.ts (D-F5.5); the move to a
// neutral shared module is the upcoming F5.5 beat.

import type { BucketStats } from '@/core/technicals/types'
import { percent, signed } from '@/lib/format'
import LowSampleBadge from './LowSampleBadge'
import DivergingBar from '@/components/ui/DivergingBar'

interface BucketRowProps {
  title: string
  stats: BucketStats
  isOpen: boolean
  onClick: () => void
  restTintClass: string
  activeTintClass: string
  barValue: number
  barExtent: number
  barLeftColor: string
  barRightColor: string
}

export default function BucketRow({
  title,
  stats,
  isOpen,
  onClick,
  restTintClass,
  activeTintClass,
  barValue,
  barExtent,
  barLeftColor,
  barRightColor,
}: BucketRowProps) {
  // Same isOpen-conditional chrome as BucketCard: gold/60 border when open (no
  // hover variant), rest tint + gold/40 hover when closed.
  const borderClass = isOpen
    ? 'border-gold/60'
    : 'border-border-subtle hover:border-gold/40'
  const tintClass = isOpen ? activeTintClass : restTintClass

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-md border p-3 text-left transition-colors duration-150 ${borderClass} ${tintClass}`}
    >
      {/* Title + low-sample badge — left, grows and truncates. */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[10px] uppercase tracking-wider text-fg-tertiary">
          {title}
        </span>
        <LowSampleBadge n={stats.n} />
      </div>

      {/* Centered diverging bar — the §G distance visual (decorative). */}
      <DivergingBar
        value={barValue}
        extent={barExtent}
        leftColor={barLeftColor}
        rightColor={barRightColor}
        width={96}
        height={8}
      />

      {/* Four stat cells — Trades, Win rate, Net P&L, Expectancy (spec inv 5 +
          L370). Avg winner / avg loser live in the expansion accordion. */}
      <div className="flex shrink-0 items-center gap-3">
        <StatCell label="Trades" value={`${stats.n}`} />
        <StatCell label="Win rate" value={percent(stats.winRate, 0)} />
        <StatCell label="Net P&L" value={signed(stats.netPnl)} />
        <StatCell
          label="Expectancy"
          value={stats.expectancy === null ? '—' : signed(stats.expectancy)}
        />
      </div>
    </button>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[9px] uppercase tracking-wider text-fg-tertiary">
        {label}
      </span>
      <span className="font-mono text-[11px] text-fg-primary tnum">{value}</span>
    </div>
  )
}
