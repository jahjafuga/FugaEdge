// Technical Analysis tab. Commit 5 (Session 4) landed the filter bar with
// hot, renderer-only filter state (date preset + range, ticker, playbook,
// 1M/5M timeframe). Commit 6b wires it to live data: it fetches trades +
// technicals via ipc.listTradesWithTechnicals (refetching only on date-range
// change), then derives the playbook options, renderer-side filtered rows,
// and the Header Strip stats — all pure, via distinctPlaybooks / filterRows /
// computeHeaderStrip. The Header Strip is the first of the tab's sections;
// the remaining aggregation sections (MACD state grid, VWAP/EMA distance,
// combined signal reads, time-of-day) land in Sessions 5+.

import { useEffect, useMemo, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { distinctPlaybooks } from '@/core/performance/filters'
import { computeHeaderStrip } from '@/core/technicals/headerStrip'
import { filterRows } from '@/core/technicals/filterRows'
import { rangeForDatePreset } from '@/core/technicals/datePreset'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import Skeleton from '@/components/ui/Skeleton'
import { AlertCircle } from 'lucide-react'
import TechnicalsFilterBar, {
  type TechnicalsFilters,
} from './technicals/TechnicalsFilterBar'
import HeaderStripCards from './technicals/HeaderStripCards'

export default function TechnicalsTab() {
  // Existing filter state — unchanged from Commit 5.
  const [filters, setFilters] = useState<TechnicalsFilters>(() => ({
    datePreset: '30d',
    range: rangeForDatePreset('30d'),
    ticker: '',
    playbookName: null,
    timeframe: '1m',
  }))

  // Data fetch state. Mirrors the Analytics page convention: null = loading,
  // [] = loaded-empty (or error fallback), populated = loaded.
  const [rows, setRows] = useState<TradeWithTechnicalsRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Fetch on mount + on date-range change only. The cancelled-flag idiom is
  // lifted from src/pages/Analytics.tsx, single-call version. Ticker /
  // playbook / timeframe edits are renderer-side (the useMemos below
  // re-derive without a refetch) — the locked design from Commit 6 planning.
  useEffect(() => {
    let cancelled = false
    setRows(null)
    setErr(null)

    const opts = filters.range
      ? { from: filters.range.from, to: filters.range.to }
      : {}

    ipc
      .listTradesWithTechnicals(opts)
      .then((result) => {
        if (cancelled) return
        setRows(result)
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setErr(e.message)
          setRows([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [filters.range])

  // Playbook dropdown options — distinct names across the fetched set.
  const playbookOptions = useMemo(
    () => distinctPlaybooks(rows ?? []),
    [rows],
  )

  // Renderer-side filter (ticker + playbook) over the fetched rows.
  const filteredRows = useMemo(
    () => filterRows(rows ?? [], filters.ticker, filters.playbookName),
    [rows, filters.ticker, filters.playbookName],
  )

  // Header Strip aggregation for the toggled timeframe.
  const stats = useMemo(
    () => computeHeaderStrip(filteredRows, filters.timeframe),
    [filteredRows, filters.timeframe],
  )

  return (
    <div className="space-y-6">
      <TechnicalsFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        playbookOptions={playbookOptions}
        excludedCount={rows === null ? 0 : stats.excluded}
      />
      {/* Body: skeleton while loading, alert on error, cards on success. */}
      {err ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary"
        >
          <AlertCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-loss">
              Failed to load technicals
            </div>
            <div className="mt-1">{err}</div>
          </div>
        </div>
      ) : rows === null ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-[120px]" />
        </div>
      ) : (
        <HeaderStripCards stats={stats} />
      )}
    </div>
  )
}
