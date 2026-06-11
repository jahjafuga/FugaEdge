// Shared presentational shell for one bucket-stats cell: the clickable button
// chrome, the header (title + low-sample badge), the six stat rows, and all the
// isOpen-conditional styling (a stronger active tint, the gold/60 open border
// with no hover variant, and aria-expanded). MacdBucketCard (Section 2) is the
// first consumer; the future VWAP (Section 3) and EMA (Section 4) section cards
// are the others. Each wrapper resolves its own palette to the restTintClass /
// activeTintClass strings and passes them in, so the isOpen-driven styling lives
// in one place while the section-specific tint maps (literal class strings for
// Tailwind's JIT) stay in the wrappers.

import type { BucketStats } from '@/core/technicals/macdBuckets'
import { percent, signed } from '@/lib/format'
import LowSampleBadge from './LowSampleBadge'

interface BucketCardProps {
  title: string // full header text, e.g. "Positive + Rising ▲"
  stats: BucketStats
  isOpen: boolean
  onClick: () => void
  restTintClass: string // bucket tint at rest (~0.12), resolved by the wrapper
  activeTintClass: string // bucket tint when open (~0.18), resolved by the wrapper
}

export default function BucketCard({
  title,
  stats,
  isOpen,
  onClick,
  restTintClass,
  activeTintClass,
}: BucketCardProps) {
  // Open: stronger tint + gold/60 border, and NO hover variant (the active
  // border wins unconditionally, so hovering the open card never drops it to
  // /40). Closed: rest tint + gold/40 on hover — the clickable-card affordance.
  const borderClass = isOpen
    ? 'border-gold/60'
    : 'border-border-subtle hover:border-gold/40'
  const tintClass = isOpen ? activeTintClass : restTintClass

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      className={`w-full cursor-pointer rounded-md border p-3 text-left transition-colors duration-150 ${borderClass} ${tintClass}`}
    >
      <div className="flex flex-col gap-2">
        {/* Header — title + low-sample badge (self-hides outside 0 < n < 5). */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
            {title}
          </span>
          <LowSampleBadge n={stats.n} />
        </div>

        {/* Six stat rows — every bucket always renders all six (spec §C). The
            format helpers and explicit null checks resolve to "—" in the empty
            / no-winner / no-loser / suppressed cases. */}
        <StatRow label="Trades" value={`${stats.n}`} />
        <StatRow label="Win rate" value={percent(stats.winRate, 0)} />
        <StatRow label="Net P&L" value={signed(stats.netPnl)} />
        <StatRow
          label="Avg winner"
          value={stats.avgWinner === null ? '—' : signed(stats.avgWinner)}
        />
        <StatRow
          label="Avg loser"
          value={stats.avgLoser === null ? '—' : signed(stats.avgLoser)}
        />
        <StatRow
          label="Expectancy"
          value={stats.expectancy === null ? '—' : signed(stats.expectancy)}
        />
      </div>
    </button>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[11px] text-fg-tertiary">{label}</span>
      <span className="font-mono text-[11px] text-fg-primary">{value}</span>
    </div>
  )
}
