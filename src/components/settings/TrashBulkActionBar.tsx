import { RotateCcw, Trash2, X } from 'lucide-react'
import { int, signed, pnlClass } from '@/lib/format'

interface TrashBulkActionBarProps {
  /** Number of selected deleted trades. */
  count: number
  /** Combined Net P&L of the selection. */
  netPnlTotal: number
  /** In-flight flag for a bulk op — disables every button. */
  busy?: boolean
  /** Bulk op error (atomic reject path). Persisted alongside the retained
   *  selection so the user can retry. */
  error?: string | null
  onRestore: () => void
  onDeleteForever: () => void
  onClear: () => void
}

// v0.2.3 P5 — bulk action bar for the Trash list. Sibling to P4's
// TradesBulkActionBar but carries TWO actions (Restore + Delete Forever) where
// that one carries a single "Move to Trash"; kept a separate component rather
// than contorting the P4 bar's one-action API. Purely presentational — count,
// busy, and error are owned by TrashSection. Renders nothing until at least one
// row is selected. (Rule of three: extract a generic BulkActionBar when a third
// consumer appears.)
export default function TrashBulkActionBar({
  count,
  netPnlTotal,
  busy = false,
  error = null,
  onRestore,
  onDeleteForever,
  onClear,
}: TrashBulkActionBarProps) {
  if (count === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-header px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold text-fg-primary">
          <span className="font-mono tnum">{int(count)}</span> selected
        </span>
        <span className="text-fg-muted">·</span>
        <span className="text-fg-tertiary">Combined Net P&amp;L</span>
        <span className={`font-mono font-semibold tnum ${pnlClass(netPnlTotal)}`}>
          {signed(netPnlTotal)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {error && (
          <span className="max-w-[24ch] truncate text-xs font-medium text-loss" title={error}>
            {error}
          </span>
        )}
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border-subtle bg-bg-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={13} strokeWidth={2.25} />
          Clear
        </button>
        <button
          type="button"
          onClick={onRestore}
          disabled={busy}
          aria-label="Restore selected"
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-bg-1 px-4 text-sm font-semibold text-fg-primary transition-colors duration-150 hover:border-border hover:bg-bg-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw size={14} strokeWidth={2} />
          {busy ? 'Working…' : 'Restore'}
        </button>
        <button
          type="button"
          onClick={onDeleteForever}
          disabled={busy}
          aria-label="Delete selected forever"
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-loss/40 bg-loss-soft px-4 text-sm font-semibold text-loss transition-colors duration-150 hover:border-loss/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={14} strokeWidth={2} />
          Delete forever
        </button>
      </div>
    </div>
  )
}
