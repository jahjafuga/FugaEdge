import { RotateCcw, Trash2 } from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'
import { signed, pnlClass, longDate, deletedAgo } from '@/lib/format'

interface TrashRowProps {
  trade: TradeListRow
  selected: boolean
  /** Toggle this row's checkbox. The parent no-ops while the Delete Forever
   *  modal is open (selection freeze), so this can stay a plain toggle. */
  onToggle: () => void
  onRestore: () => void
  onDeleteForever: () => void
  /** This row has a single-row op (restore / delete-forever) in flight. */
  busy?: boolean
  /** A bulk op is in flight elsewhere — disable this row's own actions so the
   *  two paths can't race. */
  disabled?: boolean
}

// v0.2.3 P5 — one deleted trade in the Settings → Trash list. Presentational:
// selection + busy + disabled are owned by TrashSection and passed in. Reuses
// the "trade summary chip" visual language (mono symbol + side badge + date +
// right-aligned Net P&L) from TradeLifecycleFooter / the bulk confirm preview,
// plus a "deleted X days ago" stamp and per-row Restore / Delete Forever.
export default function TrashRow({
  trade,
  selected,
  onToggle,
  onRestore,
  onDeleteForever,
  busy = false,
  disabled = false,
}: TrashRowProps) {
  const actionsDisabled = busy || disabled

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-2 px-3 py-2.5">
      <input
        type="checkbox"
        aria-label={`Select ${trade.symbol} ${longDate(trade.date)}`}
        checked={selected}
        onChange={onToggle}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded-[3px] accent-gold"
      />

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-fg-primary">
            {trade.symbol}
          </span>
          <span
            className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              trade.side === 'short'
                ? 'bg-loss-soft text-loss'
                : 'bg-win-soft text-win'
            }`}
          >
            {trade.side}
          </span>
        </div>
        <span className="whitespace-nowrap text-xs text-fg-tertiary tnum">
          {longDate(trade.date)}
        </span>
        <span
          className={`whitespace-nowrap font-mono text-sm font-semibold tnum ${pnlClass(trade.net_pnl)}`}
        >
          {signed(trade.net_pnl)}
        </span>
        <span className="whitespace-nowrap text-xs text-fg-muted">
          {deletedAgo(trade.deleted_at)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onRestore}
          disabled={actionsDisabled}
          aria-label={`Restore ${trade.symbol} ${longDate(trade.date)}`}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-3 text-xs font-semibold text-fg-primary transition-colors duration-150 hover:border-border hover:bg-bg-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw size={13} strokeWidth={2} />
          {busy ? 'Restoring…' : 'Restore'}
        </button>
        <button
          type="button"
          onClick={onDeleteForever}
          disabled={actionsDisabled}
          aria-label={`Delete ${trade.symbol} ${longDate(trade.date)} forever`}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-loss/40 bg-loss-soft px-3 text-xs font-semibold text-loss transition-colors duration-150 hover:border-loss/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={13} strokeWidth={2} />
          Delete forever
        </button>
      </div>
    </div>
  )
}
