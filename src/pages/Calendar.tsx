import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CalendarDays, Upload } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Skeleton from '@/components/ui/Skeleton'
import CalendarHeader from '@/components/calendar/CalendarHeader'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import CalendarCompareStrip from '@/components/calendar/CalendarCompareStrip'
import DayTradesPanel from '@/components/calendar/DayTradesPanel'
import WeeklyReviewModal from '@/components/calendar/WeeklyReviewModal'
import NoTradeDayModal from '@/components/calendar/NoTradeDayModal'
import { ipc } from '@/lib/ipc'
import type { CalendarMonth } from '@shared/calendar-types'
import type {
  TradeListRow,
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateFloatInput,
  UpdateMistakesInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type { SetPlaybookOnTradeInput } from '@shared/playbook-types'

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
  const [dayTrades, setDayTrades] = useState<TradeListRow[] | null>(null)
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
    setDayTrades(null)
  }, [view.y, view.m])

  // Fetch the trades for the selected day.
  useEffect(() => {
    if (!selectedDate) return
    let cancelled = false
    setDayTrades(null)
    ipc
      .tradesList({ date: selectedDate })
      .then((list) => {
        if (!cancelled) setDayTrades(list)
      })
      .catch(() => {
        if (!cancelled) setDayTrades([])
      })
    return () => {
      cancelled = true
    }
  }, [selectedDate])

  const handleSaveNote = useCallback(async (input: UpdateNoteInput) => {
    const updated = await ipc.tradeNoteSave(input)
    if (!updated) return
    setDayTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSaveTimeframe = useCallback(async (input: UpdateTimeframeInput) => {
    const updated = await ipc.tradeTimeframeSave(input)
    if (!updated) return
    setDayTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSavePlaybook = useCallback(async (input: SetPlaybookOnTradeInput) => {
    const updated = await ipc.tradePlaybookSave(input)
    if (!updated) return
    setDayTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSaveConfidence = useCallback(async (input: UpdateConfidenceInput) => {
    const updated = await ipc.tradeConfidenceSave(input)
    if (!updated) return
    setDayTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSaveMistakes = useCallback(async (input: UpdateMistakesInput) => {
    const updated = await ipc.tradeMistakesSave(input)
    if (!updated) return
    setDayTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSavePlannedRisk = useCallback(async (input: UpdatePlannedRiskInput) => {
    const updated = await ipc.tradePlannedRiskSave(input)
    if (!updated) return
    setDayTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSavePlannedStopLoss = useCallback(
    async (input: UpdatePlannedStopLossInput) => {
      const updated = await ipc.tradePlannedStopLossSave(input)
      if (!updated) return
      setDayTrades((prev) =>
        prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
      )
    },
    [],
  )

  const handleSaveFloat = useCallback(async (input: UpdateFloatInput) => {
    const updated = await ipc.tradeFloatSave(input)
    if (!updated) return
    setDayTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSaveCatalyst = useCallback(async (input: UpdateCatalystInput) => {
    const updated = await ipc.tradeCatalystSave(input)
    if (!updated) return
    setDayTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSaveCountry = useCallback(async (input: UpdateCountryInput) => {
    const updated = await ipc.tradeCountrySave(input)
    if (!updated) return
    setDayTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

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
          day_tags: [],
          has_journal: false,
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

  const handleWeekNotesSaved = useCallback(
    (text: string) => {
      if (!selectedWeek) return
      setData((prev) => {
        if (!prev) return prev
        const idx = prev.weeks.findIndex((w) => w.week_start === selectedWeek)
        if (idx < 0) return prev
        const next = [...prev.weeks]
        next[idx] = { ...next[idx], notes: text }
        return { ...prev, weeks: next }
      })
    },
    [selectedWeek],
  )

  const handleSaveDayTags = useCallback(
    (nextTags: string[]) => {
      if (!selectedDate) return
      setData((prev) => {
        if (!prev) return prev
        const existingIdx = prev.days.findIndex((d) => d.date === selectedDate)
        if (existingIdx >= 0) {
          const next = [...prev.days]
          next[existingIdx] = { ...next[existingIdx], day_tags: nextTags }
          return { ...prev, days: next }
        }
        // No row for this date yet (no-trade day getting its first tag). Insert
        // a stub so the cell picks up the dots immediately. The query will
        // re-include it on the next month fetch.
        if (nextTags.length === 0) return prev
        const stub = {
          date: selectedDate,
          net_pnl: 0,
          gross_pnl: 0,
          total_fees: 0,
          trade_count: 0,
          winners: 0,
          losers: 0,
          day_tags: nextTags,
          has_journal: true, // setting a tag IS a journal action
          sentiment: null,
        }
        return { ...prev, days: [...prev.days, stub] }
      })
    },
    [selectedDate],
  )

  if (err) {
    return (
      <PageShell title="Calendar" subtitle="Trading days at a glance.">
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary">
          <AlertCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-loss">
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
    <PageShell title="Calendar" subtitle="Click a day to see its trades.">
      <div className="space-y-5">
        <CalendarHeader
          stats={data.stats}
          range={data.range}
          onPrev={() => setView(stepMonth(view.y, view.m, -1))}
          onNext={() => setView(stepMonth(view.y, view.m, 1))}
          onToday={() => setView(realNow)}
          isCurrentMonth={isCurrentMonth}
        />

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowWeekly((v) => !v)}
            className={`inline-flex h-8 cursor-pointer items-center rounded-md border px-3 font-mono text-[10px] font-semibold uppercase tracking-widest shadow-sm transition-colors duration-150 ${
              showWeekly
                ? 'border-gold/60 bg-gold/[0.12] text-gold'
                : 'border-border-strong bg-bg-1 text-fg-secondary hover:border-gold/50 hover:text-gold'
            }`}
            aria-pressed={showWeekly}
            title="Show weekly summary cards on the right edge of each row"
          >
            Weekly panels: {showWeekly ? 'on' : 'off'}
          </button>
        </div>

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

        {selectedWeek && data.weeks && (() => {
          const summary = data.weeks.find((w) => w.week_start === selectedWeek)
          if (!summary) return null
          return (
            <WeeklyReviewModal
              summary={summary}
              onClose={() => setSelectedWeek(null)}
              onNotesSaved={handleWeekNotesSaved}
            />
          )
        })()}

        {selectedDate && (
          <DayTradesPanel
            date={selectedDate}
            trades={dayTrades}
            dayTags={
              data.days.find((d) => d.date === selectedDate)?.day_tags ?? []
            }
            onSaveDayTags={handleSaveDayTags}
            onClose={() => setSelectedDate(null)}
            onSaveNote={handleSaveNote}
            onSaveTimeframe={handleSaveTimeframe}
            onSavePlaybook={handleSavePlaybook}
            onSaveConfidence={handleSaveConfidence}
            onSaveMistakes={handleSaveMistakes}
            onSavePlannedRisk={handleSavePlannedRisk}
            onSavePlannedStopLoss={handleSavePlannedStopLoss}
            onSaveFloat={handleSaveFloat}
            onSaveCatalyst={handleSaveCatalyst}
            onSaveCountry={handleSaveCountry}
          />
        )}
      </div>
    </PageShell>
  )
}
