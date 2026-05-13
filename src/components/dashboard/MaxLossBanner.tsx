import { AlertTriangle } from 'lucide-react'
import { money, signed, longDate } from '@/lib/format'

interface MaxLossBannerProps {
  todayPnl: number       // negative when in drawdown
  maxDailyLoss: number   // positive threshold (e.g. 500 means "−$500 = bad")
  date: string
}

export default function MaxLossBanner({
  todayPnl,
  maxDailyLoss,
  date,
}: MaxLossBannerProps) {
  if (!maxDailyLoss || maxDailyLoss <= 0) return null
  if (todayPnl > -maxDailyLoss) return null

  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-loss/40 bg-loss-soft px-4 py-3"
    >
      <AlertTriangle size={20} strokeWidth={2} className="shrink-0 text-loss" />
      <div className="flex-1">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-loss">
          Max daily loss reached
        </div>
        <div className="mt-0.5 text-sm text-fg-secondary">
          Today's P&L is{' '}
          <span className="font-mono font-semibold text-loss tnum">{signed(todayPnl)}</span>{' '}
          — past your{' '}
          <span className="font-mono tnum">{money(maxDailyLoss)}</span>{' '}
          daily limit.{' '}
          <span className="text-fg-tertiary">{longDate(date)}</span>
        </div>
      </div>
    </div>
  )
}
