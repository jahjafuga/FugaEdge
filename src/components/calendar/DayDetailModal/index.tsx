import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  BookOpen,
  BarChart3,
  ListChecks,
  NotebookPen,
  AlertTriangle,
} from 'lucide-react'
import type { DayDetail } from '@shared/day-types'
import type { TradeListRow } from '@shared/trades-types'
import { dayRepo } from '@/data/dayRepo'
import { ipc } from '@/lib/ipc'
import { longDate, money, signed, pnlClass } from '@/lib/format'
import TradeDetailModal from '@/components/trades/TradeDetailModal'
import OverviewTab from './OverviewTab'
import PerformanceTab from './PerformanceTab'
import TradesTab from './TradesTab'
import NotesTab from './NotesTab'
import MistakesTab from './MistakesTab'

interface DayDetailModalProps {
  date: string | null
  onClose: () => void
}

type TabKey = 'overview' | 'performance' | 'trades' | 'notes' | 'mistakes'

// `available` flips to true as each tab ships across the v0.2.2 build sequence.
// Days 1–2 ship Overview + Performance; Day 3 lands Trades, Day 4 the rest.
// Disabled tabs render as non-interactive labels so the trader sees what's
// coming without confusion. (Chart tab was removed in the post-Day-1 spec
// update — see the v0.2.2 plan addendum.)
const TABS: { key: TabKey; label: string; Icon: typeof BookOpen; available: boolean }[] = [
  { key: 'overview', label: 'Overview', Icon: BookOpen, available: true },
  { key: 'performance', label: 'Performance', Icon: BarChart3, available: true },
  { key: 'trades', label: 'Trades', Icon: ListChecks, available: true },
  { key: 'notes', label: 'Notes', Icon: NotebookPen, available: true },
  { key: 'mistakes', label: 'Mistakes', Icon: AlertTriangle, available: true },
]

// v0.2.2 Day Detail Modal — overlay that replaces the Calendar's inline
// DayTradesPanel expansion. Same structural pattern as TradeDetailModal:
// portal, backdrop, header trio (gross/fees/net), tab strip, content area.
//
// Layering: the outer container's z-[110] puts the whole modal above the
// Calendar (z-0). Within the modal, backdrop comes first in DOM and content
// second, so DOM order alone keeps content above the backdrop's blur — no
// inner z-index needed. When a trade row is clicked, a stacked
// TradeDetailModal (stacked → z-[210]) opens above this one; DayDetail stays
// mounted underneath, preserving its tab/scroll/data.
export default function DayDetailModal({ date, onClose }: DayDetailModalProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Trade whose detail will stack on top (Day 3.2). In 3.1 it only drives the
  // row highlight in the Trades tab — the stacked TradeDetailModal lands next.
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null)
  // Day-level mistake tags lifted here (Day 4.2) so the selection survives
  // tab switches — MistakesTab unmounts on switch, so its own state would be
  // lost and re-seeded stale. Seeded from detail on load; this is the single
  // source of truth for the day-level picker.
  const [dayMistakes, setDayMistakes] = useState<string[]>([])

  useEffect(() => {
    if (date) {
      setTab('overview')
      setSelectedTradeId(null)
      setDayMistakes([])
    }
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
        if (!cancelled) {
          setDetail(d)
          setDayMistakes(d.dayMistakes)
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

  useEffect(() => {
    if (!date) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // When a trade detail is stacked on top, it owns Escape — don't close
        // DayDetail out from under it. Both listeners live on `document`;
        // stopPropagation can't stop a sibling listener, and DayDetail's fires
        // first (mounted first), so the guard must be explicit here.
        if (selectedTradeId !== null) return
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [date, onClose, selectedTradeId])

  // Re-fetch the whole day after a trade edit so Overview + Performance +
  // Trades stay consistent. Some edits shift day metrics (playbook →
  // mostUsedPlaybook; planned_risk → avgRMultiple / firstTradePnl.rMultiple),
  // so the old surgical single-row patch would leave those cards stale. No
  // loading-flash here — keep the current detail on screen until fresh lands,
  // so the stacked modal doesn't unmount mid-edit.
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

  // Wraps each trade-save IPC: persist, then reload if it actually changed
  // something. T is inferred per call from the specific save fn + input.
  async function persist<T>(
    save: (input: T) => Promise<TradeListRow | null>,
    input: T,
  ): Promise<void> {
    const updated = await save(input)
    if (updated) await reload()
  }

  // Day-level mistake toggle: optimistically update the lifted state and
  // persist the full set. Self-contained to the Mistakes tab (nothing else
  // reads dayMistakes), so no reload() — unlike the trade-save handlers.
  const handleSaveDayMistakes = useCallback(
    (next: string[]) => {
      if (!date) return
      setDayMistakes(next)
      void dayRepo.saveDayMistakes(date, next)
    },
    [date],
  )

  if (!date) return null

  // The trade whose detail is stacked on top, resolved from the freshly
  // fetched list so post-save edits flow back in. null → TradeDetailModal
  // self-hides (renders null).
  const selectedTrade =
    detail && selectedTradeId !== null
      ? detail.trades.find((t) => t.id === selectedTradeId) ?? null
      : null

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
      <div className="relative flex max-h-[92vh] w-full max-w-[min(1400px,calc(100vw-3rem))] flex-col rounded-lg border border-border bg-bg-3 shadow-lg animate-modal-in">
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
          {detail && !loading && tab === 'performance' && <PerformanceTab detail={detail} />}
          {detail && !loading && tab === 'trades' && (
            <TradesTab
              trades={detail.trades}
              selectedTradeId={selectedTradeId}
              onSelectTrade={setSelectedTradeId}
            />
          )}
          {detail && !loading && tab === 'notes' && (
            <NotesTab date={date} note={detail.note} />
          )}
          {detail && !loading && tab === 'mistakes' && (
            <MistakesTab
              mistakeTagCounts={detail.metrics.mistakeTagCounts}
              dayMistakes={dayMistakes}
              onChangeDayMistakes={handleSaveDayMistakes}
            />
          )}
        </div>
      </div>

      {/* Stacked trade detail. TradeDetailModal self-portals to document.body,
          so its DOM position is independent of this nesting; stacked → z-210,
          above DayDetail's z-110. Renders null when no row is selected. */}
      <TradeDetailModal
        trade={selectedTrade}
        stacked
        onClose={() => setSelectedTradeId(null)}
        onSaveNote={(i) => persist(ipc.tradeNoteSave, i)}
        onSaveTimeframe={(i) => persist(ipc.tradeTimeframeSave, i)}
        onSavePlaybook={(i) => persist(ipc.tradePlaybookSave, i)}
        onSaveConfidence={(i) => persist(ipc.tradeConfidenceSave, i)}
        onSaveMistakes={(i) => persist(ipc.tradeMistakesSave, i)}
        onSavePlannedRisk={(i) => persist(ipc.tradePlannedRiskSave, i)}
        onSavePlannedStopLoss={(i) => persist(ipc.tradePlannedStopLossSave, i)}
        onSaveFloat={(i) => persist(ipc.tradeFloatSave, i)}
        onSaveCatalyst={(i) => persist(ipc.tradeCatalystSave, i)}
        onSaveCountry={(i) => persist(ipc.tradeCountrySave, i)}
      />
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
