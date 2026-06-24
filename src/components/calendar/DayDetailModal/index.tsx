import { useCallback, useEffect, useState } from 'react'
import {
  BookOpen,
  BarChart3,
  ListChecks,
  NotebookPen,
  AlertTriangle,
} from 'lucide-react'
import type { DayDetail } from '@shared/day-types'
import { dayRepo } from '@/data/dayRepo'
import { longDate, money, signed, pnlClass } from '@/lib/format'
import DetailModalShell, { type DetailModalTab } from '@/components/calendar/DetailModalShell'
import { useTradeStack } from '@/components/calendar/useTradeStack'
import DetailNotesTab from '@/components/calendar/DetailNotesTab'
import OverviewTab from './OverviewTab'
import PerformanceTab from './PerformanceTab'
import TradesTab from './TradesTab'
import MistakesTab from './MistakesTab'

interface DayDetailModalProps {
  date: string | null
  onClose: () => void
}

type TabKey = 'overview' | 'performance' | 'trades' | 'notes' | 'mistakes'

const TABS: readonly DetailModalTab<TabKey>[] = [
  { key: 'overview', label: 'Overview', Icon: BookOpen, available: true },
  { key: 'performance', label: 'Performance', Icon: BarChart3, available: true },
  { key: 'trades', label: 'Trades', Icon: ListChecks, available: true },
  { key: 'notes', label: 'Notes', Icon: NotebookPen, available: true },
  { key: 'mistakes', label: 'Mistakes', Icon: AlertTriangle, available: true },
]

// v0.2.2 Day Detail Modal. The chrome (portal/backdrop/header/tab-strip/content
// + stacking-aware Escape) lives in the shared DetailModalShell; trade-detail
// stacking lives in useTradeStack. This file owns the day's data and which tab
// content to render. Refactored in Day 4.5a (behavior-preserving) so the
// Weekly Review modal can reuse the same shell + stacking.
export default function DayDetailModal({ date, onClose }: DayDetailModalProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-fetch the whole day after a trade edit so Overview + Performance +
  // Trades stay consistent (playbook → mostUsedPlaybook; planned_risk →
  // avgRMultiple / firstTradePnl.rMultiple). No loading-flash — keep current
  // detail on screen until fresh lands, so the stacked modal doesn't unmount
  // mid-edit.
  const reload = useCallback(async () => {
    if (!date) return
    try {
      const fresh = await dayRepo.getDayDetail(date)
      setDetail(fresh)
    } catch {
      // A refresh-after-save failure keeps the last-good detail on screen;
      // the initial-load effect owns hard-error surfacing.
    }
  }, [date])

  const stack = useTradeStack({ trades: detail?.trades, reload })

  useEffect(() => {
    if (date) {
      setTab('overview')
      stack.reset()
    }
  }, [date, stack.reset])

  useEffect(() => {
    if (!date) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetail(null)
    dayRepo
      .getDayDetail(date)
      .then((d) => {
        if (!cancelled) {
          setDetail(d)
        }
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
  }, [date])

  if (!date) return null

  const m = detail?.metrics
  const subtitle = m
    ? `${m.dayOfWeek} · ${m.tradeCount} trade${m.tradeCount === 1 ? '' : 's'}`
    : ' '

  return (
    <DetailModalShell<TabKey>
      titleId="day-detail-title"
      title={longDate(date)}
      subtitle={subtitle}
      headerRight={<DayHeaderStats detail={detail} />}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      onClose={onClose}
      escapeBlocked={stack.escapeBlocked}
      stackedModal={stack.stackedModal}
    >
      {loading && <div className="p-6 text-sm text-fg-tertiary">Loading…</div>}
      {error && !loading && (
        <div className="p-6 text-sm text-loss">Failed to load day detail: {error}</div>
      )}
      {detail && !loading && tab === 'overview' && <OverviewTab detail={detail} />}
      {detail && !loading && tab === 'performance' && <PerformanceTab detail={detail} />}
      {detail && !loading && tab === 'trades' && (
        <TradesTab
          trades={detail.trades}
          selectedTradeId={stack.selectedTradeId}
          onSelectTrade={stack.selectTrade}
        />
      )}
      {detail && !loading && tab === 'notes' && (
        <DetailNotesTab
          resetKey={date}
          initialValue={detail.note ?? ''}
          onSave={(body) =>
            // After the save resolves, refresh detail.note so a tab-switch
            // re-mount of the Notes tab re-seeds the CURRENT value, not the
            // stale fetch. Matches day/repo.ts: empty -> null. The chain still
            // resolves to the tab, so its "Saved" status fires unchanged.
            dayRepo.saveDayNote(date, body).then(() =>
              setDetail((d) => (d ? { ...d, note: body || null } : d))
            )
          }
          label="Day notes"
          placeholder="How did the day go? Plan, execution, what to repeat or fix…"
        />
      )}
      {detail && !loading && tab === 'mistakes' && (
        <MistakesTab mistakeTagCounts={detail.metrics.mistakeTagCounts} />
      )}
    </DetailModalShell>
  )
}

// The gross/fees/net trio — Day-specific header content rendered into the
// shell's headerRight slot (the close button is the shell's).
function DayHeaderStats({ detail }: { detail: DayDetail | null }) {
  const m = detail?.metrics
  return (
    <>
      <div className="text-right">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Gross
        </div>
        <div
          className={`font-mono text-sm font-semibold tnum ${
            m ? pnlClass(m.grossPnl) : 'text-fg-tertiary'
          }`}
        >
          {m ? signed(m.grossPnl) : '—'}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Fees
        </div>
        <div
          className={`font-mono text-sm font-semibold tnum ${
            m && m.totalFees > 0 ? 'text-fg-primary' : 'text-fg-secondary'
          }`}
        >
          {m ? money(m.totalFees) : '—'}
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
