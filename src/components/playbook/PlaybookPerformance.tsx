import type { PlaybookStats } from '@shared/playbook-types'
import { int, money, pnlClass, signed } from '@/lib/format'

interface PlaybookPerformanceProps {
  stats: PlaybookStats
}

const DASH = '—'

// Two-row stats container — one bordered box with vertical column dividers
// between blocks and a horizontal divider between the top KPI row and the
// bottom mini stats row. Replaces the previous "floating cards in a gap
// grid" layout that had no visible separators.
export default function PlaybookPerformance({ stats }: PlaybookPerformanceProps) {
  const pf = stats.profit_factor
  const pfStr =
    pf == null ? 'N/A' : !Number.isFinite(pf) ? '∞' : pf.toFixed(2)

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-2 shadow-sm">
      {/* Top row — Hero KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4">
        <Cell
          label="Trades"
          value={int(stats.trade_count)}
          valueTone="text-fg-primary"
          big
        />
        <Cell
          label="Win rate"
          value={
            stats.win_rate == null
              ? DASH
              : `${(stats.win_rate * 100).toFixed(1)}%`
          }
          valueTone="text-gold"
          detail={`${int(stats.winners)} W · ${int(stats.losers)} L`}
          big
        />
        <Cell
          label="Net P&L"
          value={stats.trade_count > 0 ? signed(stats.net_pnl) : DASH}
          valueTone={stats.trade_count > 0 ? pnlClass(stats.net_pnl) : 'text-fg-tertiary'}
          big
        />
        <Cell
          label="Avg R"
          value={stats.avg_r == null ? DASH : stats.avg_r.toFixed(2)}
          valueTone="text-gold"
          detail="from R-multiple tracking"
          big
          isLast
        />
      </div>

      {/* Horizontal divider between hero row and mini-stats row */}
      <div className="border-t border-border-subtle" />

      {/* Bottom row — secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4">
        <Cell label="Profit factor" value={<span className="text-fg-primary">{pfStr}</span>} />
        <Cell
          label="Avg winner"
          value={
            <span className="text-win">
              {stats.avg_winner == null ? DASH : money(stats.avg_winner)}
            </span>
          }
        />
        <Cell
          label="Avg loser"
          value={
            <span className="text-loss">
              {stats.avg_loser == null ? DASH : money(stats.avg_loser)}
            </span>
          }
        />
        <Cell
          label="Largest W / L"
          value={
            <span className="font-mono text-fg-primary">
              <span className="text-win">
                {stats.largest_winner == null ? DASH : money(stats.largest_winner)}
              </span>
              <span className="mx-1 text-fg-tertiary">/</span>
              <span className="text-loss">
                {stats.largest_loser == null ? DASH : money(stats.largest_loser)}
              </span>
            </span>
          }
          isLast
        />
      </div>
    </div>
  )
}

// Single stat block. Right-border separator on every block except the last
// (per row, controlled by `isLast`). Mobile: the 2-col fallback means cells
// in odd positions get the right-border; we accept the small wart since the
// app is desktop-first.
function Cell({
  label,
  value,
  detail,
  valueTone,
  big = false,
  isLast = false,
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  valueTone?: string
  big?: boolean
  isLast?: boolean
}) {
  return (
    <div className={`px-6 py-4 ${isLast ? '' : 'lg:border-r border-border-subtle'}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {label}
      </div>
      <div
        className={`mt-1.5 font-mono font-semibold tnum ${
          big ? 'text-xl tracking-tight' : 'text-sm'
        } ${valueTone ?? 'text-fg-primary'}`}
      >
        {value}
      </div>
      {detail && (
        <div className="mt-1 font-mono text-[11px] text-fg-tertiary">{detail}</div>
      )}
    </div>
  )
}
