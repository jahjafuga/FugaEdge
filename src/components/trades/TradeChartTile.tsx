import type { TradeListRow } from '@shared/trades-types'
import Sparkline from './Sparkline'
import { int, pnlClass, shortDate, signed } from '@/lib/format'

interface TradeChartTileProps {
  trade: TradeListRow
}

function timeOf(iso: string): string {
  const t = iso.split('T')[1]
  if (!t) return iso
  // Trim to HH:MM for the compact tile — seconds add noise at this size.
  const [h, m] = t.split(':')
  return `${h}:${m}`
}

// Small grid variant — compact tile with mini sparkline. Display-only.
export default function TradeChartTile({ trade }: TradeChartTileProps) {
  const closeStr = trade.close_time ? timeOf(trade.close_time) : '—'

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-panel p-3 transition-all duration-200 ease-smooth hover:border-gold/40 hover:shadow-[0_0_24px_-10px_rgba(201,168,76,0.35)]">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-sm font-medium text-text">{trade.symbol}</span>
        <span className={`font-mono text-sm font-medium ${pnlClass(trade.net_pnl)}`}>
          {signed(trade.net_pnl)}
        </span>
      </div>

      <div className="flex items-center justify-center">
        <Sparkline
          executions={trade.executions}
          netPnl={trade.net_pnl}
          width={180}
          height={48}
          emphasizeEntryExit
        />
      </div>

      <div className="flex items-baseline justify-between text-[10px]">
        <span className="font-mono text-muted">{shortDate(trade.date)}</span>
        <span
          className={`font-mono uppercase ${
            trade.side === 'short' ? 'text-red' : 'text-win'
          }`}
        >
          {trade.side}
        </span>
        <span className="font-mono text-muted">
          {int(trade.executions.length)}f
        </span>
      </div>

      <div className="text-[10px] text-muted">
        <span className="font-mono">
          {timeOf(trade.open_time)} → {closeStr}
        </span>
      </div>

    </div>
  )
}
