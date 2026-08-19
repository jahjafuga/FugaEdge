import { useEffect, useMemo, useRef, useState } from 'react'
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
import {
  isNarrowedBeyondRange,
  overviewCountLine,
  overviewScope,
} from '@/core/performance/overviewScopeLabel'
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
  // ONE scope vocabulary for the whole tab. The chart titles used to name the date
  // range and nothing else, so any of the six non-date filters could narrow the data
  // under a heading still claiming "All time". overviewScope decides what the active
  // filter honestly permits the labels to say; the count line beside the filter states
  // the population outright. See src/core/performance/overviewScopeLabel.ts.
  const narrowed = isNarrowedBeyondRange(filters)
  const rangeLabel = overviewScope({ rangeLabel: quickKeyLabel(quick), narrowed })
  // STUCK DETECTION. There is no CSS selector for "a sticky element is currently
  // pinned", so a zero-height sentinel sits directly above the bar: while it is in
  // view the bar is resting, and the moment it scrolls out the bar is pinned with
  // content moving underneath. That is what steps the shadow from resting to lifted,
  // and that step is the only thing on screen that says the bar is stuck.
  //
  // Guarded because jsdom has no IntersectionObserver: without it `stuck` simply
  // stays false and the bar renders at its resting elevation.
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), {
      threshold: 1,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const scopeLabel = overviewCountLine({
    count: filtered.length,
    total: dashTrades.length,
    scope: rangeLabel,
  })

  return (
    <div className="space-y-6">
      {/* The filter governs EVERY widget below it — tiles, curve, drawdown, bookends
          and the day-by-day charts all read the same filtered snapshot — so it sits
          above all of them rather than buried in the last section, where it read as
          if it scoped only that section.

          STICKY: this tab is long, and a control that governs the whole of it has to
          stay reachable from the bottom of it. Safe here because the nearest scrolling
          ancestor is AppLayout's overflow-y-auto pane and nothing between the two
          clips overflow. The blur keeps scrolled content legible underneath. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      {/* THE WRAPPER PAINTS NOTHING. It positions and nothing else. `bg-bg-0` here
          stamped a flat #0d0f14 rectangle over .app-aurora — the app's real backdrop,
          an absolute z-index:-1 field that <main> is transparent to — so the bar
          arrived wearing a slab the rest of the page does not have. The bar is the
          one surface; the aurora shows through above and below it, and that gap is
          what makes it read as floating. */}
      {/* SPACING IS REDISTRIBUTED, NOT ADDED. The bar had 57px above it and 36px
          below; the overlay panel extends 66px below the bar (8px anchor gap + a
          58px panel), so it overran the OVERVIEW header by 30px. The same 93px is
          now split 21 above / 72 below — the bar sits 36px higher AND the panel
          clears the header by 6px.

          `!mt-0` is not decoration: the parent's `space-y-6 > :not([hidden]) ~
          :not([hidden])` selector carries three specificity units against a plain
          margin utility's one, so an ordinary `mt-0` loses. The `-mt-px` that used
          to sit here was dead for exactly that reason and never cancelled the
          sentinel it was written for. */}
      <div className="sticky top-0 z-30 !mt-0 pb-2 pt-0">
        <AnalyticsFilterBar
          trades={dashTrades}
          filters={filters}
          onFiltersChange={setFilters}
          quick={quick}
          onQuickChange={setQuick}
          scopeLabel={scopeLabel}
          elevated={stuck}
        />
      </div>

      {/* The clearance the overlay needs, held in ordinary flow spacing rather than
          in the sticky box — the pinned element stays tight (62px) while the panel
          gets its room. SectionHeader takes no className, so the margin rides on a
          wrapper, the same shape the Daily-breakdown header already uses. */}
      <div className="!mt-16">
        <SectionHeader
          title="Overview"
          description="The big picture — equity curve, headline metrics, and your bookends."
        />
      </div>

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
          description="Your P&L, cumulative, volume, and win rate, day by day."
        />
      </div>
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
