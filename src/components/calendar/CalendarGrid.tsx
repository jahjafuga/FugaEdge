import { CalendarOff, Pencil } from 'lucide-react'
import type { CalendarDay, WeeklySummary } from '@shared/calendar-types'
import { SENTIMENT_LABELS } from '@shared/session-types'
import { int, money, percent, signed } from '@/lib/format'
import { colorForTag } from '@/lib/tagColor'
import { marketHolidayName } from '@/core/market/holidays'
import { SENTIMENT_ICONS } from '@/components/sentiment/SentimentIconPicker'
import Tooltip from '@/components/ui/Tooltip'
import closedSign from '@/assets/closed-sign.svg'
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
    <div className="card-accent overflow-hidden rounded-lg border border-border-subtle bg-bg-2 shadow-[var(--card-elevation)]">
      {/* Header row: weekday labels + (optional) "Week" label */}
      <div className="flex border-b border-border bg-bg-2">
        <div className="grid flex-1 grid-cols-7 font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-fg-tertiary">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center">
              {w}
            </div>
          ))}
        </div>
        {showWeekly && (
          <div
            className="flex items-center justify-center border-l border-border px-2 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gold"
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
                  // Dave #18 — the grid card is overflow-hidden (:101), so the
                  // rubric tooltip is steered by grid position: last row opens
                  // upward, edge columns anchor inward. Static, per-cell.
                  sentimentTooltipSide={idx === rows.length - 1 ? 'top' : 'bottom'}
                  sentimentTooltipAlign={i >= 5 ? 'end' : i <= 1 ? 'start' : 'center'}
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
  sentimentTooltipSide,
  sentimentTooltipAlign,
}: {
  cell: Cell
  stats: CalendarDay | undefined
  isToday: boolean
  isSelected: boolean
  onClick: () => void
  onCycleSentiment: (date: string, currentSentiment: number | null) => void
  sentimentTooltipSide: 'top' | 'bottom'
  sentimentTooltipAlign: 'start' | 'center' | 'end'
}) {
  const has = !!stats && stats.trade_count > 0
  const tags = stats?.day_tags ?? []
  const pnl = stats?.net_pnl ?? 0
  const hasJournal = !!stats?.has_journal
  const noTrade = !!stats?.no_trade_day
  // Auto market-holiday: the computed NYSE full-closure schedule (pure, offline)
  // ORs onto the manual journal-derived is_holiday, so the closed sign shows on
  // every market holiday WITHOUT the user marking a sit-out. Traded days still
  // win — the hero below stays mutually exclusive (has ? P&L : isHoliday ? closed).
  const computedHolidayName = cell.inMonth ? marketHolidayName(cell.date) : null
  const isHoliday = !!stats?.is_holiday || computedHolidayName !== null
  const sentiment = stats?.sentiment ?? null
  // On a holiday cell the centered closed sign + "MARKET CLOSED" already convey
  // the sit-out, so drop the redundant no-trade-day dot from the corner cluster
  // (any other tags the user added to the day still show). Non-holiday cells
  // keep their tags unchanged.
  const cornerTags = isHoliday ? tags.filter((t) => t !== 'no-trade-day') : tags
  // Win % from DECIDED trades only (winners + losers, excluding scratches); null
  // when there are no decided trades so the cell never shows 0% / NaN.
  const decided = (stats?.winners ?? 0) + (stats?.losers ?? 0)
  const winRate = decided > 0 ? stats!.winners / decided : null
  // Per-day P/L ratio = avg winner / |avg loser|, matching winLossRatio in
  // src/core/performance/metrics.ts EXACTLY (null when no winners, no losers, or
  // avg_loser is 0 - the slot then just omits, never a fabricated number).
  const avgWinner = stats?.avg_winner ?? null
  const avgLoser = stats?.avg_loser ?? null
  const plRatio =
    avgWinner != null && avgLoser != null && avgLoser !== 0
      ? avgWinner / Math.abs(avgLoser)
      : null

  // Premium day-cell treatment (calendar redesign, chunk 1). The wash + lift
  // live on the CELL itself (the button), filling it edge-to-edge within the 1px
  // grid lines - there is no inner floating box. A traded day's whole cell takes
  // the win/loss tint (pushed past the old /10 so the month's green/red rhythm
  // scans) plus a faint inset top-highlight for depth; empty / no-trade /
  // holiday / out-of-month days stay on the quiet recessed base, so filled tiles
  // read against flat empty slots. Light mode swaps the dark alpha wash for the
  // green-50 / red-50 fills (the inset highlight is dark-only).
  const cellTone = !cell.inMonth
    ? 'bg-bg-1/40'
    : !has
      ? 'bg-bg-1 hover:bg-bg-2/60'
      : pnl > 0
        ? 'bg-win/[0.16] hover:bg-win/[0.22] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] [.light_&]:bg-[#f0fdf4] [.light_&]:hover:bg-[#dcfce7] [.light_&]:shadow-none'
        : pnl < 0
          ? 'bg-loss/[0.16] hover:bg-loss/[0.22] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] [.light_&]:bg-[#fef2f2] [.light_&]:hover:bg-[#fee2e2] [.light_&]:shadow-none'
          : 'bg-bg-2 hover:bg-bg-2/80'

  const selectedRing = isSelected
    ? 'ring-2 ring-gold ring-offset-2 ring-offset-bg-0 z-10 relative'
    : ''

  // v0.1.5: keep the cell visually clean, surface fees in the hover
  // tooltip so the user can still see the cost drag without crowding the
  // tile with another number.
  const title = has && stats
    ? `${cell.date} · Gross ${signed(stats.gross_pnl)} · Fees ${money(stats.total_fees)} · Net ${signed(stats.net_pnl)}`
    : undefined

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!cell.inMonth}
      title={title}
      className={`group flex min-h-[110px] flex-col border-b border-r border-border p-2.5 text-left transition-colors duration-150 ${cellTone} ${
        cell.inMonth ? 'cursor-pointer' : 'cursor-default'
      } ${selectedRing}`}
    >
      <div className="flex w-full items-start justify-between gap-1">
        <span
          className={`font-mono text-sm font-medium leading-none ${
            isToday
              ? 'rounded-md bg-gold px-1.5 py-0.5 text-accent-ink'
              : cell.inMonth
                ? 'text-fg-secondary'
                : 'text-fg-muted'
          }`}
        >
          {cell.day}
        </span>
        <div className="flex items-center gap-1">
          {noTrade && !isHoliday && cell.inMonth && (
            <span
              aria-label="No-trade day"
              title="No-trade day"
              // Muted gold per the v0.1.3 spec - distinct from the win/loss
              // tile tints and the active sentiment / tag dots. Holiday
              // sit-outs show their closed sign centered in the body instead,
              // so they intentionally have no corner icon here.
              style={{ color: 'rgba(212, 175, 55, 0.6)' }}
              className="inline-flex h-[14px] w-[14px] items-center justify-center"
            >
              <CalendarOff size={12} strokeWidth={2} />
            </span>
          )}
          {cornerTags.length > 0 && <TagDots tags={cornerTags} />}
          {hasJournal && !has && !noTrade && (
            <span
              aria-label="Journal entry"
              title="Journal entry on this day"
              className="inline-flex items-center text-gold"
            >
              <Pencil size={10} strokeWidth={2} />
            </span>
          )}
          {has && (
            <span className="text-[11px] font-medium uppercase tracking-wider text-fg-tertiary">
              {stats!.trade_count}t
            </span>
          )}
          {cell.inMonth && (
            <SentimentBadge
              value={sentiment}
              tooltipSide={sentimentTooltipSide}
              tooltipAlign={sentimentTooltipAlign}
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

      {/* Center hero (shared slot). w-full + flex-col + items-center so this
          container OWNS the full cell width and centers its children on both
          axes - a bare items-center on a shrink-wrapped row wrapper was
          left-hugging because nothing forced full width. Traded -> P&L + one
          stat line; holiday -> the 65px closed sign; empty -> nothing. The
          three are mutually exclusive so exactly one renders. */}
      <div className="flex w-full flex-1 flex-col items-center justify-center text-center">
        {has ? (
          <>
            <span
              className={`font-mono text-2xl font-bold leading-none tabular-nums ${
                pnl > 0 ? 'text-win' : pnl < 0 ? 'text-loss' : 'text-fg-primary'
              }`}
            >
              {signed(pnl)}
            </span>
            {/* One stat line under the P&L, built from colored SPANS so each
                piece tints on its own: win% in gold, then W/L with winners
                green / losers red. winRate is null-guarded (no decided trades
                -> just the colored W/L, never 0% / NaN). */}
            <div className="mt-1.5 flex items-center justify-center gap-1 font-mono text-[11px] font-medium leading-none tabular-nums">
              {winRate != null && (
                <>
                  <span className="text-gold">{percent(winRate, 0)}</span>
                  <span className="text-fg-muted">·</span>
                </>
              )}
              <span>
                <span className="text-win">{int(stats!.winners)}</span>
                <span className="text-fg-muted">/</span>
                <span className="text-loss">{int(stats!.losers)}</span>
              </span>
              {/* P/L ratio (gold) - avg winner / |avg loser|, rendered only when
                  real (plRatio null -> token omitted, line stays win% + W/L).
                  2 decimals, matching CalendarCompareStrip's fmtRatio. */}
              {plRatio != null && (
                <>
                  <span className="text-fg-muted">·</span>
                  <span className="text-gold">{plRatio.toFixed(2)}</span>
                </>
              )}
            </div>
          </>
        ) : isHoliday && cell.inMonth ? (
          <img
            src={closedSign}
            alt="Market holiday"
            title={computedHolidayName ? `${computedHolidayName} (market closed)` : 'Holiday (market closed)'}
            className="h-[65px] w-[65px]"
          />
        ) : null}
      </div>

      {/* Bottom label: holiday -> MARKET CLOSED centered under the sign;
          other no-trade / tagged days -> the day's tag (bottom-right, as
          before). Traded days leave this empty - the hero is the result. */}
      {isHoliday && cell.inMonth ? (
        <div className="flex w-full justify-center text-[9px] uppercase tracking-wider text-fg-tertiary">
          Market closed
        </div>
      ) : !has && tags.length > 0 && cell.inMonth ? (
        <div className="flex w-full justify-end text-[9px] uppercase tracking-wider text-fg-tertiary">
          {tags[0]}
          {tags.length > 1 ? ` +${tags.length - 1}` : ''}
        </div>
      ) : null}
    </button>
  )
}

// Small click-to-cycle market-sentiment badge in the day cell's top-right
// cluster — the fire/ice icon for the day's level (shared SENTIMENT_ICONS, the
// same art as the dashboard + journal pickers), rendered ICON-ALONE at 18px.
// No colored circle / green→red tone: the icon carries the meaning, so the
// calendar never inherits the fire-ladder's red=hot vs the app's red=loss
// clash. Null → a muted '–' so the click-to-set affordance stays discoverable.
//
// Rendered as a span (not a button) because the outer DayCell is already
// a <button>, and nested buttons are invalid HTML. role + tabIndex give
// reasonable a11y; sentiment can also be set from the Journal page.
function SentimentBadge({
  value,
  onCycle,
  tooltipSide,
  tooltipAlign,
}: {
  value: number | null
  onCycle: (e: React.MouseEvent) => void
  tooltipSide: 'top' | 'bottom'
  tooltipAlign: 'start' | 'center' | 'end'
}) {
  const action = value
    ? `Sentiment ${value}/5 — click to cycle`
    : 'Click to set market sentiment (1–5)'
  return (
    // Dave #18 — the bare native title becomes the house Tooltip: the honest
    // action line + the five-row rubric rendered FROM SENTIMENT_LABELS (the
    // canon — never duplicated strings), ladder order matching the pickers.
    <Tooltip
      side={tooltipSide}
      align={tooltipAlign}
      content={
        // min-w keeps each rubric row on a single line (the tooltip surface
        // otherwise shrink-wraps and wraps '0 stocks >50%' over three lines).
        <span className="flex min-w-[200px] flex-col gap-1.5">
          <span className="font-medium">{action}</span>
          <span className="flex flex-col gap-0.5">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <span key={n} className="flex items-baseline justify-between gap-3">
                <span className="font-mono tnum whitespace-nowrap">{n}/5</span>
                <span className="whitespace-nowrap text-right">{SENTIMENT_LABELS[n]}</span>
              </span>
            ))}
          </span>
        </span>
      }
    >
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
        // Empty title on purpose: it suppresses the DayCell button's own
        // gross/fees/net native title from doubling over the Tooltip while
        // showing no native tooltip itself.
        title=""
        aria-label={action}
        className="inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center transition-opacity duration-150 hover:opacity-80"
      >
        {value ? (
          <img
            src={SENTIMENT_ICONS[value as 1 | 2 | 3 | 4 | 5]}
            alt=""
            aria-hidden="true"
            className="h-[18px] w-[18px]"
          />
        ) : (
          <span className="font-mono text-[11px] font-semibold leading-none text-fg-muted">–</span>
        )}
      </span>
    </Tooltip>
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
