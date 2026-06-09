// One MACD-state cell of the Section 2 grid (spec §B Section 2 / §G). Session
// 5b.1.3 made it clickable: a <button> that toggles the bucket's accordion
// (parent owns openBucket; this just fires onClick and reflects isOpen). The
// active variant strengthens the tint to 0.18 — also clearing the deferred §G
// "middle tints too faint at 0.12" polish — and lifts the border to gold/60.
//
// Tints use complete-literal class maps so Tailwind's JIT detects them:
// `bg-macd-${tint}/[0.NN]` template construction would scan as plain text and
// never emit, so both the 0.12 (rest) and 0.18 (active) classes appear verbatim.

import type { BucketStats } from '@/core/technicals/macdBuckets'
import { percent, signed } from '@/lib/format'
import LowSampleBadge from './LowSampleBadge'

type BucketTint = 'pos-rising' | 'pos-falling' | 'neg-rising' | 'neg-falling'

interface MacdBucketCardProps {
  title: string // full header text, e.g. "Positive + Rising ▲"
  tint: BucketTint
  stats: BucketStats
  isOpen: boolean
  onClick: () => void
}

// Rest tint (~0.12) and active tint (~0.18) — full literal strings for the JIT.
const TINT_BG: Record<BucketTint, string> = {
  'pos-rising': 'bg-macd-pos-rising/[0.12]',
  'pos-falling': 'bg-macd-pos-falling/[0.12]',
  'neg-rising': 'bg-macd-neg-rising/[0.12]',
  'neg-falling': 'bg-macd-neg-falling/[0.12]',
}
const TINT_BG_ACTIVE: Record<BucketTint, string> = {
  'pos-rising': 'bg-macd-pos-rising/[0.18]',
  'pos-falling': 'bg-macd-pos-falling/[0.18]',
  'neg-rising': 'bg-macd-neg-rising/[0.18]',
  'neg-falling': 'bg-macd-neg-falling/[0.18]',
}

export default function MacdBucketCard({
  title,
  tint,
  stats,
  isOpen,
  onClick,
}: MacdBucketCardProps) {
  // Open: stronger tint + gold/60 border, and NO hover variant (the active
  // border wins unconditionally, so hovering the open card never drops it to
  // /40). Closed: rest tint + gold/40 on hover — the clickable-card affordance.
  const borderClass = isOpen
    ? 'border-gold/60'
    : 'border-border-subtle hover:border-gold/40'
  const tintClass = isOpen ? TINT_BG_ACTIVE[tint] : TINT_BG[tint]

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
