import type { JournalDaySummary } from '@shared/journal-types'
import { int, money, signed, pnlClass } from '@/lib/format'

interface DayPnlBannerProps {
  summary: JournalDaySummary | null
}

export default function DayPnlBanner({ summary }: DayPnlBannerProps) {
  if (!summary) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-2 px-5 py-4 text-sm text-fg-tertiary">
        No trades on this day.
      </div>
    )
  }

  const wlSpread = summary.winners - summary.losers
  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 rounded-md border border-border-subtle bg-bg-2 px-5 py-4">
      <Stat label="Trades" value={int(summary.trade_count)} tone="text" />
      <Stat
        label="Net P&L"
        value={signed(summary.net_pnl)}
        tone={pnlClass(summary.net_pnl)}
        bold
      />
      <Stat label="Fees" value={money(summary.total_fees)} tone="text-loss" />
      <Stat
        label="W/L"
        value={
          <>
            <span className="text-win">{int(summary.winners)}</span>
            <span className="text-fg-tertiary">/</span>
            <span className="text-loss">{int(summary.losers)}</span>
            <span
              className={`ml-1.5 text-xs ${wlSpread > 0 ? 'text-win' : wlSpread < 0 ? 'text-loss' : 'text-fg-tertiary'}`}
            >
              ({wlSpread > 0 ? '+' : ''}
              {wlSpread})
            </span>
          </>
        }
        tone="text"
      />
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  bold,
}: {
  label: string
  value: React.ReactNode
  tone: string
  bold?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-fg-tertiary">{label}</div>
      <div
        className={`mt-1 font-mono ${bold ? 'text-xl font-medium' : 'text-base'} ${tone}`}
      >
        {value}
      </div>
    </div>
  )
}
