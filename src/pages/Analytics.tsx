import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, PieChart, Upload, Printer } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Skeleton from '@/components/ui/Skeleton'
import TabBar from '@/components/ui/TabBar'
import OverviewTab from '@/components/analytics/tabs/OverviewTab'
import PerformanceTab from '@/components/analytics/tabs/PerformanceTab'
import ExecutionTab from '@/components/analytics/tabs/ExecutionTab'
import MomentumTab from '@/components/analytics/tabs/MomentumTab'
import PsychologyTab from '@/components/analytics/tabs/PsychologyTab'
import SymbolsTab from '@/components/analytics/tabs/SymbolsTab'
import TechnicalsTab from '@/components/analytics/tabs/TechnicalsTab'
import { ipc } from '@/lib/ipc'
import { int } from '@/lib/format'
import type { AnalyticsData } from '@shared/analytics-types'
import type { ReportsData } from '@shared/reports-types'
import type { TradeListRow } from '@shared/trades-types'

type TabKey =
  | 'overview'
  | 'performance'
  | 'execution'
  | 'momentum'
  | 'psychology'
  | 'symbols'
  | 'technicals'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'performance', label: 'Performance' },
  { key: 'execution', label: 'Execution' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'psychology', label: 'Psychology' },
  { key: 'symbols', label: 'Symbols' },
  { key: 'technicals', label: 'Technicals' },
]

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [reports, setReports] = useState<ReportsData | null>(null)
  const [trades, setTrades] = useState<TradeListRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')

  useEffect(() => {
    let cancelled = false
    setData(null)
    setReports(null)
    setTrades([])
    // Trades list is needed by the v0.1.5 Tier Performance card. We fetch
    // it alongside analytics + reports; a failure on tradesList shouldn't
    // block the rest of the page so we swallow to [].
    Promise.all([
      ipc.analyticsGet(),
      ipc.reportsGet().catch(() => null),
      ipc.tradesList().catch(() => [] as TradeListRow[]),
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
  }, [])

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
        <span>
          <span className="font-mono text-text">{int(data.trade_count)}</span>{' '}
          round trip{data.trade_count === 1 ? '' : 's'} analyzed — six tabs of
          deep stats.
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
          {tab === 'overview' && <OverviewTab data={data} reports={reports} />}
          {tab === 'performance' && (
            <PerformanceTab data={data} reports={reports} trades={trades} />
          )}
          {tab === 'execution' && (
            <ExecutionTab data={data} reports={reports} />
          )}
          {tab === 'momentum' && <MomentumTab data={data} />}
          {tab === 'psychology' && <PsychologyTab data={data} />}
          {tab === 'symbols' && <SymbolsTab data={data} reports={reports} />}
          {tab === 'technicals' && <TechnicalsTab />}
        </div>
      </div>
    </PageShell>
  )
}
