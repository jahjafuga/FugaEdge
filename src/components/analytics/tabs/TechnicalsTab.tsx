// Technical Analysis tab. Commit 5 (Session 4) landed the filter bar; Commit
// 6b wired the Header Strip to live data. Session 5a.3 adds the band pattern
// (spec §B): two SectionHeaders — "Indicator alignment" (Section 1, the Header
// Strip) and "MACD state" (Section 2, the 4-bucket grid) — with the MACD
// section's unclassified count riding its header's `right` slot. Data flows
// from ipc.listTradesWithTechnicals (refetch only on date-range change) through
// the pure filterRows → computeHeaderStrip / computeMacdBuckets pipeline.
// Session 5b.1.3 made Section 2 interactive — clicking a bucket expands an
// accordion with its sortable trade table (rowsForBucket), so filteredRows and
// timeframe now thread one level deeper into MacdStateGrid. Remaining sections
// (VWAP/EMA distance, combined signal reads, time-of-day) land in later sessions.

import { useEffect, useMemo, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { distinctPlaybooks } from '@/core/performance/filters'
import { computeHeaderStrip } from '@/core/technicals/headerStrip'
import { computeMacdBuckets } from '@/core/technicals/macdBuckets'
import { computeVwapBuckets } from '@/core/technicals/vwapBuckets'
import { filterRows } from '@/core/technicals/filterRows'
import { rangeForDatePreset } from '@/core/technicals/datePreset'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import Skeleton from '@/components/ui/Skeleton'
import SectionHeader from '@/components/ui/SectionHeader'
import { AlertCircle } from 'lucide-react'
import TechnicalsFilterBar, {
  type TechnicalsFilters,
} from './technicals/TechnicalsFilterBar'
import HeaderStripCards from './technicals/HeaderStripCards'
import MacdStateGrid from './technicals/MacdStateGrid'
import VwapDistanceBand from './technicals/VwapDistanceBand'
import UnclassifiedChip from './technicals/UnclassifiedChip'

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

  // Header Strip aggregation (Section 1) for the toggled timeframe.
  const stats = useMemo(
    () => computeHeaderStrip(filteredRows, filters.timeframe),
    [filteredRows, filters.timeframe],
  )

  // MACD State 4-bucket aggregation (Section 2) for the toggled timeframe.
  const bucketStats = useMemo(
    () => computeMacdBuckets(filteredRows, filters.timeframe),
    [filteredRows, filters.timeframe],
  )

  // VWAP distance 7-bucket aggregation (Section 3) for the toggled timeframe.
  const vwapStats = useMemo(
    () => computeVwapBuckets(filteredRows, filters.timeframe),
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
      {/* Body: skeleton while loading, alert on error, the two section bands
          on success. Both branches keep the SectionHeaders mounted so the
          gold-underline dividers don't shift when data arrives. */}
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
        <>
          <SectionHeader
            title="Indicator alignment"
            description="How often did your entries line up with your stack?"
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Skeleton className="h-[120px]" />
            <Skeleton className="h-[120px]" />
            <Skeleton className="h-[120px]" />
            <Skeleton className="h-[120px]" />
          </div>

          <SectionHeader
            title="MACD state"
            description="Which MACD configuration was on the chart when you entered?"
          />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-[220px]" />
            <Skeleton className="h-[220px]" />
            <Skeleton className="h-[220px]" />
            <Skeleton className="h-[220px]" />
          </div>

          <SectionHeader
            title="VWAP distance"
            description="Where was price relative to VWAP when you entered?"
          />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-[52px]" />
            <Skeleton className="h-[52px]" />
            <Skeleton className="h-[52px]" />
            <Skeleton className="h-[52px]" />
            <Skeleton className="h-[52px]" />
            <Skeleton className="h-[52px]" />
            <Skeleton className="h-[52px]" />
          </div>
        </>
      ) : (
        <>
          <SectionHeader
            title="Indicator alignment"
            description="How often did your entries line up with your stack?"
          />
          <HeaderStripCards stats={stats} />

          <SectionHeader
            title="MACD state"
            description="Which MACD configuration was on the chart when you entered?"
            right={
              bucketStats.unclassified > 0 ? (
                <UnclassifiedChip count={bucketStats.unclassified} />
              ) : undefined
            }
          />
          <MacdStateGrid
            stats={bucketStats}
            filteredRows={filteredRows}
            timeframe={filters.timeframe}
          />

          <SectionHeader
            title="VWAP distance"
            description="Where was price relative to VWAP when you entered?"
            right={
              vwapStats.unclassified > 0 ? (
                <UnclassifiedChip count={vwapStats.unclassified} />
              ) : undefined
            }
          />
          <VwapDistanceBand
            stats={vwapStats}
            filteredRows={filteredRows}
            timeframe={filters.timeframe}
          />
        </>
      )}
    </div>
  )
}
