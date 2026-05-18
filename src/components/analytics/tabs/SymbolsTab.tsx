import Card from '@/components/ui/Card'
import SectionHeader from '@/components/ui/SectionHeader'
import SymbolPerformance from '@/components/analytics/SymbolPerformance'
// DISABLED for v0.2.0 — re-enable in v0.3.0 with point-in-time float.
// import FloatBreakdownCard from '@/components/analytics/FloatBreakdownCard'
import { int, money, pnlClass, signed } from '@/lib/format'
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
                {b.win_rate == null ? '—' : `${(b.win_rate * 100).toFixed(0)}%`}
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
