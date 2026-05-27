import type { TradeListRow } from '@shared/trades-types'
import Sparkline from './Sparkline'
import { int, pnlClass, shortDate, signed, formatEastern } from '@/lib/format'

interface TradeChartTileProps {
  trade: TradeListRow
}

// Compact tile renders Eastern HH:MM only — formatEastern yields HH:MM:SS,
// and seconds add noise at this tile size. Day 8.5 Commit B flips the zone
// but keeps the prior display density.
function hhmm(iso: string): string {
  return formatEastern(iso).slice(0, 5)
}

// Small grid variant — compact tile with mini sparkline. Display-only.
export default function TradeChartTile({ trade }: TradeChartTileProps) {
  const closeStr = trade.close_time ? hhmm(trade.close_time) : '—'

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
 className={`uppercase ${
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
          {hhmm(trade.open_time)} → {closeStr}
        </span>
      </div>

    </div>
  )
}
