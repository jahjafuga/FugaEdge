// One MACD-state cell of the Section 2 grid (spec §B Section 2 / §G). Static
// this session — no cursor / hover; the click-to-expand accordion lands in 5b.
// The semantic background tint IS the surface (no bg-bg-2 underlay) per §G,
// applied via a complete-literal class map so Tailwind's JIT detects it:
// `bg-macd-${tint}/[0.12]` template construction would scan as plain text and
// never emit, so the four classes must appear verbatim in source.

import type { BucketStats } from '@/core/technicals/macdBuckets'
import { percent, signed } from '@/lib/format'
import LowSampleBadge from './LowSampleBadge'

type BucketTint = 'pos-rising' | 'pos-falling' | 'neg-rising' | 'neg-falling'

interface MacdBucketCardProps {
  title: string // full header text, e.g. "Positive + Rising ▲"
  tint: BucketTint
  stats: BucketStats
}

// Complete literal class strings (see header note on JIT detection) — each
// resolves the 5a.0 token at ~0.12 opacity, the TierBadge tinting idiom.
const TINT_BG: Record<BucketTint, string> = {
  'pos-rising': 'bg-macd-pos-rising/[0.12]',
  'pos-falling': 'bg-macd-pos-falling/[0.12]',
  'neg-rising': 'bg-macd-neg-rising/[0.12]',
  'neg-falling': 'bg-macd-neg-falling/[0.12]',
}

export default function MacdBucketCard({ title, tint, stats }: MacdBucketCardProps) {
  return (
    <div className={`rounded-md border border-border-subtle p-3 ${TINT_BG[tint]}`}>
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
    </div>
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
