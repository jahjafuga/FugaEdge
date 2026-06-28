import { Tag, Trash2, X } from 'lucide-react'
import { int, signed, pnlClass } from '@/lib/format'

interface TradesBulkActionBarProps {
  /** Effective selection count (already intersected with the visible rows). */
  count: number
  /** Combined Net P&L of the selected trades. */
  netPnlTotal: number
  /** True when the selection has hit the UX cap (MAX_BULK). Shows a persistent
   *  inline note — the over-select state stays until the user reduces it, so
   *  it lives here, not in a transient toast (Q9). */
  atCap?: boolean
  /** In-flight flag for the bulk op — disables both buttons. */
  busy?: boolean
  /** Bulk soft-delete error (atomic reject path). Persisted alongside the
   *  retained selection so the user can retry. */
  error?: string | null
  onSetPlaybook: () => void
  onMoveToTrash: () => void
  onClear: () => void
}

// v0.2.3 Phase 4 — bottom-of-card action bar for TradesTable bulk selection.
// Purely presentational: all state (selection, busy, error, cap) is owned by
// TradesTable and passed down, because both this bar and the bulk ConfirmModal
// read the same flags. Renders nothing until at least one row is selected.
// Visual language mirrors TradeLifecycleFooter (border-t, px-5 py-3, justify).
export default function TradesBulkActionBar({
  count,
  netPnlTotal,
  atCap = false,
  busy = false,
  error = null,
  onSetPlaybook,
  onMoveToTrash,
  onClear,
}: TradesBulkActionBarProps) {
  if (count === 0) return null

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border-subtle bg-bg-header px-5 py-3 shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.25)]">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold text-fg-primary">
          <span className="font-mono tnum">{int(count)}</span> selected
        </span>
        <span className="text-fg-muted">·</span>
        <span className="text-fg-tertiary">Combined Net P&amp;L</span>
        <span className={`font-mono font-semibold tnum ${pnlClass(netPnlTotal)}`}>
          {signed(netPnlTotal)}
        </span>
        {atCap && (
          <>
            <span className="text-fg-muted">·</span>
            <span className="font-medium text-gold">
              500 selected (max). Use filters to narrow.
            </span>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {error && (
          <span className="max-w-[20ch] truncate text-xs font-medium text-loss" title={error}>
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
          onClick={onSetPlaybook}
          disabled={busy}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-gold/40 bg-gold/[0.08] px-4 text-sm font-semibold text-gold transition-colors duration-150 hover:border-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Tag size={14} strokeWidth={2} />
          Set playbook
        </button>
        <button
          type="button"
          onClick={onMoveToTrash}
          disabled={busy}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-loss/40 bg-loss-soft px-4 text-sm font-semibold text-loss transition-colors duration-150 hover:border-loss/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={14} strokeWidth={2} />
          {busy ? 'Moving…' : 'Move to Trash'}
        </button>
      </div>
    </div>
  )
}
