import Card from '@/components/ui/Card'
import Tooltip from '@/components/ui/Tooltip'
import type { CatalystAnalytics } from '@shared/analytics-types'
import { int, money, signed, pnlClass } from '@/lib/format'

interface CatalystBreakdownCardProps {
  data: CatalystAnalytics
}

// "By Catalyst Type" breakdown. One row per distinct catalyst_type value
// observed in the trade set, plus an "Unset" row when applicable. Rows
// sorted by trade count (tagged catalysts first; Unset always last).
//
// Empty state: when zero trades have catalyst_type set, prompt the user
// to tag catalysts via the trade detail modal — otherwise this card just
// shows a single 'Unset' row and looks broken.

export default function CatalystBreakdownCard({ data }: CatalystBreakdownCardProps) {
  const taggedPct =
    data.total_trades > 0 ? (data.tagged_trades / data.total_trades) * 100 : 0

  return (
    <Card
      title="By catalyst type"
      subtitle="Performance grouped by the catalyst tag set on each trade."
      hover
      right={
        <Tooltip
          content={
            <>
              Set a catalyst on each trade via Trades → row → Overview tab →
              Catalyst section. Buckets are dynamic — whatever values you
              tag will appear here automatically.
            </>
          }
        >
          <span className="cursor-help text-[11px] text-fg-tertiary">ⓘ</span>
        </Tooltip>
      }
    >
      {data.tagged_trades === 0 ? (
        <div className="rounded-md border border-gold/30 bg-gold/[0.04] p-4 text-xs text-fg-secondary">
          <div className="mb-1 font-mono uppercase tracking-widest text-gold">
            No catalysts tagged yet
          </div>
          Open any trade in the Trades page → Overview tab → Catalyst section
          to start tagging. Once a few are set, this card breaks down your
          edge by catalyst type.
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle/60 font-mono text-[10px] uppercase tracking-widest text-fg-tertiary">
                <th className="px-3 py-2 text-left font-semibold">Catalyst</th>
                <th className="px-3 py-2 text-right font-semibold">Trades</th>
                <th className="px-3 py-2 text-right font-semibold">Net P&amp;L</th>
                <th className="px-3 py-2 text-right font-semibold">Win rate</th>
                <th className="px-3 py-2 text-right font-semibold">Avg winner</th>
                <th className="px-3 py-2 text-right font-semibold">Avg loser</th>
              </tr>
            </thead>
            <tbody>
              {data.buckets.map((b) => (
                <tr
                  key={b.catalyst_type ?? '__unset__'}
                  className={`border-b border-border-subtle/40 last:border-b-0 ${
                    b.catalyst_type == null ? 'opacity-60' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-fg-primary">
                    {b.catalyst_type ?? 'Unset'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-fg-primary tnum">
                    {int(b.trade_count)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono font-medium tnum ${pnlClass(b.net_pnl)}`}
                  >
                    {signed(b.net_pnl)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tnum">
                    {b.win_rate == null ? (
                      <span className="text-fg-muted">—</span>
                    ) : (
                      <span className="text-gold">
                        {(b.win_rate * 100).toFixed(0)}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tnum">
                    {b.avg_winner == null ? (
                      <span className="text-fg-muted">—</span>
                    ) : (
                      <span className="text-win">{money(b.avg_winner)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tnum">
                    {b.avg_loser == null ? (
                      <span className="text-fg-muted">—</span>
                    ) : (
                      <span className="text-loss">{money(b.avg_loser)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-baseline gap-3 text-[11px] text-fg-tertiary">
        <span className="font-mono uppercase tracking-widest">Coverage</span>
        <span className="font-mono text-fg-primary tnum">
          {int(data.tagged_trades)} / {int(data.total_trades)} trades tagged
        </span>
        <span className="font-mono text-gold tnum">{taggedPct.toFixed(0)}%</span>
      </div>
    </Card>
  )
}
