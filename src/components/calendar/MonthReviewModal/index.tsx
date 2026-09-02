import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  BarChart3,
  CalendarRange,
  ListChecks,
  Repeat,
  NotebookPen,
  ShieldAlert,
} from 'lucide-react'
import type { MonthDetail } from '@shared/week-types'
import { monthRepo } from '@/data/monthRepo'
import { useAccountScope } from '@/lib/accountScope'
import { signed, pnlClass, formatPnlRatio } from '@/lib/format'
import { monthLabel } from '@/core/calendar/monthWindow'
import DetailModalShell, { type DetailModalTab } from '@/components/calendar/DetailModalShell'
import { useTradeStack } from '@/components/calendar/useTradeStack'
import { type NavPosition } from '@/core/trades/tradeNavigation'
import WeekOverviewTab from '@/components/calendar/WeekReviewModal/WeekOverviewTab'
import WeekPerformanceTab from '@/components/calendar/WeekReviewModal/WeekPerformanceTab'
import WeekTradesTab from '@/components/calendar/WeekReviewModal/WeekTradesTab'
import WeekMistakesTab from '@/components/calendar/WeekReviewModal/WeekMistakesTab'
import WeekPatternsTab from '@/components/calendar/WeekReviewModal/WeekPatternsTab'
import { MONTH_WORDING } from './wording'
import { monthlyReview } from './reviewChannel'
import MonthWeeksTab from './MonthWeeksTab'
import { MONTH_LADDER_WORDING } from './ladderWording'
import { MONTH_RULE_BREAKS_WORDING } from './ruleBreaksWording'
import RuleBreaksTableView from '@/components/calendar/RuleBreaksTableView'
import Card from '@/components/ui/Card'
import DetailNotesTab from '@/components/calendar/DetailNotesTab'
import { monthRepo as monthRepoForNotes } from '@/data/monthRepo'

interface MonthReviewModalProps {
  /** 'YYYY-MM', or null when closed. */
  monthId: string | null
  onClose: () => void
  /** Month cycling — the twelve ids of the displayed year, in calendar order.
   *  Absent -> no nav UI and no arrow keys, exactly as the week host behaves
   *  without them. */
  navPosition?: NavPosition<string>
  onNavigate?: (monthId: string) => void
  /** A Weeks-ladder row opens the WHOLE week it came from. Absent -> the
   *  rows still render and still say what they summed; they just do not
   *  open anything. */
  onOpenWeek?: (weekStart: string) => void
}

type TabKey =
  | 'overview'
  | 'performance'
  | 'trades'
  | 'mistakes'
  | 'ruleBreaks'
  | 'patterns'
  | 'notes'
  | 'weeks'

// THE SAME SIX TABS THE WEEK HAS, all six available. Notes was disabled in
// the beat that built this drawer because month_notes did not exist; it does
// now, so the tab is live and keyed on the month id.
const TABS: readonly DetailModalTab<TabKey>[] = [
  { key: 'overview', label: 'Overview', Icon: BookOpen, available: true },
  { key: 'performance', label: 'Performance', Icon: BarChart3, available: true },
  { key: 'trades', label: 'Trades', Icon: ListChecks, available: true },
  { key: 'mistakes', label: 'Mistakes', Icon: AlertTriangle, available: true },
  // POSITION FIVE, inserted rather than appended: the day modal has Rule
  // Breaks here already (DayDetailModal/index.tsx:47), so the order a
  // trader learns on one drawer holds on the others.
  {
    key: 'ruleBreaks',
    label: MONTH_RULE_BREAKS_WORDING.tabLabel,
    Icon: ShieldAlert,
    available: true,
  },
  { key: 'patterns', label: 'Patterns', Icon: Repeat, available: true },
  { key: 'notes', label: 'Notes', Icon: NotebookPen, available: true },
  // THE SEVENTH, APPENDED -- the six above keep their order and their keys.
  // The week and day hosts declare their own TABS and gain nothing: a week
  // has no weeks inside it, and a day has no ladder to show.
  {
    key: 'weeks',
    label: MONTH_LADDER_WORDING.tabLabel,
    Icon: CalendarRange,
    available: true,
  },
]

// The Month drawer: the WeekReviewModal host, mirrored onto a month window.
//
// A SEPARATE HOST, NOT A MODE FLAG. Everything period-shaped already lives
// somewhere shared -- the chrome in DetailModalShell, the window in
// getPeriodDetail, the wording in PeriodWording -- so what is left is exactly
// what differs: which id, which words, which tabs, which title. Threading a
// period discriminator through the week host would have put a conditional on
// every one of those lines instead.
//
// THE REVIEW AND THE NOTE ARE BOTH LIVE NOW. Overview is handed the MONTHLY
// review pair (never the weekly one -- the weekly GET does no validation, so
// a month reaching it would fail silently for ever), and the Notes tab has a
// month_notes row to write to.
export default function MonthReviewModal({
  monthId,
  onClose,
  navPosition,
  onNavigate,
  onOpenWeek,
}: MonthReviewModalProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [detail, setDetail] = useState<MonthDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { scope } = useAccountScope()

  // Bound to THIS month id -- never to the window start, which is the
  // first of the month and which the monthly guard would reject.
  const review = useMemo(() => monthlyReview(monthId ?? ''), [monthId])

  const reload = useCallback(async () => {
    if (!monthId) return
    try {
      setDetail(await monthRepo.getMonthDetail(monthId, { accountScope: scope }))
    } catch {
      // refresh-after-save failure keeps last-good detail; initial load owns errors
    }
  }, [monthId, scope])

  const stack = useTradeStack({ trades: detail?.trades, reload })

  // Fresh open vs arrow cycle — WeekReviewModal's discriminator, mirrored.
  const prevMonthRef = useRef<string | null>(null)

  useEffect(() => {
    const freshOpen = monthId !== null && prevMonthRef.current === null
    prevMonthRef.current = monthId
    if (!monthId) return
    if (freshOpen) {
      setTab('overview')
      stack.reset()
      setLoading(true)
      setError(null)
      setDetail(null)
    }
    let cancelled = false
    monthRepo
      .getMonthDetail(monthId, { accountScope: scope })
      .then((d) => {
        if (!cancelled) {
          setDetail(d)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled && freshOpen) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [monthId, scope, stack.reset])

  if (!monthId) return null

  const m = detail?.metrics
  // A MONTH HAS A NAME, so the header says it instead of spelling out a range
  // the way the week must. Title identity follows the PROP (the week host's
  // rule): during a cycle `detail` is still the previous month's, and the
  // heading must never label one month's numbers with another's name.
  const title = monthLabel(monthId)
  const fresh = detail !== null && detail.from.slice(0, 7) === monthId
  const subtitle =
    m && fresh
      ? `${m.tradingDays} trading day${m.tradingDays === 1 ? '' : 's'} · ${m.tradeCount} trade${m.tradeCount === 1 ? '' : 's'}`
      : ' '

  return (
    <DetailModalShell<TabKey>
      titleId="month-review-title"
      title={title}
      subtitle={subtitle}
      headerRight={<MonthHeaderStats detail={fresh ? detail : null} />}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      onClose={onClose}
      escapeBlocked={stack.escapeBlocked}
      stackedModal={stack.stackedModal}
      navPosition={navPosition}
      onNavigate={onNavigate}
      navUnit="month"
    >
      {loading && <div className="p-6 text-sm text-fg-tertiary">Loading…</div>}
      {error && !loading && (
        <div className="p-6 text-sm text-loss">Failed to load month detail: {error}</div>
      )}
      {detail && !loading && tab === 'overview' && (
        <WeekOverviewTab detail={detail} wording={MONTH_WORDING} review={review} />
      )}
      {detail && !loading && tab === 'performance' && (
        <WeekPerformanceTab detail={detail} wording={MONTH_WORDING} />
      )}
      {detail && !loading && tab === 'trades' && (
        <WeekTradesTab
          trades={detail.trades}
          selectedTradeId={stack.selectedTradeId}
          onSelectTrade={stack.selectTrade}
          wording={MONTH_WORDING}
        />
      )}
      {detail && !loading && tab === 'mistakes' && (
        <WeekMistakesTab table={detail.metrics.mistakesTable} wording={MONTH_WORDING} />
      )}
      {detail && !loading && tab === 'ruleBreaks' && (
        <Card title={MONTH_RULE_BREAKS_WORDING.title} subtitle={MONTH_RULE_BREAKS_WORDING.subtitle}>
          <RuleBreaksTableView
            data={detail.ruleBreaks}
            wording={MONTH_RULE_BREAKS_WORDING}
          />
        </Card>
      )}
      {detail && !loading && tab === 'patterns' && (
        <WeekPatternsTab detail={detail} wording={MONTH_WORDING} />
      )}
      {detail && !loading && tab === 'weeks' && (
        <MonthWeeksTab
          rows={detail.ladder}
          wording={MONTH_LADDER_WORDING}
          onOpenWeek={(weekStart) => onOpenWeek?.(weekStart)}
        />
      )}
      {/* Notes is a WRITE surface -- gate on detail freshness so a mid-cycle
          keep-last detail can't leave the editor (and its debounced save,
          which reads the LATEST onSave closure) targeting the wrong month.
          Mirrors WeekReviewModal. */}
      {detail && !loading && fresh && tab === 'notes' && (
        <DetailNotesTab
          resetKey={monthId}
          initialValue={detail.notes ?? ''}
          onSave={(body) =>
            monthRepoForNotes
              .saveMonthNotes(monthId, body)
              .then(() => setDetail((d) => (d ? { ...d, notes: body } : d)))
          }
          label="Month notes"
          placeholder="What worked this month? What did not? What is the plan for next month?"
        />
      )}
    </DetailModalShell>
  )
}

// Month headline trio rendered into the shell's headerRight slot — the
// WeekHeaderStats mirror, on a MonthDetail.
function MonthHeaderStats({ detail }: { detail: MonthDetail | null }) {
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
          P&amp;L ratio
        </div>
        <div className="font-mono text-sm font-semibold tnum text-gold">
          {m ? formatPnlRatio(m.pnlRatio) : '—'}
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
