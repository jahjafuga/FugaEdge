import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, PieChart, Upload, Printer } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Skeleton from '@/components/ui/Skeleton'
import TabBar from '@/components/ui/TabBar'
import OverviewTab from '@/components/analytics/tabs/OverviewTab'
import AnalyticsCompareTab from '@/components/analytics/tabs/AnalyticsCompareTab'
import PerformanceTab from '@/components/analytics/tabs/PerformanceTab'
import ExecutionTab from '@/components/analytics/tabs/ExecutionTab'
import MomentumTab from '@/components/analytics/tabs/MomentumTab'
import PsychologyTab from '@/components/analytics/tabs/PsychologyTab'
import SymbolsTab from '@/components/analytics/tabs/SymbolsTab'
import AnalyticsQualityTab from '@/components/analytics/tabs/AnalyticsQualityTab'
import TechnicalsTab from '@/components/analytics/tabs/TechnicalsTab'
import { ipc } from '@/lib/ipc'
import { useAccountScope } from '@/lib/accountScope'
import { int } from '@/lib/format'
import type { DateRange } from '@/core/performance'
import type { AnalyticsData } from '@shared/analytics-types'
import type { ReportsData } from '@shared/reports-types'
import type { TradeListRow } from '@shared/trades-types'

type TabKey =
  | 'overview'
  | 'compare'
  | 'performance'
  | 'execution'
  | 'momentum'
  | 'psychology'
  | 'quality'
  | 'symbols'
  | 'technicals'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'compare', label: 'Compare' },
  { key: 'performance', label: 'Performance' },
  { key: 'execution', label: 'Execution' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'psychology', label: 'Psychology' },
  { key: 'quality', label: 'Quality' },
  { key: 'symbols', label: 'Symbols' },
  { key: 'technicals', label: 'Technicals' },
]

// Deep-link param parsing (Calendar compare card -> /analytics?tab=compare&...).

const TAB_KEYS = TABS.map((t) => t.key)
function isValidTabKey(t: string | null): t is TabKey {
  return t != null && (TAB_KEYS as string[]).includes(t)
}

// Strict YYYY-MM-DD: shape + a real calendar date (the round-trip rejects
// overflow like month 13 / day 32 that the Date ctor silently rolls over).
function parseISODate(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return s
}

// A DateRange from a (from, to) param pair ONLY when both are valid ISO and
// from <= to. Any missing/malformed/inverted pair -> undefined, so Compare
// falls back to its own thisMonth/lastMonth defaults. Never throws.
function rangeFromParams(from: string | null, to: string | null): DateRange | undefined {
  const f = parseISODate(from)
  const t = parseISODate(to)
  if (!f || !t || f > t) return undefined
  return { from: f, to: t }
}

export default function Analytics() {
  const [params] = useSearchParams()
  // Multi-account slice — the switcher's scope; all three fetches below
  // carry it and re-fire on change (no reload).
  const { scope } = useAccountScope()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [reports, setReports] = useState<ReportsData | null>(null)
  const [trades, setTrades] = useState<TradeListRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  // The initial tab can be deep-linked (?tab=compare); only a real TabKey is
  // honored, anything else falls back to 'overview'. The TabBar still drives
  // setTab after mount - the param only SEEDS the initial value, never locks it.
  const [tab, setTab] = useState<TabKey>(() => {
    const t = params.get('tab')
    return isValidTabKey(t) ? t : 'overview'
  })
  // Optional deep-linked Compare periods (from the Calendar compare card),
  // parsed from the URL. Absent/invalid -> undefined, so Compare uses its own
  // defaults. Stable per location, so this is mount-stable.
  const initialRangeA = useMemo(() => rangeFromParams(params.get('aFrom'), params.get('aTo')), [params])
  const initialRangeB = useMemo(() => rangeFromParams(params.get('bFrom'), params.get('bTo')), [params])

  useEffect(() => {
    let cancelled = false
    setData(null)
    setReports(null)
    setTrades([])
    // Trades list is needed by the v0.1.5 Tier Performance card. We fetch
    // it alongside analytics + reports; a failure on tradesList shouldn't
    // block the rest of the page so we swallow to [].
    Promise.all([
      ipc.analyticsGet(scope),
      ipc.reportsGet(scope).catch(() => null),
      ipc.tradesList({ accountScope: scope }).catch(() => [] as TradeListRow[]),
    ])
      .then(([analytics, reportsData, tradesList]) => {
        if (cancelled) return
        setData(analytics)
        setReports(reportsData)
        setTrades(tradesList)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [scope])

  if (err) {
    return (
      <PageShell title="Analytics" subtitle="Deep dive into your trading.">
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary">
          <AlertCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-loss">
              Failed to load analytics
            </div>
            <div className="mt-1">{err}</div>
          </div>
        </div>
      </PageShell>
    )
  }

  if (!data) {
    return (
      <PageShell title="Analytics" subtitle="Deep dive into your trading.">
        <div className="space-y-4">
          <Skeleton className="h-[44px]" />
          <Skeleton className="h-[260px]" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-[180px]" />
            <Skeleton className="h-[180px]" />
          </div>
        </div>
      </PageShell>
    )
  }

  if (data.trade_count === 0) {
    return (
      <PageShell title="Analytics" subtitle="Deep dive into your trading.">
        <div className="empty-grid rounded-lg border border-border-subtle bg-bg-2 px-6 py-16 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.06]">
            <PieChart size={36} strokeWidth={1.5} className="text-gold" />
          </div>
          <div className="text-lg font-semibold text-fg-primary">
            Nothing to analyze yet.
          </div>
          <div className="mx-auto mt-2 max-w-md text-sm text-fg-tertiary">
            Import some round trips and the equity curve, drawdown, streaks,
            and momentum patterns will populate here.
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

  return (
    <PageShell
      title="Analytics"
      subtitle={
        // TA definition-drift fix (2026-07-03) — the colliding "analyzed"
        // retires; the all-time population is explicit. This figure is one
        // static all-time fact shared by every tab — never window- or
        // tab-aware by ruling.
        <span>
          <span className="font-mono text-text">{int(data.trade_count)}</span>{' '}
          round trip{data.trade_count === 1 ? '' : 's'} — all time
        </span>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 overflow-x-auto">
            <TabBar tabs={TABS} active={tab} onChange={setTab} />
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border-subtle bg-bg-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
            title="Print this tab"
          >
            <Printer size={12} strokeWidth={2} />
            Print report
          </button>
        </div>

        <div key={tab} className="animate-fade-in">
          {tab === 'overview' && <OverviewTab data={data} reports={reports} trades={trades} />}
          {tab === 'compare' && (
            <AnalyticsCompareTab
              trades={trades}
              initialRangeA={initialRangeA}
              initialRangeB={initialRangeB}
            />
          )}
          {tab === 'performance' && (
            <PerformanceTab data={data} reports={reports} trades={trades} />
          )}
          {tab === 'execution' && (
            <ExecutionTab data={data} reports={reports} />
          )}
          {tab === 'momentum' && (
            <MomentumTab data={data} dayOfWeek={reports?.byDayOfWeek ?? []} />
          )}
          {tab === 'psychology' && <PsychologyTab data={data} />}
          {tab === 'quality' && reports && <AnalyticsQualityTab reports={reports} />}
          {tab === 'symbols' && <SymbolsTab data={data} reports={reports} />}
          {tab === 'technicals' && <TechnicalsTab allTimeTotal={data.trade_count} />}
        </div>
      </div>
    </PageShell>
  )
}
