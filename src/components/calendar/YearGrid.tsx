import type { CalendarYear, CalendarYearMonth } from '@shared/calendar-types'
import { signed, int, percent, pnlClass } from '@/lib/format'
import Skeleton from '@/components/ui/Skeleton'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface YearGridProps {
  year: number
  /** null while the year roll-up is loading. */
  data: CalendarYear | null
  /** Real-world now, so the current month is badged when the year matches. */
  realNow: { y: number; m: number }
  /** Click a month tile -> open that month (the caller flips back to month view). */
  onSelectMonth: (month: number) => void
  /** Step the displayed year (the caller re-fetches via the [yearView] effect). */
  onPrevYear: () => void
  onNextYear: () => void
}

// v0.3.0 Yearly View Beat 2 — the monthly calendar "zoomed out": twelve premium
// month-tiles (Jan top-left -> Dec bottom-right). Each traded tile mirrors the
// day cell's hierarchy — Net P&L green/red hero, then [gold win%] · [green/red
// W/L] · [gold P/L ratio] — with the trade count top-right like the cell. A
// bounded ‹ year › stepper (mirroring the month header) flanks the annual header,
// disabled at the data's first/last year. The app aurora is dimmed in year mode
// at source (index.css body.cal-year-view), so this is just floating tiles on the
// calm base. Pure UI over getCalendarYear — no aggregation here.
export default function YearGrid({
  year,
  data,
  realNow,
  onSelectMonth,
  onPrevYear,
  onNextYear,
}: YearGridProps) {
  if (!data) return <YearSkeleton />
  return (
    <YearBody
      year={year}
      data={data}
      realNow={realNow}
      onSelectMonth={onSelectMonth}
      onPrevYear={onPrevYear}
      onNextYear={onNextYear}
    />
  )
}

function YearSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-[260px]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px]" />
        ))}
      </div>
    </div>
  )
}

function YearBody({
  year,
  data,
  realNow,
  onSelectMonth,
  onPrevYear,
  onNextYear,
}: {
  year: number
  data: CalendarYear
  realNow: { y: number; m: number }
  onSelectMonth: (month: number) => void
  onPrevYear: () => void
  onNextYear: () => void
}) {
  // All header stats are rolled up CLIENT-SIDE over the 12 already-fetched
  // months — no backend, no new data. Annual win% reuses the day cell's
  // derivation EXACTLY: total winners / (total winners + total losers),
  // scratch-excluded, null when nothing is decided.
  let net = 0
  let trades = 0
  let winners = 0
  let losers = 0
  let greenMonths = 0
  let redMonths = 0
  let best: CalendarYearMonth | null = null
  let worst: CalendarYearMonth | null = null
  for (const m of data.months) {
    net += m.net_pnl
    trades += m.trade_count
    winners += m.winners
    losers += m.losers
    if (m.trade_count > 0) {
      if (m.net_pnl > 0) greenMonths += 1
      else if (m.net_pnl < 0) redMonths += 1
      if (!best || m.net_pnl > best.net_pnl) best = m
      if (!worst || m.net_pnl < worst.net_pnl) worst = m
    }
  }
  const decided = winners + losers
  const winRate = decided > 0 ? winners / decided : null

  // Bounded year nav — mirrors CalendarHeader's earliest/latest compare, at year
  // granularity. range.earliest/latest are 'YYYY-MM-DD' | null. Disable PREV at
  // the earliest data year, NEXT at the latest. Unlike the month header (which
  // enables when the bound is null), the year stepper DISABLES on a null bound:
  // a null range (no data) or a single data year -> both arrows disabled, so the
  // user only ever steps across years that actually have trades.
  const earliestYear = data.range.earliest ? Number(data.range.earliest.slice(0, 4)) : null
  const latestYear = data.range.latest ? Number(data.range.latest.slice(0, 4)) : null
  const canPrev = earliestYear != null && year > earliestYear
  const canNext = latestYear != null && year < latestYear

  return (
    <div className="space-y-4">
      <div className="space-y-1.5 px-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onPrevYear}
              disabled={!canPrev}
              aria-label="Previous year"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-30"
            >
              ‹
            </button>
            <h2 className="text-xl font-semibold tracking-tight text-fg-primary tabular-nums">{year}</h2>
            <button
              type="button"
              onClick={onNextYear}
              disabled={!canNext}
              aria-label="Next year"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-30"
            >
              ›
            </button>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-sm tabular-nums">
            <span>
              <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                Net
              </span>
              <span className={`font-semibold ${pnlClass(net)}`}>{signed(net)}</span>
            </span>
            <span className="text-fg-tertiary">{int(trades)} trades</span>
            {winRate != null && (
              <span>
                <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                  Win
                </span>
                <span className="font-semibold text-gold">{percent(winRate, 0)}</span>
              </span>
            )}
          </div>
        </div>
        {best && worst && (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-fg-tertiary">
            <span>
              <span className="text-win">{int(greenMonths)} green</span>
              <span className="mx-1 text-fg-muted">·</span>
              <span className="text-loss">{int(redMonths)} red</span>
            </span>
            <span>
              best <span className="text-fg-secondary">{MONTHS[best.month - 1]}</span>{' '}
              <span className={pnlClass(best.net_pnl)}>{signed(best.net_pnl)}</span>
            </span>
            <span>
              worst <span className="text-fg-secondary">{MONTHS[worst.month - 1]}</span>{' '}
              <span className={pnlClass(worst.net_pnl)}>{signed(worst.net_pnl)}</span>
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.months.map((m, i) => (
          <MonthTile
            key={m.month}
            label={MONTHS[i]}
            month={m}
            isCurrent={year === realNow.y && m.month === realNow.m}
            onClick={() => onSelectMonth(m.month)}
          />
        ))}
      </div>
    </div>
  )
}

function MonthTile({
  label,
  month,
  isCurrent,
  onClick,
}: {
  label: string
  month: CalendarYearMonth
  isCurrent: boolean
  onClick: () => void
}) {
  const traded = month.trade_count > 0
  const pnl = month.net_pnl
  // Win% + P/L ratio mirror the day cell (CalendarGrid) EXACTLY: win% =
  // winners/(winners+losers) scratch-excluded (null when none decided); P/L
  // ratio = avg_winner/|avg_loser| (null when no winners, no losers, or
  // avg_loser is 0). Both tokens are OMITTED when null — never a fabricated
  // number — same as the cell's stat line.
  const decided = month.winners + month.losers
  const winRate = decided > 0 ? month.winners / decided : null
  const plRatio =
    month.avg_winner != null && month.avg_loser != null && month.avg_loser !== 0
      ? month.avg_winner / Math.abs(month.avg_loser)
      : null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} ${month.year} — ${traded ? signed(pnl) : 'no trades'}`}
      className={`card-premium group flex min-h-[104px] cursor-pointer flex-col rounded-lg p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-gold/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
        isCurrent ? 'card-accent ring-1 ring-gold/40' : ''
      } ${traded ? '' : 'opacity-60'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{label}</span>
        <div className="flex items-center gap-1.5">
          {traded && (
            <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-fg-tertiary tabular-nums">
              {int(month.trade_count)}t
            </span>
          )}
          {isCurrent && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-gold">now</span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center">
        {traded ? (
          <>
            <span className={`font-mono text-xl font-bold leading-none tabular-nums ${pnlClass(pnl)}`}>
              {signed(pnl)}
            </span>
            <div className="mt-1.5 flex items-center justify-center gap-1 font-mono text-[11px] font-medium leading-none tabular-nums">
              {winRate != null && (
                <>
                  <span className="text-gold">{percent(winRate, 0)}</span>
                  <span className="text-fg-muted">·</span>
                </>
              )}
              <span>
                <span className="text-win">{int(month.winners)}</span>
                <span className="text-fg-muted">/</span>
                <span className="text-loss">{int(month.losers)}</span>
              </span>
              {plRatio != null && (
                <>
                  <span className="text-fg-muted">·</span>
                  <span className="text-gold">{plRatio.toFixed(2)}</span>
                </>
              )}
            </div>
          </>
        ) : (
          <span className="font-mono text-xl font-semibold leading-none text-fg-muted">—</span>
        )}
      </div>
    </button>
  )
}
