import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  BookOpen,
  ListChecks,
  BarChart3,
  NotebookPen,
  AlertTriangle,
} from 'lucide-react'
import type { DayDetail } from '@shared/day-types'
import { dayRepo } from '@/data/dayRepo'
import { longDate, money, signed, pnlClass } from '@/lib/format'
import OverviewTab from './OverviewTab'

interface DayDetailModalProps {
  date: string | null
  onClose: () => void
}

type TabKey = 'overview' | 'trades' | 'chart' | 'notes' | 'mistakes'

// `available` flips to true as each tab ships across the v0.2.2 build sequence.
// Day 1 ships Overview only; Days 2–4 land the rest. Disabled tabs render as
// non-interactive labels so the trader sees what's coming without confusion.
const TABS: { key: TabKey; label: string; Icon: typeof BookOpen; available: boolean }[] = [
  { key: 'overview', label: 'Overview', Icon: BookOpen, available: true },
  { key: 'trades', label: 'Trades', Icon: ListChecks, available: false },
  { key: 'chart', label: 'Chart', Icon: BarChart3, available: false },
  { key: 'notes', label: 'Notes', Icon: NotebookPen, available: false },
  { key: 'mistakes', label: 'Mistakes', Icon: AlertTriangle, available: false },
]

// v0.2.2 Day Detail Modal — overlay that replaces the Calendar's inline
// DayTradesPanel expansion. Same structural pattern as TradeDetailModal:
// portal, backdrop, header trio (gross/fees/net), tab strip, content area.
//
// Layering: the outer container's z-[110] puts the whole modal above the
// Calendar (z-0). Within the modal, backdrop comes first in DOM and content
// second, so DOM order alone keeps content above the backdrop's blur — no
// inner z-index needed. Day 2 modal stacking will bump TradeDetailModal's
// outer container above this one (e.g. z-[210]) using the same approach.
export default function DayDetailModal({ date, onClose }: DayDetailModalProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (date) setTab('overview')
  }, [date])

  useEffect(() => {
    if (!date) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetail(null)
    dayRepo
      .getDayDetail(date)
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
  }, [date])

  useEffect(() => {
    if (!date) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [date, onClose])

  if (!date) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-detail-title"
      className="fixed inset-0 z-[110] flex items-center justify-center p-6"
    >
      <div
        className="absolute inset-0 bg-bg-0/72 backdrop-blur-[4px]"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92vh] w-full max-w-[980px] flex-col rounded-lg border border-border bg-bg-3 shadow-lg animate-modal-in">
        <ModalHeader detail={detail} date={date} onClose={onClose} />
        <div className="flex items-center gap-0 border-b border-border-subtle px-3">
          {TABS.map((t) => {
            const active = t.key === tab
            const interactive = t.available
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => interactive && setTab(t.key)}
                disabled={!interactive}
                aria-selected={active}
                role="tab"
                title={interactive ? undefined : 'Ships later in the v0.2.2 build sequence'}
                className={`relative inline-flex h-10 items-center gap-2 px-3 text-sm transition-colors duration-150 ease-out-soft ${
                  active
                    ? 'text-fg-primary cursor-pointer'
                    : interactive
                      ? 'text-fg-tertiary hover:text-fg-secondary cursor-pointer'
                      : 'text-fg-tertiary/40 cursor-not-allowed'
                }`}
              >
                <t.Icon size={14} strokeWidth={1.75} />
                {t.label}
                {active && (
                  <span className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-t bg-gold" />
                )}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="p-6 text-sm text-fg-tertiary">Loading…</div>
          )}
          {error && !loading && (
            <div className="p-6 text-sm text-loss">Failed to load day detail: {error}</div>
          )}
          {detail && !loading && tab === 'overview' && <OverviewTab detail={detail} />}
          {detail && !loading && tab !== 'overview' && (
            <div className="p-6 text-sm text-fg-tertiary">
              This tab ships later in the v0.2.2 build sequence.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ModalHeader({
  detail,
  date,
  onClose,
}: {
  detail: DayDetail | null
  date: string
  onClose: () => void
}) {
  const m = detail?.metrics
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
      <div className="min-w-0">
        <h2
          id="day-detail-title"
          className="text-xl font-semibold tracking-tight text-fg-primary"
        >
          {longDate(date)}
        </h2>
        <div className="mt-1 text-xs text-fg-tertiary tnum">
          {m
            ? `${m.dayOfWeek} · ${m.tradeCount} trade${m.tradeCount === 1 ? '' : 's'}`
            : ' '}
        </div>
      </div>
      <div className="flex shrink-0 items-baseline gap-4">
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-border hover:text-fg-primary"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
