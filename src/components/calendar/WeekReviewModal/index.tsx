import { useCallback, useEffect, useState } from 'react'
import {
  BookOpen,
  BarChart3,
  ListChecks,
  AlertTriangle,
  NotebookPen,
} from 'lucide-react'
import type { WeekDetail } from '@shared/week-types'
import { weekRepo } from '@/data/weekRepo'
import { longDate, signed, pnlClass, formatProfitFactor } from '@/lib/format'
import DetailModalShell, { type DetailModalTab } from '@/components/calendar/DetailModalShell'
import { useTradeStack } from '@/components/calendar/useTradeStack'
import WeekOverviewTab from './WeekOverviewTab'
import WeekPerformanceTab from './WeekPerformanceTab'

interface WeekReviewModalProps {
  /** Sunday week_start (from the calendar grid row), or null when closed. */
  weekStart: string | null
  onClose: () => void
}

type TabKey = 'overview' | 'performance' | 'trades' | 'mistakes' | 'notes'

// Overview (4.5b) + Performance (4.5c) live; Trades/Mistakes/Notes (4.5d)
// flip to available as they land. Same progressive pattern as the Day Detail
// modal shipped its tabs.
const TABS: readonly DetailModalTab<TabKey>[] = [
  { key: 'overview', label: 'Overview', Icon: BookOpen, available: true },
  { key: 'performance', label: 'Performance', Icon: BarChart3, available: true },
  { key: 'trades', label: 'Trades', Icon: ListChecks, available: false },
  { key: 'mistakes', label: 'Mistakes', Icon: AlertTriangle, available: false },
  { key: 'notes', label: 'Notes', Icon: NotebookPen, available: false },
]

// v0.2.2 Day 4.5b — tabbed Weekly Review modal, built on the shared
// DetailModalShell + useTradeStack (extracted in 4.5a). Mirrors DayDetailModal:
// owns the week's data + which tab content to render; the chrome and
// trade-stacking discipline are shared.
export default function WeekReviewModal({ weekStart, onClose }: WeekReviewModalProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [detail, setDetail] = useState<WeekDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!weekStart) return
    try {
      setDetail(await weekRepo.getWeekDetail(weekStart))
    } catch {
      // refresh-after-save failure keeps last-good detail; initial load owns errors
    }
  }, [weekStart])

  const stack = useTradeStack({ trades: detail?.trades, reload })

  useEffect(() => {
    if (weekStart) {
      setTab('overview')
      stack.reset()
    }
  }, [weekStart, stack.reset])

  useEffect(() => {
    if (!weekStart) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetail(null)
    weekRepo
      .getWeekDetail(weekStart)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [weekStart])

  if (!weekStart) return null

  const m = detail?.metrics
  const title = detail
    ? `${longDate(detail.weekStart)} → ${longDate(detail.weekEnd)}`
    : longDate(weekStart)
  const subtitle = m
    ? `${m.tradingDays} trading day${m.tradingDays === 1 ? '' : 's'} · ${m.tradeCount} trade${m.tradeCount === 1 ? '' : 's'}`
    : ' '

  return (
    <DetailModalShell<TabKey>
      titleId="week-review-title"
      title={title}
      subtitle={subtitle}
      headerRight={<WeekHeaderStats detail={detail} />}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      onClose={onClose}
      escapeBlocked={stack.escapeBlocked}
      stackedModal={stack.stackedModal}
    >
      {loading && <div className="p-6 text-sm text-fg-tertiary">Loading…</div>}
      {error && !loading && (
        <div className="p-6 text-sm text-loss">Failed to load week detail: {error}</div>
      )}
      {detail && !loading && tab === 'overview' && <WeekOverviewTab detail={detail} />}
      {detail && !loading && tab === 'performance' && <WeekPerformanceTab detail={detail} />}
      {detail && !loading && tab !== 'overview' && tab !== 'performance' && (
        <div className="p-6 text-sm text-fg-tertiary">
          This tab ships later in the v0.2.2 build sequence.
        </div>
      )}
    </DetailModalShell>
  )
}

// Week headline trio rendered into the shell's headerRight slot.
function WeekHeaderStats({ detail }: { detail: WeekDetail | null }) {
  const m = detail?.metrics
  return (
    <>
      <div className="text-right">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Win rate
        </div>
        <div className="font-mono text-sm font-semibold tnum text-gold">
          {m && m.winRate !== null ? `${(m.winRate * 100).toFixed(0)}%` : '—'}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Profit factor
        </div>
        <div className="font-mono text-sm font-semibold tnum text-gold">
          {m ? formatProfitFactor(m.profitFactor) : '—'}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Net P&amp;L
        </div>
        <div
          className={`font-mono text-2xl font-semibold tnum ${
            m ? pnlClass(m.netPnl) : 'text-fg-tertiary'
          }`}
        >
          {m ? signed(m.netPnl) : '—'}
        </div>
      </div>
    </>
  )
}
