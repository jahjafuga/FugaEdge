import { useEffect, useMemo, useState } from 'react'
import type { TradeListRow } from '@shared/trades-types'
import { ipc } from '@/lib/ipc'
import {
  applyFilters,
  computeCumulativePnL,
  computeDailyPnL,
  computeDailyVolume,
  computeDailyWinRate,
  emptyFilters,
  rangeForPreset,
  rangeForQuick,
  type DateRange,
  type OverviewFilters,
  type QuickRange,
} from '@/core/performance'
import FilterBar from './overview/FilterBar'
import NormalCharts from './overview/NormalCharts'
import CompareView from './overview/CompareView'

interface OverviewTabProps {
  trades: TradeListRow[]
}

// REPORTS → OVERVIEW
//
// Replaces the previous all-time stat-grid Overview with a Ross-Cameron /
// Tradervue-style dashboard: filterable date range + symbol/playbook/etc,
// 4 daily charts (P&L, cumulative, volume, win %), and a period-vs-period
// compare mode with headline cards, side-by-side bar + overlay line,
// breakdown comparisons, and auto-insights.
//
// All compute is pure renderer-side via /src/core/performance — no extra
// IPC calls beyond the trades list (already fetched by the parent Reports
// page) and the per-day sentiment map for the "By Market Sentiment"
// breakdown.

export default function OverviewTab({ trades }: OverviewTabProps) {
  const [filters, setFilters] = useState<OverviewFilters>(() => ({
    ...emptyFilters(),
    range: rangeForQuick('90d'),
  }))
  const [quick, setQuick] = useState<QuickRange>('90d')
  const [compareOn, setCompareOn] = useState(false)
  const [rangeA, setRangeA] = useState<DateRange>(() => rangeForPreset('thisMonth'))
  const [rangeB, setRangeB] = useState<DateRange>(() => rangeForPreset('lastMonth'))

  // Sentiment map keyed by date — needed for the "By Market Sentiment"
  // compare breakdown card. Fetched once; refreshes when trades reload.
  const [sentimentByDate, setSentimentByDate] = useState<Map<string, number | null>>(new Map())
  useEffect(() => {
    let cancelled = false
    ipc
      .sessionListAll()
      .then((rows) => {
        if (cancelled) return
        const m = new Map<string, number | null>()
        for (const r of rows) m.set(r.date, r.sentiment)
        setSentimentByDate(m)
      })
      .catch(() => {
        // Sentiment is optional — silently fall back to an empty map so the
        // breakdown card just shows nothing instead of crashing.
        if (!cancelled) setSentimentByDate(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => applyFilters(trades, filters), [trades, filters])

  const daily = useMemo(
    () => computeDailyPnL(filtered, filters.range),
    [filtered, filters.range],
  )
  const cumulative = useMemo(
    () => computeCumulativePnL(filtered, filters.range),
    [filtered, filters.range],
  )
  const volume = useMemo(
    () => computeDailyVolume(filtered, filters.range),
    [filtered, filters.range],
  )
  const winRate = useMemo(
    () => computeDailyWinRate(filtered, filters.range),
    [filtered, filters.range],
  )

  const rangeLabel = labelForQuick(quick, filters.range)

  return (
    <div className="space-y-4">
      <FilterBar
        trades={trades}
        filters={filters}
        onFiltersChange={setFilters}
        quick={quick}
        onQuickChange={setQuick}
        compareOn={compareOn}
        onToggleCompare={() => setCompareOn((v) => !v)}
      />

      {compareOn ? (
        // Compare mode operates on the FULL trade set (period ranges
        // override the filter bar's date window). Other filter dimensions
        // (symbol, playbook, side, etc.) still apply.
        <CompareView
          trades={applyFilters(trades, { ...filters, range: null })}
          sentimentByDate={sentimentByDate}
          rangeA={rangeA}
          rangeB={rangeB}
          onRangeChange={(which, range) => {
            if (which === 'A') setRangeA(range)
            else setRangeB(range)
          }}
        />
      ) : (
        <NormalCharts
          daily={daily}
          cumulative={cumulative}
          volume={volume}
          winRate={winRate}
          rangeLabel={rangeLabel}
        />
      )}
    </div>
  )
}

function labelForQuick(quick: QuickRange, range: DateRange | null): string {
  if (quick === '30d') return '30 days'
  if (quick === '60d') return '60 days'
  if (quick === '90d') return '90 days'
  if (quick === 'ytd') return 'YTD'
  if (quick === 'all') return 'All time'
  if (range) return 'Custom'
  return ''
}
