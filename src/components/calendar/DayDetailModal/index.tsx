import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  BarChart3,
  ListChecks,
  NotebookPen,
  ShieldAlert,
} from 'lucide-react'
import type { DayDetail } from '@shared/day-types'
import { dayRepo } from '@/data/dayRepo'
import { useAccountScope } from '@/lib/accountScope'
import { longDate, money, signed, pnlClass } from '@/lib/format'
import DetailModalShell, { type DetailModalTab } from '@/components/calendar/DetailModalShell'
import { useTradeStack } from '@/components/calendar/useTradeStack'
import DetailNotesTab from '@/components/calendar/DetailNotesTab'
import { type NavPosition } from '@/core/trades/tradeNavigation'
import OverviewTab from './OverviewTab'
import PerformanceTab from './PerformanceTab'
import TradesTab from './TradesTab'
import MistakesTab from './MistakesTab'
import RuleBreaksEditor from '@/components/calendar/RuleBreaksEditor'

interface DayDetailModalProps {
  date: string | null
  onClose: () => void
  /** Day cycling (v0.2.6) — OPTIONAL, mirroring TradeDetailModal's nav props.
   *  The Calendar host computes the walk from the loaded month's
   *  days-with-trades and passes both; without them the modal renders no nav
   *  UI and ignores arrow keys. */
  navPosition?: NavPosition<string>
  onNavigate?: (date: string) => void
}

type TabKey = 'overview' | 'performance' | 'trades' | 'mistakes' | 'ruleBreaks' | 'notes'

// Mistakes reinstated (djsevans87 #7) as its own read-only tab BESIDE Rule
// Breaks — trade-scoped tags and day-scoped rule breaks are different grains,
// so both show. Placed adjacent (not last, its pre-2f51c52 slot) so the two
// "what went wrong" views sit together, mirroring the week modal's mid-list
// Mistakes placement.
const TABS: readonly DetailModalTab<TabKey>[] = [
  { key: 'overview', label: 'Overview', Icon: BookOpen, available: true },
  { key: 'performance', label: 'Performance', Icon: BarChart3, available: true },
  { key: 'trades', label: 'Trades', Icon: ListChecks, available: true },
  { key: 'mistakes', label: 'Mistakes', Icon: AlertTriangle, available: true },
  { key: 'ruleBreaks', label: 'Rule Breaks', Icon: ShieldAlert, available: true },
  { key: 'notes', label: 'Notes', Icon: NotebookPen, available: true },
]

// v0.2.2 Day Detail Modal. The chrome (portal/backdrop/header/tab-strip/content
// + stacking-aware Escape) lives in the shared DetailModalShell; trade-detail
// stacking lives in useTradeStack. This file owns the day's data and which tab
// content to render. Refactored in Day 4.5a (behavior-preserving) so the
// Weekly Review modal can reuse the same shell + stacking.
export default function DayDetailModal({ date, onClose, navPosition, onNavigate }: DayDetailModalProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-fetch the whole day after a trade edit so Overview + Performance +
  // Trades stay consistent (playbook → mostUsedPlaybook; planned_risk →
  // avgRMultiple / firstTradePnl.rMultiple). No loading-flash — keep current
  // detail on screen until fresh lands, so the stacked modal doesn't unmount
  // mid-edit.
  // Multi-account (Technicals slice, beat 2) — the day drill-down follows
  // the switcher; a flip while the modal is open re-fetches to the new scope.
  const { scope } = useAccountScope()

  const reload = useCallback(async () => {
    if (!date) return
    try {
      const fresh = await dayRepo.getDayDetail(date, { accountScope: scope })
      setDetail(fresh)
    } catch {
      // A refresh-after-save failure keeps the last-good detail on screen;
      // the initial-load effect owns hard-error surfacing.
    }
  }, [date, scope])

  const stack = useTradeStack({ trades: detail?.trades, reload })

  // Fresh open vs arrow cycle (v0.2.6 cycling): every close path nulls `date`,
  // so null→date is a FRESH OPEN — reset the tab + stacked trade and show the
  // loader — while date→date is a CYCLE — keep the active tab AND keep the
  // last detail mounted until the fresh one lands (reload()'s no-flash shape;
  // the cancelled flag stays the latest-wins guard, so a stale response can
  // never overwrite a newer day). A scope flip re-fetches on the cycle shape
  // too — no null-flash. The ref advances only here, once per transition.
  const prevDateRef = useRef<string | null>(null)

  useEffect(() => {
    const freshOpen = date !== null && prevDateRef.current === null
    prevDateRef.current = date
    if (!date) return
    if (freshOpen) {
      setTab('overview')
      stack.reset()
      setLoading(true)
      setError(null)
      setDetail(null)
    }
    let cancelled = false
    dayRepo
      .getDayDetail(date, { accountScope: scope })
      .then((d) => {
        if (!cancelled) {
          setDetail(d)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        // A cycle/scope-refetch failure keeps the last-good detail (reload()'s
        // contract); the fresh open still owns hard-error surfacing.
        if (!cancelled && freshOpen) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date, scope, stack.reset])

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
      navPosition={navPosition}
      onNavigate={onNavigate}
      navUnit="day"
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
      {detail && !loading && tab === 'mistakes' && (
        <MistakesTab mistakeTagCounts={detail.metrics.mistakeTagCounts} />
      )}
      {detail && !loading && tab === 'ruleBreaks' && (
        <div className="space-y-3">
          <p className="text-xs text-fg-secondary">
            Tag the day-level rule breaks that happened on {longDate(detail.date)}.
            Edit the list in Settings → Daily Rule Breaks.
          </p>
          <RuleBreaksEditor
            date={detail.date}
            breaks={detail.ruleBreaks}
            onChange={(next) =>
              setDetail((d) => (d ? { ...d, ruleBreaks: next } : d))
            }
          />
        </div>
      )}
      {/* Notes is a WRITE surface — unlike the read-only tabs it must never
          sit under another day's identity while a cycle's fetch is in flight
          (the 500ms debounced save reads the LATEST onSave closure and would
          re-target). Gate on detail freshness: mid-cycle the editor unmounts,
          flushing any pending edit to the OLD day via its last-committed
          closure; the read-only tabs keep the no-flash keep-last. */}
      {detail && !loading && detail.date === date && tab === 'notes' && (
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
