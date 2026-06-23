import type { CalendarMonthStats, CalendarRange } from '@shared/calendar-types'
import { money, int, signed, pnlClass } from '@/lib/format'

interface CalendarHeaderProps {
  stats: CalendarMonthStats
  range: CalendarRange
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  isCurrentMonth: boolean
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function ymKey(y: number, m: number): string {
  return `${y}-${m < 10 ? '0' + m : m}`
}

export default function CalendarHeader({
  stats,
  range,
  onPrev,
  onNext,
  onToday,
  isCurrentMonth,
}: CalendarHeaderProps) {
  const currentKey = ymKey(stats.year, stats.month)
  // Disable nav arrows past the trade-range boundaries so we can't wander
  // through endless empty months. Always allow stepping inside the range.
  const canPrev = !range.earliest || currentKey > range.earliest.slice(0, 7)
  const canNext = !range.latest || currentKey < range.latest.slice(0, 7)

  return (
    <div className="card-premium card-accent overflow-hidden rounded-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev}
            aria-label="Previous month"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-30"
          >
            ‹
          </button>
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-fg-primary">
              {MONTH_NAMES[stats.month - 1]}{' '}
              <span className="text-fg-secondary tnum">{stats.year}</span>
            </h2>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={onToday}
                className="text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors hover:text-gold"
              >
                today
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            aria-label="Next month"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-30"
          >
            ›
          </button>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-xs">
          <Stat label="Net" value={signed(stats.net_pnl)} className={pnlClass(stats.net_pnl)} hero />
          <Stat label="Fees" value={money(stats.total_fees)} className="text-fg-secondary" />
          <Stat label="Trading days" value={int(stats.trading_days)} className="text-fg-secondary" />
          <Stat label="Trades" value={int(stats.trade_count)} className="text-fg-secondary" />
          <Stat
            label="W/L"
            value={
              <>
                <span className="text-win">{int(stats.winners)}</span>
                <span className="text-fg-tertiary">/</span>
                <span className="text-loss">{int(stats.losers)}</span>
              </>
            }
            className="text-fg-primary"
          />
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  className,
  hero,
}: {
  label: string
  value: React.ReactNode
  className?: string
  hero?: boolean
}) {
  return (
    <span>
      <span className="text-fg-tertiary">{label}</span>{' '}
      <span className={`tnum ${hero ? 'text-base font-semibold' : ''} ${className ?? ''}`}>
        {value}
      </span>
    </span>
  )
}
