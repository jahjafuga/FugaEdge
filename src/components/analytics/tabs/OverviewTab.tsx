import { useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import SectionHeader from '@/components/ui/SectionHeader'
import EquityChart from '@/components/analytics/EquityChart'
import KpiCard from '@/components/analytics/KpiCard'
import NormalCharts from '@/components/reports/overview/NormalCharts'
import AnalyticsFilterBar, {
  rangeForQuickKey,
  quickKeyLabel,
  type QuickKey,
} from '@/components/analytics/AnalyticsFilterBar'
import {
  applyFilters,
  computeCumulativePnL,
  computeDailyPnL,
  computeDailyVolume,
  computeDailyWinRate,
  emptyFilters,
  type OverviewFilters,
} from '@/core/performance'
import { int, longDate, money, pnlClass, signed } from '@/lib/format'
import type { AnalyticsData } from '@shared/analytics-types'
import type { ReportsData } from '@shared/reports-types'
import type { TradeListRow } from '@shared/trades-types'

interface OverviewTabProps {
  data: AnalyticsData
  reports: ReportsData | null
  /** Full trade list (already fetched by the Analytics page). Powers the
   *  re-homed daily dashboard below the snapshot; open positions are dropped
   *  to match the Reports → Overview source. */
  trades: TradeListRow[]
}

interface DayPnl {
  date: string
  net_pnl: number
}

function bestAndWorstDay(equity: AnalyticsData['equity']): {
  best: DayPnl | null
  worst: DayPnl | null
} {
  let best: DayPnl | null = null
  let worst: DayPnl | null = null
  for (const p of equity) {
    if (p.daily_pnl === 0) continue
    if (!best || p.daily_pnl > best.net_pnl) {
      best = { date: p.date, net_pnl: p.daily_pnl }
    }
    if (!worst || p.daily_pnl < worst.net_pnl) {
      worst = { date: p.date, net_pnl: p.daily_pnl }
    }
  }
  return { best, worst }
}

export default function OverviewTab({ data, reports, trades }: OverviewTabProps) {
  const { best, worst } = useMemo(() => bestAndWorstDay(data.equity), [data.equity])
  const netPnl = data.feeImpact.total_net_pnl

  // ── Re-homed daily dashboard (from Reports → Overview) ──────────────────
  // Open positions are dropped so the per-day series match the Reports
  // snapshot's source exactly; the equity/KPI snapshot above keeps its own
  // `data` source untouched.
  const dashTrades = useMemo(() => trades.filter((t) => !t.is_open), [trades])
  const [filters, setFilters] = useState<OverviewFilters>(() => ({
    ...emptyFilters(),
    range: rangeForQuickKey('7d'),
  }))
  const [quick, setQuick] = useState<QuickKey>('7d')
  const filtered = useMemo(() => applyFilters(dashTrades, filters), [dashTrades, filters])
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
  const profitFactor = reports?.fullStats.profit_factor ?? null
  const winRate = (() => {
    const w = reports?.fullStats.winners ?? 0
    const l = reports?.fullStats.losers ?? 0
    const decided = w + l
    return decided > 0 ? w / decided : null
  })()
  const expectancy = data.r.expectancy

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Overview"
        description="The big picture — equity curve, the four numbers that matter, and your bookends."
      />

      <Card title="Equity curve" subtitle="Cumulative net P&L. Max drawdown highlighted in red.">
        <EquityChart equity={data.equity} maxDrawdown={data.maxDrawdown} />
        {data.maxDrawdown && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span className="text-fg-tertiary">
              Peak{' '}
              <span className={`font-mono ${pnlClass(data.maxDrawdown.peak_value)}`}>
                {signed(data.maxDrawdown.peak_value)}
              </span>{' '}
              on {longDate(data.maxDrawdown.peak_date)}
            </span>
            <span className="text-fg-tertiary">
              Trough{' '}
              <span className={`font-mono ${pnlClass(data.maxDrawdown.trough_value)}`}>
                {signed(data.maxDrawdown.trough_value)}
              </span>{' '}
              on {longDate(data.maxDrawdown.trough_date)}
            </span>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Net P&L"
          value={signed(netPnl)}
          tone={netPnl > 0 ? 'green' : netPnl < 0 ? 'red' : 'gold'}
          detail={`${int(data.trade_count)} trades`}
        />
        <KpiCard
          label="Win rate"
          value={winRate == null ? '—' : `${(winRate * 100).toFixed(1)}%`}
          tone="gold"
          detail={
            reports
              ? `${int(reports.fullStats.winners)} W / ${int(reports.fullStats.losers)} L`
              : '—'
          }
        />
        <KpiCard
          label="Expectancy"
          value={expectancy == null ? '—' : `${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)}R`}
          tone={expectancy == null ? 'gold' : expectancy >= 0 ? 'green' : 'red'}
          detail={`${int(data.r.coverage)}/${int(data.r.total_trades)} with planned risk`}
        />
        <KpiCard
          label="Profit factor"
          value={
            profitFactor == null
              ? 'N/A'
              : !Number.isFinite(profitFactor)
                ? '∞'
                : profitFactor.toFixed(2)
          }
          tone="gold"
          detail="Gross wins ÷ gross losses"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Best day vs worst day" subtitle="Your single-session bookends.">
          <div className="grid grid-cols-2 gap-3">
            <BookendBlock label="Best day" day={best} />
            <BookendBlock label="Worst day" day={worst} />
          </div>
        </Card>

        <Card title="Drawdown" subtitle="Biggest peak-to-trough on the equity curve.">
          {data.maxDrawdown ? (
            <DrawdownSummary
              dd={data.maxDrawdown}
              equity={data.equity}
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
  day: DayPnl | null
}) {
  const pnl = day?.net_pnl ?? 0
  const borderColor =
    pnl > 0 ? 'border-win/30' : pnl < 0 ? 'border-loss/30' : 'border-border-subtle/60'
  return (
    <div className={`rounded-md border ${borderColor} bg-bg-1/40 p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      {day ? (
        <>
          <div className={`mt-1 font-mono text-xl font-medium ${pnlClass(day.net_pnl)}`}>
            {signed(day.net_pnl)}
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
  dd: NonNullable<AnalyticsData['maxDrawdown']>
  equity: AnalyticsData['equity']
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
    const min = Math.min(...slice.map((p) => p.cumulative_net_pnl))
    const max = Math.max(...slice.map((p) => p.cumulative_net_pnl))
    const range = max - min || 1
    path = slice
      .map((p, i) => {
        const x = (i / (slice.length - 1)) * sparkW
        const y =
          sparkH - ((p.cumulative_net_pnl - min) / range) * sparkH
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
