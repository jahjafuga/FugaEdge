import Card from '@/components/ui/Card'
import type { SymbolStat } from '@shared/analytics-types'
import { money, int, signed, pnlClass } from '@/lib/format'

interface SymbolPerformanceProps {
  best: SymbolStat[]
  worst: SymbolStat[]
}

export default function SymbolPerformance({ best, worst }: SymbolPerformanceProps) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card title="Best symbols" subtitle="Top 5 by net P&L." padded={false}>
        <SymbolTable rows={best} emptyText="No winning symbols yet." tone="green" />
      </Card>
      <Card title="Worst symbols" subtitle="Bottom 5 by net P&L." padded={false}>
        <SymbolTable rows={worst} emptyText="No losing symbols." tone="red" />
      </Card>
    </div>
  )
}

function SymbolTable({
  rows,
  emptyText,
  tone,
}: {
  rows: SymbolStat[]
  emptyText: string
  tone: 'green' | 'red'
}) {
  if (rows.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-fg-tertiary">{emptyText}</div>
    )
  }
  const absMax = Math.max(...rows.map((r) => Math.abs(r.net_pnl)), 1)
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border-subtle/60 text-[10px] uppercase tracking-wider text-fg-tertiary">
          <th className="px-3 py-2 text-left font-semibold">Symbol</th>
          <th className="px-3 py-2 text-right font-semibold">Trades</th>
          <th className="px-3 py-2 text-right font-semibold">W/L</th>
          <th className="px-3 py-2 text-right font-semibold">Fees</th>
          <th className="px-3 py-2 text-right font-semibold">Net P&amp;L</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol} className="border-b border-border-subtle/30 last:border-b-0 hover:bg-white/[0.015]">
            <td className="px-3 py-2">
              <span className="font-mono font-medium text-fg-primary">{r.symbol}</span>
            </td>
            <td className="px-3 py-2 text-right font-mono text-fg-primary">{int(r.trade_count)}</td>
            <td className="px-3 py-2 text-right font-mono">
              <span className="text-win">{int(r.winners)}</span>
              <span className="text-fg-tertiary">/</span>
              <span className="text-loss">{int(r.losers)}</span>
            </td>
            <td className="px-3 py-2 text-right font-mono text-fg-tertiary">{money(r.total_fees)}</td>
            <td className="px-3 py-2 text-right">
              <div className="relative">
                <span className={`relative z-10 font-mono font-medium ${pnlClass(r.net_pnl)}`}>
                  {signed(r.net_pnl)}
                </span>
                <div
                  className={`pointer-events-none absolute inset-y-0 right-0 -mx-3 rounded-sm ${
                    tone === 'green' ? 'bg-win/15' : 'bg-loss/15'
                  }`}
                  style={{ width: `${(Math.abs(r.net_pnl) / absMax) * 100}%` }}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
