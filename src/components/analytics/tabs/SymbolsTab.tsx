import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import SectionHeader from '@/components/ui/SectionHeader'
import SymbolPerformance from '@/components/analytics/SymbolPerformance'
// DISABLED for v0.2.0 — re-enable in v0.3.0 with point-in-time float.
// import FloatBreakdownCard from '@/components/analytics/FloatBreakdownCard'
import HorizontalBarChart from '@/components/reports/HorizontalBarChart'
import BucketSummary from '@/components/reports/BucketSummary'
import { int, money, percent, pnlClass, signed } from '@/lib/format'
import type { AnalyticsData } from '@shared/analytics-types'
import type { BucketStats, ReportsData } from '@shared/reports-types'

interface SymbolsTabProps {
  data: AnalyticsData
  reports: ReportsData | null
}

export default function SymbolsTab({ data, reports }: SymbolsTabProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Symbols"
        description="Best / worst tickers, plus the price-range and size buckets that drive your P&L."
      />

      <SymbolPerformance best={data.bestSymbols} worst={data.worstSymbols} />

      {/* DISABLED for v0.2.0 — re-enable in v0.3.0 with point-in-time float. */}
      {/* <FloatBreakdownCard data={data.float} /> */}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="P&L by price range" subtitle="Bucketed by avg buy price.">
          {reports && reports.byPriceRange.length > 0 ? (
            <BucketTable buckets={reports.byPriceRange} firstColLabel="Price" />
          ) : (
            <EmptyMini text="Import more trades across different price ranges." />
          )}
        </Card>

        <Card title="P&L by share size" subtitle="Bucketed by shares per trade.">
          {reports && reports.byShareSize.length > 0 ? (
            <BucketTable buckets={reports.byShareSize} firstColLabel="Size" />
          ) : (
            <EmptyMini text="More trades will fill out this distribution." />
          )}
        </Card>
      </div>

      {/* Float + RVOL breakdowns + coverage — moved here from the Reports →
          Volume tab (four-card consolidation, Beat A). Functional move using the
          existing bar components; the visual/layout polish is Beat B. */}
      <VolumeBreakdowns reports={reports} />
    </div>
  )
}

// Ported from VolumeTab (Beat A). Renders the volume-analysis coverage stat plus
// the Float and RVOL bar breakdowns, or the unavailable fallback when no market
// data is cached. Reads reports.volumeAnalysis — already on the reports prop, so
// no new data wiring.
function VolumeBreakdowns({ reports }: { reports: ReportsData | null }) {
  const va = reports?.volumeAnalysis

  if (!va || va.status === 'unavailable') {
    return (
      <Card title="Volume analysis" subtitle="Float and relative volume buckets.">
        <div className="rounded-md border border-gold/30 bg-gold/[0.04] p-5">
          <div className="flex items-center gap-2">
            <Info size={14} strokeWidth={2} aria-hidden="true" className="text-lg text-gold" />
            <span className="text-[10px] uppercase tracking-wider text-gold">
              Market data unavailable
            </span>
          </div>
          <p className="mt-2 text-sm text-fg-secondary">
            {va?.reason ?? 'No market data cached yet. Refresh market data in Settings.'}
          </p>
          <Link
            to="/settings"
            className="mt-3 inline-block rounded-md bg-gold px-4 py-1.5 text-xs font-medium text-accent-ink transition-colors duration-150 hover:bg-gold-hover"
          >
            Open Settings
          </Link>
        </div>
      </Card>
    )
  }

  const coverage = va.trades_analyzed + va.trades_missing_data
  const coveragePct = coverage > 0 ? (va.trades_analyzed / coverage) * 100 : 0

  return (
    <div className="space-y-5">
      <Card title="Volume analysis coverage" subtitle="How much of your trade history has market data." hover>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-mono text-2xl text-gold">{coveragePct.toFixed(0)}%</div>
            <div className="mt-1 text-xs text-fg-secondary">
              <span className="font-mono text-fg-primary">{int(va.trades_analyzed)}</span>{' '}
              <span className="text-fg-tertiary">of</span>{' '}
              <span className="font-mono text-fg-primary">{int(coverage)}</span>{' '}
              <span className="text-fg-tertiary">trades have float & RVOL data</span>
            </div>
          </div>
          {va.trades_missing_data > 0 && (
            <div className="text-xs text-fg-tertiary">
              <span className="font-mono text-loss">{int(va.trades_missing_data)}</span> missing —
              refresh market data in Settings.
            </div>
          )}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-white/[0.05]">
          <div className="h-full bg-gold" style={{ width: `${coveragePct}%` }} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Float" subtitle="Bucketed by tradable float." padded={false} hover>
          <HorizontalBarChart buckets={va.byFloat} />
          <BucketSummary buckets={va.byFloat} />
        </Card>
        <Card title="P&L by relative volume" subtitle="Trade-day volume / 30-day average." padded={false} hover>
          <HorizontalBarChart buckets={va.byRvol} />
          <BucketSummary buckets={va.byRvol} />
        </Card>
      </div>
    </div>
  )
}

function BucketTable({
  buckets,
  firstColLabel,
}: {
  buckets: BucketStats[]
  firstColLabel: string
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-fg-tertiary">
          <tr className="border-b border-border-subtle/60">
            <th className="px-3 py-2 text-left font-semibold">{firstColLabel}</th>
            <th className="px-3 py-2 text-right font-semibold">Trades</th>
            <th className="px-3 py-2 text-right font-semibold">Net P&L</th>
            <th className="px-3 py-2 text-right font-semibold">Win rate</th>
            <th className="px-3 py-2 text-right font-semibold">Avg winner</th>
            <th className="px-3 py-2 text-right font-semibold">Avg loser</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr
              key={b.key}
              className="border-b border-border-subtle/30 last:border-b-0 hover:bg-white/[0.015]"
            >
              <td className="px-3 py-2 font-mono text-fg-primary">{b.key}</td>
              <td className="px-3 py-2 text-right font-mono text-fg-primary">
                {int(b.trade_count)}
              </td>
              <td className={`px-3 py-2 text-right font-mono font-medium ${pnlClass(b.net_pnl)}`}>
                {signed(b.net_pnl)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-gold">
                {b.win_rate == null ? '—' : percent(b.win_rate, 0)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-win">
                {b.avg_winner == null ? '—' : money(b.avg_winner)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-loss">
                {b.avg_loser == null ? '—' : money(b.avg_loser)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyMini({ text }: { text: string }) {
  return <div className="px-3 py-6 text-center text-xs text-fg-tertiary">{text}</div>
}
