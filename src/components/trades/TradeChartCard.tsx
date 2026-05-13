import type { TradeListRow } from '@shared/trades-types'
import Sparkline from './Sparkline'
import { int, longDate, money, pnlClass, price, signed } from '@/lib/format'

interface TradeChartCardProps {
  trade: TradeListRow
}

function timeOf(iso: string): string {
  const t = iso.split('T')[1]
  return t ?? iso
}

// Large variant — full-width card with a wide sparkline and entry/exit
// price annotations. Read-only: editing is in Table view.
export default function TradeChartCard({ trade }: TradeChartCardProps) {
  const execs = trade.executions
  const isLong = trade.side === 'long'
  const entryFill = execs[0]
  const exitFill = execs[execs.length - 1]

  const entryPrice = isLong ? trade.avg_buy_price : trade.avg_sell_price
  const exitPrice = isLong ? trade.avg_sell_price : trade.avg_buy_price

  return (
    <div className="rounded-md border border-border bg-panel p-4 transition-all duration-200 ease-smooth hover:border-gold/40 hover:shadow-[0_0_24px_-10px_rgba(201,168,76,0.35)]">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_200px]">
        {/* Identity */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-medium text-text">{trade.symbol}</span>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                trade.side === 'short' ? 'bg-red/15 text-red' : 'bg-win/15 text-win'
              }`}
            >
              {trade.side}
            </span>
            {trade.is_open && (
              <span className="rounded bg-red/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-red">
                open
              </span>
            )}
          </div>
          <div className="font-mono text-xs text-subtle">{longDate(trade.date)}</div>
          <div className="font-mono text-xs text-muted">
            {entryFill && timeOf(entryFill.time)}
            {exitFill && exitFill !== entryFill && (
              <>
                {' → '}
                {timeOf(exitFill.time)}
              </>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="flex flex-col items-center justify-center">
          <Sparkline
            executions={execs}
            netPnl={trade.net_pnl}
            width={420}
            height={84}
            emphasizeEntryExit
          />
          <div className="mt-2 flex w-full max-w-[420px] items-baseline justify-between px-1 font-mono text-[11px] text-muted">
            <span>
              <span className="text-[9px] uppercase tracking-widest text-win">● Entry</span>{' '}
              <span className="text-win">{price(entryPrice)}</span>
            </span>
            <span className="text-[10px] text-muted">
              {int(execs.length)} fill{execs.length === 1 ? '' : 's'}
            </span>
            <span>
              <span className="text-[9px] uppercase tracking-widest text-red">Exit ●</span>{' '}
              <span className="text-red">{price(exitPrice)}</span>
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-1.5 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted">Net P&L</div>
            <div className={`font-mono text-xl font-medium ${pnlClass(trade.net_pnl)}`}>
              {signed(trade.net_pnl)}
            </div>
          </div>
          <div className="text-xs">
            <div>
              <span className="text-muted">Bought </span>
              <span className="font-mono text-text">{int(trade.shares_bought)}</span>
              <span className="text-muted"> · Sold </span>
              <span className="font-mono text-text">{int(trade.shares_sold)}</span>
            </div>
            <div>
              <span className="text-muted">Fees </span>
              <span className="font-mono text-red">{money(trade.total_fees)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
