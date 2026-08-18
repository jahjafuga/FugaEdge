import { useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import SectionHeader from '@/components/ui/SectionHeader'
import EquityChart from '@/components/analytics/EquityChart'
import OverviewTiles from '@/components/analytics/OverviewTiles'
import NormalCharts from '@/components/reports/overview/NormalCharts'
import AnalyticsFilterBar, {
  rangeForQuickKey,
  quickKeyLabel,
  type QuickKey,
} from '@/components/analytics/AnalyticsFilterBar'
import {
  computeCumulativePnL,
  computeDailyPnL,
  computeDailyVolume,
  computeDailyWinRate,
  emptyFilters,
  type OverviewFilters,
} from '@/core/performance'
import {
  computeOverviewSnapshot,
  type OverviewSnapshot,
} from '@/core/performance/overviewSnapshot'
import { longDate, money, pnlClass, signed } from '@/lib/format'
import type { TradeListRow } from '@shared/trades-types'

// v0.2.7: this tab no longer takes the AnalyticsData or ReportsData payloads. Every
// widget on it now derives from the filtered trade list, so the pre-aggregated,
// UNFILTERED snapshots had nothing left to contribute — keeping them as props would
// have invited someone to reach for a number the filters cannot reach.
interface OverviewTabProps {
  /** Full trade list (already fetched by the Analytics page). Open positions are
   *  dropped to match the Reports -> Overview source. */
  trades: TradeListRow[]
}

export default function OverviewTab({ trades }: OverviewTabProps) {

  // ── Re-homed daily dashboard (from Reports → Overview) ──────────────────
  // Open positions are dropped so the per-day series match the Reports
  // snapshot's source exactly.
  const dashTrades = useMemo(() => trades.filter((t) => !t.is_open), [trades])
  // PAGE-LEVEL filters (v0.2.7): every widget on this tab — equity curve, tiles,
  // best/worst day, drawdown — derives from ONE filtered set, so the chart and the
  // number beside it can never describe different books. Default is ALL, not 7d: a
  // filter that silently hides most of the book on arrival is not a default.
  const [filters, setFilters] = useState<OverviewFilters>(() => ({
    ...emptyFilters(),
    range: rangeForQuickKey('all'),
  }))
  const [quick, setQuick] = useState<QuickKey>('all')
  const snapshot = useMemo(
    () => computeOverviewSnapshot(dashTrades, filters),
    [dashTrades, filters],
  )
  const { best, worst } = { best: snapshot.metrics.bestDay, worst: snapshot.metrics.worstDay }
  // The snapshot already applied the filters — reuse its result rather than running
  // applyFilters a second time over the same inputs.
  const filtered = snapshot.trades
  const daily = useMemo(() => computeDailyPnL(filtered, filters.range), [filtered, filters.range])
  const cumulative = useMemo(
    () => computeCumulativePnL(filtered, filters.range),
    [filtered, filters.range],
  )
  const volume = useMemo(
    () => computeDailyVolume(filtered, filters.range),
    [filtered, filters.range],
  )
  const winRateDaily = useMemo(
    () => computeDailyWinRate(filtered, filters.range),
    [filtered, filters.range],
  )
  const rangeLabel = quickKeyLabel(quick)

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Overview"
        description="The big picture — equity curve, the four numbers that matter, and your bookends."
      />

      <Card title="Equity curve" subtitle="Cumulative net P&L. Max drawdown highlighted in red.">
        <EquityChart equity={snapshot.curve} maxDrawdown={snapshot.drawdown} />
        {snapshot.drawdown && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span className="text-fg-tertiary">
              Peak{' '}
              <span className={`font-mono ${pnlClass(snapshot.drawdown.peak_value)}`}>
                {signed(snapshot.drawdown.peak_value)}
              </span>{' '}
              on {longDate(snapshot.drawdown.peak_date)}
            </span>
            <span className="text-fg-tertiary">
              Trough{' '}
              <span className={`font-mono ${pnlClass(snapshot.drawdown.trough_value)}`}>
                {signed(snapshot.drawdown.trough_value)}
              </span>{' '}
              on {longDate(snapshot.drawdown.trough_date)}
            </span>
          </div>
        )}
      </Card>

      {/* v0.2.7: twelve tiles, all from the SAME filtered snapshot as the curve
          above. Six ratio tiles carry a sample guard keyed to their own denominator
          — see OverviewTiles. Net P&L lost its trade-count subtitle; Trade Count
          owns that now. */}
      <OverviewTiles metrics={snapshot.metrics} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Best day vs worst day" subtitle="Your single-session bookends.">
          <div className="grid grid-cols-2 gap-3">
            <BookendBlock label="Best day" day={best} />
            <BookendBlock label="Worst day" day={worst} />
          </div>
        </Card>

        <Card title="Drawdown" subtitle="Biggest peak-to-trough on the equity curve.">
          {snapshot.drawdown ? (
            <DrawdownSummary
              dd={snapshot.drawdown}
              equity={snapshot.curve}
            />
          ) : (
            <div className="rounded-md border border-border-subtle/40 bg-bg-1/40 p-4 text-sm text-fg-tertiary">
              No drawdown recorded yet.
            </div>
          )}
        </Card>
      </div>

      {/* ── Daily breakdown — re-homed from Reports → Overview ──────────────
          A distinct "dig deeper" section below the snapshot: the filterable
          day-by-day charts. Everything above (equity curve, KPIs, bookends,
          drawdown) is untouched. */}
      <div className="pt-2">
        <SectionHeader
          title="Daily breakdown"
          description="Filter by symbol, playbook, side, and more — then read your P&L, cumulative, volume, and win rate day by day."
        />
      </div>
      <AnalyticsFilterBar
        trades={dashTrades}
        filters={filters}
        onFiltersChange={setFilters}
        quick={quick}
        onQuickChange={setQuick}
      />
      <NormalCharts
        daily={daily}
        cumulative={cumulative}
        volume={volume}
        winRate={winRateDaily}
        rangeLabel={rangeLabel}
      />
    </div>
  )
}

function BookendBlock({
  label,
  day,
}: {
  label: string
  // PeriodMetrics' DayPnL — { date, pnl }. The old local DayPnl carried net_pnl and
  // was the third copy of best/worst-day; it went with the duplicate that built it.
  day: NonNullable<OverviewSnapshot['metrics']['bestDay']> | null
}) {
  const pnl = day?.pnl ?? 0
  const borderColor =
    pnl > 0 ? 'border-win/30' : pnl < 0 ? 'border-loss/30' : 'border-border-subtle/60'
  return (
    <div className={`rounded-md border ${borderColor} bg-bg-1/40 p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      {day ? (
        <>
          <div className={`mt-1 font-mono text-xl font-medium ${pnlClass(day.pnl)}`}>
            {signed(day.pnl)}
          </div>
          <div className="mt-1 text-[11px] text-fg-secondary">{longDate(day.date)}</div>
        </>
      ) : (
        <div className="mt-2 font-mono text-lg text-fg-tertiary">—</div>
      )}
    </div>
  )
}

function DrawdownSummary({
  dd,
  equity,
}: {
  dd: NonNullable<OverviewSnapshot['drawdown']>
  equity: OverviewSnapshot['curve']
}) {
  // Tiny sparkline of the drawdown segment from peak through trough.
  const peakIdx = equity.findIndex((p) => p.date === dd.peak_date)
  const troughIdx = equity.findIndex((p) => p.date === dd.trough_date)
  const slice =
    peakIdx >= 0 && troughIdx >= peakIdx
      ? equity.slice(peakIdx, troughIdx + 1)
      : []
  const sparkW = 220
  const sparkH = 40
  let path = ''
  if (slice.length > 1) {
    const min = Math.min(...slice.map((p) => p.cumulative))
    const max = Math.max(...slice.map((p) => p.cumulative))
    const range = max - min || 1
    path = slice
      .map((p, i) => {
        const x = (i / (slice.length - 1)) * sparkW
        const y =
          sparkH - ((p.cumulative - min) / range) * sparkH
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Amount</div>
          <div className="mt-0.5 font-mono text-xl font-medium text-loss">
            −{money(dd.amount)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">%</div>
          <div className="mt-0.5 font-mono text-xl font-medium text-loss">
            {dd.percent == null ? '—' : `−${(dd.percent * 100).toFixed(1)}%`}
          </div>
        </div>
      </div>
      {path && (
        <svg
          width={sparkW}
          height={sparkH}
          viewBox={`0 0 ${sparkW} ${sparkH}`}
          className="w-full"
          aria-hidden="true"
        >
          <path
            d={path}
            fill="none"
            stroke="#f87171"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <div className="text-[11px] text-fg-secondary">
        Peak {longDate(dd.peak_date)} → Trough {longDate(dd.trough_date)}
        {dd.recovered && dd.recovery_date && <> · recovered {longDate(dd.recovery_date)}</>}
        {!dd.recovered && <> · not recovered</>}
      </div>
    </div>
  )
}
