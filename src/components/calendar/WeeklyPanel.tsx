import { Pencil } from 'lucide-react'
import type { WeeklySummary } from '@shared/calendar-types'
import { int, money, percent, signed } from '@/lib/format'

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
          <div className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-gold">
            <Pencil size={9} strokeWidth={2} />
            {summary.days_journaled} journaled
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
  // Weekly P/L ratio = avg winner / |avg loser|, the SAME definition as the day
  // cell + Compare (metrics.ts winLossRatio): null when no winners, no losers,
  // or avg_loser is 0 - shown only when real (never a fabricated number, and
  // never the old profit-factor fallback).
  const plRatio =
    summary.avg_winner != null && summary.avg_loser != null && summary.avg_loser !== 0
      ? summary.avg_winner / Math.abs(summary.avg_loser)
      : null

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-full w-full flex-col items-stretch gap-2 border-b border-l ${glowBorder} bg-bg-1/40 px-3 py-2.5 text-left transition-all duration-150 hover:bg-bg-1/60 hover:border-gold/50 ${
        !summary.in_month ? 'opacity-60' : ''
      }`}
      title="Open weekly review"
    >
      {/* Header: week range + trade count, quiet. */}
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-wider text-fg-tertiary">
          {shortMonthDay(summary.week_start)}–{shortMonthDay(summary.week_end)}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-fg-tertiary">
          {int(summary.trade_count)}t
        </span>
      </div>

      {/* HERO: the week's net P&L, bigger + bold, green/red - the panel's focal
          point, echoing the day cell's P&L hero. */}
      <div className={`font-mono text-xl font-bold leading-none tabular-nums ${pnlClass}`}>
        {signed(summary.net_pnl)}
      </div>

      {/* Primary stat line, echoing the day cell: win% (gold) then W/L (winners
          green / losers red), then the weekly P/L ratio (gold) where PF used to
          be. win% and ratio are null-guarded - omitted, never faked. */}
      <div className="flex items-center gap-1 font-mono text-[10px] font-medium leading-none tabular-nums">
        {summary.win_rate != null && (
          <>
            <span className="text-gold">{percent(summary.win_rate, 0)}</span>
            <span className="text-fg-muted">·</span>
          </>
        )}
        <span>
          <span className="text-win">{int(summary.winners)}</span>
          <span className="text-fg-muted">/</span>
          <span className="text-loss">{int(summary.losers)}</span>
        </span>
        {plRatio != null && (
          <>
            <span className="text-fg-muted">·</span>
            <span className="text-gold">{plRatio.toFixed(2)}</span>
          </>
        )}
      </div>

      {/* Quiet supporting tier beneath the hero - streak, journaled, top
          mistake, fees: re-ranked smaller + muted so they read but do not
          compete with the P&L. Pinned to the bottom (mt-auto). */}
      <div className="mt-auto flex flex-col gap-0.5 pt-1.5 text-[9px] uppercase tracking-wider">
        {summary.streak.kind !== 'none' && summary.streak.days >= 2 && (
          <span className={summary.streak.kind === 'win' ? 'text-win/90' : 'text-loss/90'}>
            {summary.streak.days}-day {summary.streak.kind}
          </span>
        )}
        {hasJournal && (
          <span className="inline-flex items-center gap-1 text-gold/70">
            <Pencil size={9} strokeWidth={2} />
            {int(summary.days_journaled)}/{int(summary.days_traded)} journaled
          </span>
        )}
        <span className="text-fg-tertiary/80">{money(summary.total_fees)} fees</span>
      </div>
    </button>
  )
}
