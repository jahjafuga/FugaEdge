import { CalendarOff } from 'lucide-react'
import type { CalendarDay, WeeklySummary } from '@shared/calendar-types'
import { int, signed } from '@/lib/format'
import { colorForTag } from '@/lib/tagColor'
import WeeklyPanel from './WeeklyPanel'

interface CalendarGridProps {
  year: number
  month: number          // 1..12
  days: CalendarDay[]
  weeks: WeeklySummary[]
  selectedDate: string | null
  todayDate: string      // YYYY-MM-DD
  showWeekly: boolean
  onSelectDate: (date: string | null) => void
  onSelectWeek: (summary: WeeklySummary) => void
  /** Cycle the day's sentiment 1→2→3→4→5→null. Called when the badge is
   *  clicked; click is contained (doesn't bubble up to onSelectDate). */
  onCycleSentiment: (date: string, currentSentiment: number | null) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PANEL_WIDTH = 200

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

interface Cell {
  date: string         // YYYY-MM-DD
  day: number          // 1..31
  inMonth: boolean
}

function buildCells(year: number, month: number): Cell[] {
  const first = new Date(year, month - 1, 1)
  const lead = first.getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const daysInPrev = new Date(year, month - 1, 0).getDate()

  const cells: Cell[] = []

  for (let i = lead - 1; i >= 0; i--) {
    const d = daysInPrev - i
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    cells.push({
      date: `${prevYear}-${pad(prevMonth)}-${pad(d)}`,
      day: d,
      inMonth: false,
    })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: `${year}-${pad(month)}-${pad(d)}`,
      day: d,
      inMonth: true,
    })
  }

  while (cells.length < 42) {
    const offset = cells.length - lead - daysInMonth + 1
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    cells.push({
      date: `${nextYear}-${pad(nextMonth)}-${pad(offset)}`,
      day: offset,
      inMonth: false,
    })
  }

  return cells
}

export default function CalendarGrid({
  year,
  month,
  days,
  weeks,
  selectedDate,
  todayDate,
  showWeekly,
  onSelectDate,
  onSelectWeek,
  onCycleSentiment,
}: CalendarGridProps) {
  const cells = buildCells(year, month)
  const byDate = new Map<string, CalendarDay>()
  for (const d of days) byDate.set(d.date, d)

  // Split into 6 rows of 7 day-cells so each row can be paired with a
  // weekly panel. Falls back gracefully if `weeks` is missing/shorter.
  const rows: Cell[][] = []
  for (let r = 0; r < 6; r++) rows.push(cells.slice(r * 7, r * 7 + 7))

  return (
    <div className="overflow-hidden rounded-md border border-border-subtle bg-bg-2">
      {/* Header row: weekday labels + (optional) "Week" label */}
      <div className="flex border-b border-border-subtle/60">
        <div className="grid flex-1 grid-cols-7 text-[10px] uppercase tracking-widest text-fg-tertiary">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center font-mono">
              {w}
            </div>
          ))}
        </div>
        {showWeekly && (
          <div
            className="flex items-center justify-center border-l border-border-subtle/60 px-2 py-2 font-mono text-[10px] uppercase tracking-widest text-gold"
            style={{ width: PANEL_WIDTH }}
          >
            Week
          </div>
        )}
      </div>

      {/* 6 week rows. min-h on both the row flex container AND the inner
          grid so empty weeks (no trade data) still occupy a normal-height
          row instead of collapsing to a thin sliver. */}
      {rows.map((row, idx) => {
        const summary = weeks[idx]
        return (
          <div key={idx} className="flex min-h-[110px]">
            <div className="grid min-h-[110px] flex-1 grid-cols-7">
              {row.map((c, i) => (
                <DayCell
                  key={i}
                  cell={c}
                  stats={byDate.get(c.date)}
                  isToday={c.date === todayDate}
                  isSelected={c.date === selectedDate}
                  onClick={() => {
                    if (!c.inMonth) return
                    onSelectDate(c.date === selectedDate ? null : c.date)
                  }}
                  onCycleSentiment={onCycleSentiment}
                />
              ))}
            </div>
            {showWeekly && summary && (
              <div style={{ width: PANEL_WIDTH }}>
                <WeeklyPanel summary={summary} onClick={() => onSelectWeek(summary)} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DayCell({
  cell,
  stats,
  isToday,
  isSelected,
  onClick,
  onCycleSentiment,
}: {
  cell: Cell
  stats: CalendarDay | undefined
  isToday: boolean
  isSelected: boolean
  onClick: () => void
  onCycleSentiment: (date: string, currentSentiment: number | null) => void
}) {
  const has = !!stats && stats.trade_count > 0
  const tags = stats?.day_tags ?? []
  const pnl = stats?.net_pnl ?? 0
  const hasJournal = !!stats?.has_journal
  const noTrade = !!stats?.no_trade_day
  const sentiment = stats?.sentiment ?? null

  // Each cell sits on a bg-1 base (white in light mode, ~black in dark)
  // with 1px bottom+right borders forming a single 1px grid (the
  // table-cell pattern avoids the 2px doubling that full borders would
  // cause between adjacent cells). Border color is --border (stronger
  // than --border-subtle) so the grid reads cleanly on white in light
  // mode. Win/loss tints layer on top.
  // Subtle tints for win/loss days. Light mode uses green-50 / red-50 hexes
  // per the design spec; dark mode keeps the win/loss soft alpha overlays.
  const baseTone = !cell.inMonth
    ? 'bg-bg-1/40 text-fg-tertiary'
    : !has
      ? 'bg-bg-1 text-fg-tertiary hover:bg-bg-2'
      : pnl > 0
        ? 'bg-win/10 hover:bg-win/15 [.light_&]:bg-[#f0fdf4] [.light_&]:hover:bg-[#dcfce7]'
        : pnl < 0
          ? 'bg-loss/10 hover:bg-loss/15 [.light_&]:bg-[#fef2f2] [.light_&]:hover:bg-[#fee2e2]'
          : 'bg-bg-1 hover:bg-bg-2'

  const selectedRing = isSelected
    ? 'ring-2 ring-gold ring-offset-2 ring-offset-bg-0 z-10 relative'
    : ''

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!cell.inMonth}
      className={`flex min-h-[110px] flex-col items-stretch justify-between border-b border-r border-border-strong p-2.5 text-left transition-colors duration-150 ${baseTone} ${selectedRing} ${
        cell.inMonth ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span
          className={`font-mono text-base font-medium leading-none ${
            isToday ? 'rounded-sm bg-gold px-1.5 py-0.5 text-accent-ink' : ''
          }`}
        >
          {cell.day}
        </span>
        <div className="flex items-center gap-1">
          {noTrade && cell.inMonth && (
            <span
              aria-label="No-trade day"
              title="No-trade day"
              // Muted gold per the v0.1.3 spec — distinct from the win/loss
              // tile tints and the active sentiment / tag dots. Renders
              // inline so cell layout stays unchanged on trading days.
              style={{ color: 'rgba(212, 175, 55, 0.6)' }}
              className="inline-flex h-[14px] w-[14px] items-center justify-center"
            >
              <CalendarOff size={12} strokeWidth={2} />
            </span>
          )}
          {tags.length > 0 && <TagDots tags={tags} />}
          {hasJournal && !has && !noTrade && (
            <span
              aria-label="Journal entry"
              title="Journal entry on this day"
              className="font-mono text-[10px] leading-none text-gold"
            >
              ✎
            </span>
          )}
          {has && (
            <span className="font-mono text-[12px] font-medium uppercase tracking-widest text-fg-tertiary">
              {stats!.trade_count}t
            </span>
          )}
          {cell.inMonth && (
            <SentimentBadge
              value={sentiment}
              onCycle={(e) => {
                // Contain the click so it doesn't bubble up to the cell's
                // outer button (which selects the day or opens no-trade
                // modal). The badge is its own click target.
                e.stopPropagation()
                onCycleSentiment(cell.date, sentiment)
              }}
            />
          )}
        </div>
      </div>

      {has ? (
        <div className="flex flex-col items-end justify-end gap-0.5">
          <span
            className={`font-mono text-[18px] font-semibold leading-tight ${
              pnl > 0 ? 'text-win' : pnl < 0 ? 'text-loss' : 'text-fg-primary'
            }`}
          >
            {signed(pnl)}
          </span>
          <span className="font-mono text-[10px] text-fg-tertiary">
            <span className="text-win">{int(stats!.winners)}</span>
            <span className="text-fg-tertiary">/</span>
            <span className="text-loss">{int(stats!.losers)}</span>
          </span>
        </div>
      ) : tags.length > 0 && cell.inMonth ? (
        <div className="flex justify-end font-mono text-[9px] uppercase tracking-widest text-fg-tertiary">
          {tags[0]}
          {tags.length > 1 ? ` +${tags.length - 1}` : ''}
        </div>
      ) : null}
    </button>
  )
}

// Small click-to-cycle market-sentiment badge that lives in the day cell's
// top-right cluster. Visual encoding per the spec:
//   1 = best market (3+ runners >100%) → bright win green
//   2 = great                            → win green (slightly muted)
//   3 = OK                               → gold
//   4 = weak                             → loss red (muted)
//   5 = worst (no runners >50%)          → loss red
// Null → dim placeholder so the affordance is discoverable.
//
// Rendered as a span (not a button) because the outer DayCell is already
// a <button>, and nested buttons are invalid HTML. role + tabIndex give
// reasonable a11y; sentiment can also be set from the Journal page.
function SentimentBadge({
  value,
  onCycle,
}: {
  value: number | null
  onCycle: (e: React.MouseEvent) => void
}) {
  const tone =
    value === 1
      ? 'border-win/60 bg-win/20 text-win'
      : value === 2
        ? 'border-win/40 bg-win/12 text-win'
        : value === 3
          ? 'border-gold/50 bg-gold/15 text-gold'
          : value === 4
            ? 'border-loss/40 bg-loss/12 text-loss'
            : value === 5
              ? 'border-loss/60 bg-loss/20 text-loss'
              : 'border-border-subtle bg-bg-3 text-fg-muted'
  const display = value ?? '–'
  const title = value
    ? `Sentiment ${value}/5 — click to cycle`
    : 'Click to set market sentiment (1–5)'
  return (
    <span
      role="button"
      tabIndex={-1}
      onClick={onCycle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation()
          e.preventDefault()
          onCycle(e as unknown as React.MouseEvent)
        }
      }}
      title={title}
      aria-label={title}
      className={`inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full border font-mono text-[10px] font-semibold leading-none transition-colors duration-150 hover:brightness-110 ${tone}`}
    >
      {display}
    </span>
  )
}

function TagDots({ tags }: { tags: string[] }) {
  const visible = tags.slice(0, 4)
  const extra = tags.length - visible.length
  return (
    <div
      className="flex items-center gap-0.5"
      title={tags.join(' · ')}
    >
      {visible.map((tag) => (
        <span
          key={tag}
          aria-label={tag}
          className="block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: colorForTag(tag) }}
        />
      ))}
      {extra > 0 && (
        <span className="font-mono text-[8px] leading-none text-fg-tertiary">+{extra}</span>
      )}
    </div>
  )
}
