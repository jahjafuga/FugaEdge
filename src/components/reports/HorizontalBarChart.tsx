import type { BucketStats } from '@shared/reports-types'
import { int, money, percent, pnlClass, signed } from '@/lib/format'

interface HorizontalBarChartProps {
  buckets: BucketStats[]
}

// Wide visualization of P&L per bucket. Zero line at the horizontal middle,
// positive bars extend right (green), negative left (red). All bars share a
// single |max| scale so magnitudes are comparable across the chart.
export default function HorizontalBarChart({ buckets }: HorizontalBarChartProps) {
  if (buckets.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-fg-tertiary">
        No data for this breakdown.
      </div>
    )
  }
  const absMax = Math.max(...buckets.map((b) => Math.abs(b.net_pnl)), 1)

  return (
    <div className="space-y-3 p-5">
      {buckets.map((b) => (
        <div key={b.key} className="grid grid-cols-[80px_1fr_120px] items-center gap-3">
          <div className="font-mono text-sm text-fg-primary">{b.key}</div>
          <div className="relative h-6 rounded-sm bg-white/[0.025]">
            <div className="absolute left-1/2 top-0 h-full w-px bg-border/80" />
            {b.net_pnl > 0 && (
              <div
                className="absolute left-1/2 top-0 flex h-full items-center justify-end rounded-r-sm bg-win/70 pr-1.5"
                style={{ width: `${(b.net_pnl / absMax) * 50}%` }}
              >
                <span className="font-mono text-[10px] text-accent-ink">
                  {signed(b.net_pnl)}
                </span>
              </div>
            )}
            {b.net_pnl < 0 && (
              <div
                className="absolute right-1/2 top-0 flex h-full items-center justify-start rounded-l-sm bg-loss/70 pl-1.5"
                style={{ width: `${(Math.abs(b.net_pnl) / absMax) * 50}%` }}
              >
                <span className="font-mono text-[10px] text-accent-ink">
                  {signed(b.net_pnl)}
                </span>
              </div>
            )}
          </div>
          <div className="text-right text-xs">
            <div className="font-mono text-fg-primary">
              {int(b.trade_count)}{' '}
              <span className="text-fg-tertiary">trades</span>
            </div>
            <div className="font-mono text-[10px] text-fg-tertiary">
              {b.win_rate == null
                ? '—'
                : `${percent(b.win_rate, 0)} win`}{' '}
              · avg{' '}
              <span className={pnlClass(b.net_pnl / Math.max(1, b.trade_count))}>
                {money(b.net_pnl / Math.max(1, b.trade_count))}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
