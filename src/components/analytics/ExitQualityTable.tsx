import Card from '@/components/ui/Card'
import type { ExitDelta } from '@shared/analytics-types'
import { money, price, signed, pnlClass, longDate } from '@/lib/format'

interface ExitQualityTableProps {
  rows: ExitDelta[]
}

export default function ExitQualityTable({ rows }: ExitQualityTableProps) {
  return (
    <Card
      title="Exit performance"
      subtitle="Money left on the table: best exit price you executed at vs the average you got."
      padded={false}
    >
      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-fg-tertiary">
          Every round trip exited at a single price (or perfectly at the best one).
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle/60 text-[10px] uppercase tracking-widest text-fg-tertiary">
              <th className="px-3 py-2 text-left font-semibold">Date</th>
              <th className="px-3 py-2 text-left font-semibold">Symbol</th>
              <th className="px-3 py-2 text-left font-semibold">Side</th>
              <th className="px-3 py-2 text-right font-semibold">Exits</th>
              <th className="px-3 py-2 text-right font-semibold">Avg exit</th>
              <th className="px-3 py-2 text-right font-semibold">Best exit</th>
              <th className="px-3 py-2 text-right font-semibold">Actual P&amp;L</th>
              <th className="px-3 py-2 text-right font-semibold">Best-exit P&amp;L</th>
              <th className="px-3 py-2 text-right font-semibold">Left on table</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.trade_id} className="border-b border-border-subtle/30 last:border-b-0 hover:bg-white/[0.015]">
                <td className="px-3 py-2 font-mono text-xs text-fg-secondary">{longDate(r.date)}</td>
                <td className="px-3 py-2 font-mono font-medium text-fg-primary">{r.symbol}</td>
                <td className="px-3 py-2">
                  <span
                    className={`font-mono text-xs uppercase ${
                      r.side === 'short' ? 'text-loss' : 'text-win'
                    }`}
                  >
                    {r.side}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-fg-primary">{r.exit_count}</td>
                <td className="px-3 py-2 text-right font-mono text-fg-secondary">{price(r.actual_avg_exit)}</td>
                <td className="px-3 py-2 text-right font-mono text-gold">{price(r.best_exit_price)}</td>
                <td className={`px-3 py-2 text-right font-mono ${pnlClass(r.actual_net_pnl)}`}>
                  {signed(r.actual_net_pnl)}
                </td>
                <td className={`px-3 py-2 text-right font-mono ${pnlClass(r.best_exit_net_pnl)}`}>
                  {signed(r.best_exit_net_pnl)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-gold">
                  +{money(r.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
