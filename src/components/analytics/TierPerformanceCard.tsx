import { useMemo } from 'react'
import Card from '@/components/ui/Card'
import TierBadge from '@/components/playbook/TierBadge'
import { money, signed, pnlClass } from '@/lib/format'
import {
  aggregateTierPerformance,
  type TierPerformanceRow,
} from '@/core/playbook/tiers'
import type { TradeListRow } from '@shared/trades-types'

interface TierPerformanceCardProps {
  trades: readonly TradeListRow[]
}

// Tier Performance — the headline insight view for v0.1.5. Proves (or
// disproves) whether A+ discipline actually pays. Pure render off the
// trade list joined with playbooks.tier from the IPC.
export default function TierPerformanceCard({ trades }: TierPerformanceCardProps) {
  const rows = useMemo(() => aggregateTierPerformance(trades), [trades])

  if (rows.length === 0) {
    return (
      <Card
        title="Tier performance"
        subtitle="Does A+ discipline pay? Tag a setup tier in the Setup Library to populate this."
      >
        <div className="rounded-md border border-border-subtle/40 bg-bg-1/40 p-4 text-sm text-fg-tertiary">
          No tier-tagged trades yet. Open Setup Library, set a tier on each
          playbook, then assign playbooks to your trades.
        </div>
      </Card>
    )
  }

  return (
    <Card
      title="Tier performance"
      subtitle="One row per setup tier with at least one tagged trade. A+ → A → B → C order."
      padded={false}
    >
      <div className="overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle/60 text-[10px] uppercase tracking-wider text-fg-tertiary">
              <th className="px-3 py-2 text-left font-semibold">Tier</th>
              <th className="px-3 py-2 text-right font-semibold">Trades</th>
              <th className="px-3 py-2 text-right font-semibold">Win %</th>
              <th className="px-3 py-2 text-right font-semibold">Net P&amp;L</th>
              <th className="px-3 py-2 text-right font-semibold">Expectancy</th>
              <th className="px-3 py-2 text-right font-semibold">Profit factor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <TierRow key={r.tier} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function TierRow({ row: r }: { row: TierPerformanceRow }) {
  return (
    <tr className="border-b border-border-subtle/40 last:border-b-0">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <TierBadge tier={r.tier} />
          <span className="text-[10px] text-fg-tertiary tnum">
            {r.winners}W / {r.losers}L
            {r.scratches > 0 ? ` / ${r.scratches}S` : ''}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-fg-primary tnum">
        {r.trades}
      </td>
      <td className="px-3 py-2 text-right font-mono tnum">
        {r.win_rate == null ? (
          <span className="text-fg-tertiary">—</span>
        ) : (
          <span className="text-gold">{(r.win_rate * 100).toFixed(0)}%</span>
        )}
      </td>
      <td
        className={`px-3 py-2 text-right font-mono font-medium tnum ${pnlClass(r.net_pnl)}`}
      >
        {signed(r.net_pnl)}
      </td>
      <td className="px-3 py-2 text-right font-mono tnum">
        {r.expectancy == null ? (
          <span className="text-fg-tertiary">—</span>
        ) : (
          <span className={pnlClass(r.expectancy)}>{money(r.expectancy)}/trade</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tnum">
        {r.profit_factor == null ? (
          <span className="text-fg-tertiary">—</span>
        ) : (
          <span className="text-fg-primary">{r.profit_factor.toFixed(2)}</span>
        )}
      </td>
    </tr>
  )
}
