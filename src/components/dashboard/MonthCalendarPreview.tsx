import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { MonthCalendar } from '@shared/dashboard-types'
import { signed } from '@/lib/format'

interface MonthCalendarPreviewProps {
  month: MonthCalendar
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function MonthCalendarPreview({ month }: MonthCalendarPreviewProps) {
  const navigate = useNavigate()
  const monthName = new Date(month.year, month.month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const firstDay = new Date(month.year, month.month - 1, 1).getDay()
  const daysInMonth = new Date(month.year, month.month, 0).getDate()

  const byDate = new Map<string, { net_pnl: number; trade_count: number }>()
  for (const d of month.days) {
    byDate.set(d.date.slice(8, 10), { net_pnl: d.net_pnl, trade_count: d.trade_count })
  }

  const cells: ({ day: number; iso: string } | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${month.year}-${pad(month.month)}-${pad(d)}`
    cells.push({ day: d, iso })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm font-medium text-fg-primary">{monthName}</div>
        <button
          type="button"
          onClick={() => navigate('/calendar')}
          className="inline-flex cursor-pointer items-center gap-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-gold"
        >
          Open
          <ChevronRight size={12} strokeWidth={2.25} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] text-fg-muted">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="px-1 py-0.5 text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="aspect-square" />
          const dayKey = pad(cell.day)
          const stats = byDate.get(dayKey)
          const tone = !stats
            ? 'bg-bg-1 border-border-subtle text-fg-muted'
            : stats.net_pnl > 0
              ? 'bg-win-soft border-win/25 text-win'
              : stats.net_pnl < 0
                ? 'bg-loss-soft border-loss/25 text-loss'
                : 'bg-bg-2 border-border-subtle text-fg-tertiary'
          return (
            <div
              key={i}
              className={`flex aspect-square cursor-default flex-col items-start justify-between rounded-sm border px-1 py-0.5 transition-colors duration-150 hover:border-gold/40 ${tone}`}
              title={
                stats
                  ? `${cell.iso} · ${signed(stats.net_pnl)} · ${stats.trade_count} ${stats.trade_count === 1 ? 'trade' : 'trades'}`
                  : cell.iso
              }
            >
              <span className="font-mono text-[10px] leading-none">{cell.day}</span>
              {stats && (
                <span className="w-full truncate text-right font-mono text-[10px] leading-none tnum">
                  {compact(stats.net_pnl)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function compact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`
  return `${sign}${Math.round(abs)}`
}
