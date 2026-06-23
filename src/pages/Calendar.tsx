import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CalendarDays, Upload } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Skeleton from '@/components/ui/Skeleton'
import CalendarHeader from '@/components/calendar/CalendarHeader'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import CalendarCompareStrip from '@/components/calendar/CalendarCompareStrip'
import YearGrid from '@/components/calendar/YearGrid'
import DayDetailModal from '@/components/calendar/DayDetailModal'
import WeekReviewModal from '@/components/calendar/WeekReviewModal'
import NoTradeDayModal from '@/components/calendar/NoTradeDayModal'
import { ipc } from '@/lib/ipc'
import type { CalendarMonth, CalendarYear } from '@shared/calendar-types'

function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function ym(date: Date): { y: number; m: number } {
  return { y: date.getFullYear(), m: date.getMonth() + 1 }
}

function stepMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const d = new Date(y, m - 1 + delta, 1)
  return { y: d.getFullYear(), m: d.getMonth() + 1 }
}

export default function Calendar() {
  const today = useMemo(todayISO, [])
  const realNow = useMemo(() => ym(new Date()), [])

  const [view, setView] = useState<{ y: number; m: number }>(realNow)
  const [data, setData] = useState<CalendarMonth | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null)
  // Clicking an empty in-month cell (no trades) opens the quick sit-out
  // modal instead of the full day-trades panel.
  const [noTradeDayDate, setNoTradeDayDate] = useState<string | null>(null)
  const [showWeekly, setShowWeekly] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('calendar.showWeekly') !== '0'
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('calendar.showWeekly', showWeekly ? '1' : '0')
    }
  }, [showWeekly])

  // v0.3.0 Yearly View Beat 2 — month-vs-year view mode, persisted exactly like
  // showWeekly. Default 'month'. The year grid (12 month tiles) is the calendar
  // zoomed out; flipping to Year zooms to the year of the month being viewed.
  const [calMode, setCalMode] = useState<'month' | 'year'>(() => {
    if (typeof window === 'undefined') return 'month'
    return window.localStorage.getItem('calendar.viewMode') === 'year' ? 'year' : 'month'
  })
  const [yearView, setYearView] = useState<number>(() => realNow.y)
  const [yearData, setYearData] = useState<CalendarYear | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('calendar.viewMode', calMode)
    }
  }, [calMode])

  // Fetch the year roll-up only while in Year mode; keyed on [yearView, calMode].
  // Mirrors the month fetch (cancelled guard, setState, errors surface to the
  // page). Beat 3 adds prev/next-year stepping; for now yearView is set on
  // toggle and stays put.
  useEffect(() => {
    if (calMode !== 'year') return
    let cancelled = false
    setYearData(null)
    ipc
      .calendarYearGet(yearView)
      .then((d) => {
        if (!cancelled) setYearData(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [yearView, calMode])

  // Scoped aurora calm: while the YEAR grid is showing, dim the app-wide aurora
  // (index.css `body.cal-year-view .app-aurora`) — it would otherwise streak
  // through the sparse 12-tile grid the way the month grid card never lets it.
  // The class is removed in month mode AND on unmount, so the month grid and
  // every other page stay pixel-identical.
  useEffect(() => {
    if (calMode !== 'year') return
    document.body.classList.add('cal-year-view')
    return () => document.body.classList.remove('cal-year-view')
  }, [calMode])

  // Fetch the month whenever the view changes. On first mount, also use the
  // payload's range to seed the view at the latest trade month if the user
  // hasn't traded the current real-world month yet.
  useEffect(() => {
    let cancelled = false
    setData(null)
    ipc
      .calendarGet(view.y, view.m)
      .then((d) => {
        if (cancelled) return
        if (!initialized) {
          setInitialized(true)
          // If current month has no trades but earlier months do, jump to the
          // latest traded month so the user lands on something meaningful.
          if (d.stats.trade_count === 0 && d.range.latest) {
            const [ly, lm] = d.range.latest.slice(0, 7).split('-').map(Number)
            if (ly !== view.y || lm !== view.m) {
              setView({ y: ly, m: lm })
              return
            }
          }
        }
        setData(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [view.y, view.m, initialized])

  // Clear selection when navigating to a different month.
  useEffect(() => {
    setSelectedDate(null)
  }, [view.y, view.m])

  // Cycle the day's sentiment through 1 → 2 → 3 → 4 → 5 → null. Saves
  // optimistically (local state first, then IPC) so the badge updates with
  // zero latency. If the IPC fails the next CalendarGet refresh corrects
  // the value silently — sentiment is non-critical journal-side data.
  const handleCycleSentiment = useCallback(
    (date: string, current: number | null) => {
      const next = current == null ? 1 : current >= 5 ? null : current + 1
      setData((prev) => {
        if (!prev) return prev
        const idx = prev.days.findIndex((d) => d.date === date)
        if (idx >= 0) {
          const days = [...prev.days]
          days[idx] = { ...days[idx], sentiment: next }
          return { ...prev, days }
        }
        // Day wasn't in the payload yet (no trades + no journal) — insert
        // a stub so the badge can render. CalendarGet will re-hydrate on
        // next month fetch.
        const stub = {
          date,
          net_pnl: 0,
          gross_pnl: 0,
          total_fees: 0,
          trade_count: 0,
          winners: 0,
          losers: 0,
          avg_winner: null,
          avg_loser: null,
          day_tags: [],
          has_journal: false,
          no_trade_day: false,
          is_holiday: false,
          sentiment: next,
        }
        return { ...prev, days: [...prev.days, stub] }
      })
      ipc.sessionSentimentSave({ date, sentiment: next }).catch(() => {
        // Silent — non-critical. Worst case the next month refresh corrects it.
      })
    },
    [],
  )


  if (err) {
    return (
      <PageShell title="Calendar" subtitle="Trading days at a glance.">
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary">
          <AlertCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-loss">
              Failed to load calendar
            </div>
            <div className="mt-1">{err}</div>
          </div>
        </div>
      </PageShell>
    )
  }

  if (!data) {
    return (
      <PageShell title="Calendar" subtitle="Trading days at a glance.">
        <Skeleton className="h-[60px]" />
        <div className="mt-4">
          <Skeleton className="h-[420px]" />
        </div>
      </PageShell>
    )
  }

  const hasAnyTrades = !!data.range.latest
  if (!hasAnyTrades) {
    return (
      <PageShell title="Calendar" subtitle="Trading days at a glance.">
        <div className="empty-grid rounded-lg border border-border-subtle bg-bg-2 px-6 py-16 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.06]">
            <CalendarDays size={36} strokeWidth={1.5} className="text-gold" />
          </div>
          <div className="text-lg font-semibold text-fg-primary">
            No trading days to plot yet.
          </div>
          <div className="mx-auto mt-2 max-w-md text-sm text-fg-tertiary">
            Import a Trades.csv and your P&amp;L will show up here as a monthly grid.
          </div>
          <Link
            to="/import"
            className="mt-6 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim"
          >
            <Upload size={14} strokeWidth={2.25} />
            Go to Import
          </Link>
        </div>
      </PageShell>
    )
  }

  const isCurrentMonth = view.y === realNow.y && view.m === realNow.m

  return (
    <PageShell
      title="Calendar"
      subtitle={calMode === 'year' ? 'Click a month to open it.' : 'Click a day to see its trades.'}
    >
      <div className="space-y-5">
        {/* Month | Year view toggle (always); the weekly-panels toggle is
            month-only. */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-0.5 rounded-md border border-border-subtle bg-bg-2 p-0.5">
            <ModeButton active={calMode === 'month'} onClick={() => setCalMode('month')}>
              Month
            </ModeButton>
            <ModeButton
              active={calMode === 'year'}
              onClick={() => {
                setYearView(view.y)
                setCalMode('year')
              }}
            >
              Year
            </ModeButton>
          </div>
          {calMode === 'month' && (
            <button
              type="button"
              onClick={() => setShowWeekly((v) => !v)}
              className={`inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-[10px] font-semibold uppercase tracking-wider shadow-sm transition-colors duration-150 ${
                showWeekly
                  ? 'border-gold/60 bg-gold/[0.12] text-gold'
                  : 'border-border-strong bg-bg-1 text-fg-secondary hover:border-gold/50 hover:text-gold'
              }`}
              aria-pressed={showWeekly}
              title="Show weekly summary cards on the right edge of each row"
            >
              Weekly panels: {showWeekly ? 'on' : 'off'}
            </button>
          )}
        </div>

        {calMode === 'month' ? (
          <>
            <CalendarHeader
              stats={data.stats}
              range={data.range}
              onPrev={() => setView(stepMonth(view.y, view.m, -1))}
              onNext={() => setView(stepMonth(view.y, view.m, 1))}
              onToday={() => setView(realNow)}
              isCurrentMonth={isCurrentMonth}
            />

            <CalendarCompareStrip />

            <CalendarGrid
              year={data.stats.year}
              month={data.stats.month}
              days={data.days}
              weeks={data.weeks ?? []}
              selectedDate={selectedDate}
              todayDate={today}
              showWeekly={showWeekly}
              onSelectDate={(date) => {
                if (date === null) {
                  setSelectedDate(null)
                  return
                }
                // Empty cells (no trades) get the quick sit-out modal. Cells with
                // trades open the existing day panel.
                const day = data.days.find((d) => d.date === date)
                if (!day || day.trade_count === 0) {
                  setNoTradeDayDate(date)
                } else {
                  setSelectedDate(date)
                }
              }}
              onSelectWeek={(w) => setSelectedWeek(w.week_start)}
              onCycleSentiment={handleCycleSentiment}
            />
          </>
        ) : (
          <YearGrid
            year={yearView}
            data={yearData}
            realNow={realNow}
            onSelectMonth={(m) => {
              setView({ y: yearView, m })
              setCalMode('month')
            }}
            onPrevYear={() => setYearView((y) => y - 1)}
            onNextYear={() => setYearView((y) => y + 1)}
          />
        )}

        {noTradeDayDate && (
          <NoTradeDayModal
            date={noTradeDayDate}
            onClose={() => setNoTradeDayDate(null)}
            onSaved={() => {
              // Re-fetch the month so the cell picks up the new journal mark
              // and the pencil icon appears immediately.
              ipc
                .calendarGet(view.y, view.m)
                .then((d) => setData(d))
                .catch((e: Error) => setErr(e.message))
            }}
          />
        )}

        <WeekReviewModal
          weekStart={selectedWeek}
          onClose={() => setSelectedWeek(null)}
        />

        <DayDetailModal
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
        />
      </div>
    </PageShell>
  )
}

// Segmented Month | Year control — mirrors the app's gold-tinted active-segment
// language (cf. WeekTradesTab's view toggle).
function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-[5px] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
        active ? 'bg-gold/[0.14] text-gold' : 'text-fg-tertiary hover:text-fg-secondary'
      }`}
    >
      {children}
    </button>
  )
}
