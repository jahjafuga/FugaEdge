import type { WeeklySummary } from '@shared/calendar-types'
import { int, money, signed } from '@/lib/format'

interface WeeklyPanelProps {
  summary: WeeklySummary
  onClick: () => void
}

function shortMonthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[m - 1]} ${d}`
}

export default function WeeklyPanel({ summary, onClick }: WeeklyPanelProps) {
  const hasData = summary.trade_count > 0
  const hasJournal = summary.days_journaled > 0

  if (!hasData) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex h-full w-full flex-col items-center justify-center gap-1 border-b border-l border-border-subtle/60 bg-bg-1/30 px-3 py-2 text-center transition-colors duration-150 hover:bg-bg-1/50 ${
          !summary.in_month ? 'opacity-50' : ''
        }`}
        title="Open weekly review"
      >
        <div className="text-[9px] uppercase tracking-wider text-fg-tertiary">
          {shortMonthDay(summary.week_start)} – {shortMonthDay(summary.week_end)}
        </div>
        <div className="text-[10px] text-fg-tertiary">No trades</div>
        {hasJournal && (
          <div className="text-[9px] uppercase tracking-wider text-gold">
            ✎ {summary.days_journaled} journaled
          </div>
        )}
      </button>
    )
  }

  const pnlClass =
    summary.net_pnl > 0
      ? 'text-win'
      : summary.net_pnl < 0
        ? 'text-loss'
        : 'text-fg-primary'
  const glowBorder = summary.net_pnl !== 0
    ? 'border-gold/30 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.12)]'
    : 'border-border-subtle/60'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-full w-full flex-col items-stretch gap-1.5 border-b border-l ${glowBorder} bg-bg-1/40 px-3 py-2 text-left transition-all duration-150 hover:bg-bg-1/60 hover:border-gold/50 ${
        !summary.in_month ? 'opacity-60' : ''
      }`}
      title="Open weekly review"
    >
      <div className="flex items-baseline justify-between">
        <div className="text-[9px] uppercase tracking-wider text-fg-tertiary">
          {shortMonthDay(summary.week_start)}–{shortMonthDay(summary.week_end)}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-fg-tertiary">
          {int(summary.trade_count)}t
        </div>
      </div>

      <div className={`font-mono text-sm font-medium leading-tight ${pnlClass}`}>
        {signed(summary.net_pnl)}
      </div>

      <div className="font-mono text-[10px] text-fg-tertiary">
        <span className="text-win">{int(summary.winners)}</span>
        <span className="text-fg-tertiary">/</span>
        <span className="text-loss">{int(summary.losers)}</span>
        {summary.win_rate != null && (
          <>
            <span className="text-fg-tertiary"> · </span>
            <span className="text-gold">{(summary.win_rate * 100).toFixed(0)}%</span>
          </>
        )}
      </div>

      {summary.profit_factor != null && summary.profit_factor !== Infinity && (
        <div className="font-mono text-[10px] text-fg-secondary">
          PF {summary.profit_factor.toFixed(2)}
        </div>
      )}

      {summary.streak.kind !== 'none' && summary.streak.days >= 2 && (
        <div
 className={`text-[10px] uppercase tracking-wider ${
            summary.streak.kind === 'win' ? 'text-win' : 'text-loss'
          }`}
        >
          {summary.streak.days}-day {summary.streak.kind}
        </div>
      )}

      {hasJournal && (
        <div className="text-[9px] uppercase tracking-wider text-gold/80">
          ✎ {int(summary.days_journaled)}/{int(summary.days_traded)} journaled
        </div>
      )}

      {summary.top_mistake && (
        <div
          className="truncate text-[9px] uppercase tracking-wider text-loss"
          title={`Top mistake: ${summary.top_mistake.name} (${summary.top_mistake.count}×)`}
        >
          ✕ {summary.top_mistake.name}
        </div>
      )}

      <div className="mt-auto pt-1 text-[9px] uppercase tracking-wider text-fg-tertiary/80">
        {money(summary.total_fees)} fees
      </div>
    </button>
  )
}
