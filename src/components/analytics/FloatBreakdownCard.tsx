import Card from '@/components/ui/Card'
import { Info } from 'lucide-react'
import Tooltip from '@/components/ui/Tooltip'
import type { FloatAnalytics } from '@shared/analytics-types'
import { int, signed, pnlClass } from '@/lib/format'

interface FloatBreakdownCardProps {
  data: FloatAnalytics
}

// "By Float Size" breakdown. Five rows (Nano / Micro / Small / Mid / Unset)
// with trade count, win rate and net P&L. Coverage strip at the bottom
// shows how many trades have float_shares set — useful because float is
// only auto-enriched from market_data when Polygon has the ticker; sparse
// coverage means the data is still landing.

export default function FloatBreakdownCard({ data }: FloatBreakdownCardProps) {
  const coveragePct =
    data.total_trades > 0 ? (data.coverage / data.total_trades) * 100 : 0
  const maxAbsPnl = Math.max(
    1,
    ...data.buckets.map((b) => Math.abs(b.net_pnl)),
  )

  return (
    <Card
      title="By float size"
      subtitle="Performance grouped by tradable share float at the time of the trade."
      hover
      right={
        <Tooltip
          content={
            <>
              Float is auto-fetched from Massive ticker details on import
              (share_class_shares_outstanding). The trade detail modal's
              Float field lets you override per-trade values. Trades without
              a float value (no market data yet) roll up into "Unset".
            </>
          }
        >
          <Info size={14} strokeWidth={2} aria-hidden="true" className="cursor-help text-fg-tertiary" />
        </Tooltip>
      }
    >
      <div className="overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle/60 text-[10px] uppercase tracking-wider text-fg-tertiary">
              <th className="px-3 py-2 text-left font-semibold">Float bucket</th>
              <th className="px-3 py-2 text-right font-semibold">Trades</th>
              <th className="px-3 py-2 text-right font-semibold">Win rate</th>
              <th className="px-3 py-2 text-right font-semibold">Net P&amp;L</th>
              <th className="px-3 py-2 text-left font-semibold">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((b) => (
              <tr
                key={b.key}
                className={`border-b border-border-subtle/40 last:border-b-0 ${
                  b.trade_count === 0 ? 'opacity-60' : ''
                }`}
              >
                <td className="px-3 py-2 text-fg-primary">
                  {b.label}
                  {b.key === 'unset' && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
                      (no data)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-fg-primary tnum">
                  {int(b.trade_count)}
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
                <td
                  className={`px-3 py-2 text-right font-mono font-medium tnum ${
                    b.trade_count > 0 ? pnlClass(b.net_pnl) : 'text-fg-muted'
                  }`}
                >
                  {b.trade_count > 0 ? signed(b.net_pnl) : '—'}
                </td>
                <td className="px-3 py-2">
                  <DistroBar
                    pnl={b.trade_count > 0 ? b.net_pnl : 0}
                    absMax={maxAbsPnl}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-baseline gap-3 text-[11px] text-fg-tertiary">
        <span className="uppercase tracking-wider">Coverage</span>
        <span className="font-mono text-fg-primary tnum">
          {int(data.coverage)} / {int(data.total_trades)}
        </span>
        <span className="font-mono text-gold tnum">
          {coveragePct.toFixed(0)}%
        </span>
        {data.coverage === 0 && (
          <span className="ml-2 text-fg-muted">
            Run Settings → Refresh market data to populate.
          </span>
        )}
      </div>
    </Card>
  )
}

// Tiny zero-centred horizontal bar — green right of zero, red left. Used
// inside the row so the user can compare P&L magnitude across buckets at
// a glance without reading the numbers.
function DistroBar({ pnl, absMax }: { pnl: number; absMax: number }) {
  if (pnl === 0) {
    return <div className="relative h-2 w-full rounded-sm bg-bg-3" />
  }
  const widthPct = (Math.abs(pnl) / absMax) * 50
  return (
    <div className="relative h-2 w-full rounded-sm bg-bg-3">
      <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
      {pnl > 0 ? (
        <div
          className="absolute left-1/2 top-0 h-full rounded-r-sm bg-win/70"
          style={{ width: `${widthPct}%` }}
        />
      ) : (
        <div
          className="absolute right-1/2 top-0 h-full rounded-l-sm bg-loss/70"
          style={{ width: `${widthPct}%` }}
        />
      )}
    </div>
  )
}
