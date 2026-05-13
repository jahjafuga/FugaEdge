import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, BarChart3, Upload } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Skeleton from '@/components/ui/Skeleton'
import TabBar from '@/components/ui/TabBar'
import OverviewTab from '@/components/reports/OverviewTab'
import BreakdownTab from '@/components/reports/BreakdownTab'
import VolumeTab from '@/components/reports/VolumeTab'
import QualityTab from '@/components/reports/QualityTab'
import { ipc } from '@/lib/ipc'
import { int } from '@/lib/format'
import type { ReportsData } from '@shared/reports-types'
import type { TradeListRow } from '@shared/trades-types'

type TabKey = 'overview' | 'breakdown' | 'volume' | 'quality'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'breakdown', label: 'Breakdown' },
  { key: 'volume', label: 'Volume' },
  { key: 'quality', label: 'Quality' },
]

export default function Reports() {
  const [data, setData] = useState<ReportsData | null>(null)
  const [trades, setTrades] = useState<TradeListRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')

  useEffect(() => {
    let cancelled = false
    // Aggregate stats (BreakdownTab, VolumeTab, QualityTab still consume
    // these). The Overview tab also needs the raw trade list to filter +
    // compare client-side per ARCHITECTURE.md.
    Promise.all([ipc.reportsGet(), ipc.tradesList()])
      .then(([d, t]) => {
        if (cancelled) return
        setData(d)
        setTrades(t.filter((row) => !row.is_open))
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
      <PageShell title="Reports" subtitle="Performance breakdowns and system quality.">
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary">
          <AlertCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-loss">
              Failed to load reports
            </div>
            <div className="mt-1">{err}</div>
          </div>
        </div>
      </PageShell>
    )
  }

  if (!data || !trades) {
    return (
      <PageShell title="Reports" subtitle="Performance breakdowns and system quality.">
        <div className="space-y-4">
          <Skeleton className="h-[44px]" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px]" />
            ))}
          </div>
          <Skeleton className="h-[300px]" />
        </div>
      </PageShell>
    )
  }

  if (data.trade_count === 0) {
    return (
      <PageShell title="Reports" subtitle="Performance breakdowns and system quality.">
        <div className="empty-grid rounded-lg border border-border-subtle bg-bg-2 px-6 py-16 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.06]">
            <BarChart3 size={36} strokeWidth={1.5} className="text-gold" />
          </div>
          <div className="text-lg font-semibold text-fg-primary">
            No trades to report on yet.
          </div>
          <div className="mx-auto mt-2 max-w-md text-sm text-fg-tertiary">
            Import a Trades.csv on the Import page and reports will populate automatically.
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
      title="Reports"
      subtitle={`${int(data.trade_count)} round trip${data.trade_count === 1 ? '' : 's'} analyzed.`}
    >
      <div className="space-y-5">
        <TabBar tabs={TABS} active={tab} onChange={setTab} />

        {tab === 'overview' && <OverviewTab trades={trades} />}
        {tab === 'breakdown' && <BreakdownTab data={data} />}
        {tab === 'volume' && <VolumeTab data={data} />}
        {tab === 'quality' && <QualityTab data={data} />}
      </div>
    </PageShell>
  )
}
