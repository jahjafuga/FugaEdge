import { useState } from 'react'
import { Trash2, RotateCcw } from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'
import { signed, pnlClass, longDate } from '@/lib/format'
import ConfirmModal from '@/components/ui/ConfirmModal'

interface TradeLifecycleFooterProps {
  trade: TradeListRow
  onSoftDelete?: (trade_id: number) => Promise<void>
  onRestore?: (trade_id: number) => Promise<void>
}

// Footer row inside TradeDetailModal. The action shown depends on the trade's
// lifecycle state (deleted_at):
//   live    → "Move to Trash", guarded by a ConfirmModal (preview + 30-day note)
//   deleted → "Restore", instant, no modal (trivially reversible — decision #5)
// Hosts that don't pass the matching callback render no footer, which keeps the
// four calendar/review hosts footer-free in P3.
export default function TradeLifecycleFooter({
  trade,
  onSoftDelete,
  onRestore,
}: TradeLifecycleFooterProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const isDeleted = trade.deleted_at != null

  // Render nothing if the action matching this trade's state has no handler.
  if (isDeleted && !onRestore) return null
  if (!isDeleted && !onSoftDelete) return null

  const handleSoftDelete = async () => {
    if (!onSoftDelete || busy) return
    setBusy(true)
    try {
      await onSoftDelete(trade.id)
      // Success: the host closes the modal (this footer unmounts).
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async () => {
    if (!onRestore || busy) return
    setBusy(true)
    try {
      await onRestore(trade.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-end border-t border-border-subtle px-5 py-3">
      {isDeleted ? (
        <button
          type="button"
          onClick={handleRestore}
          disabled={busy}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-bg-2 px-4 text-sm font-semibold text-fg-primary transition-colors duration-150 hover:border-border hover:bg-bg-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw size={14} strokeWidth={2} />
          {busy ? 'Restoring…' : 'Restore'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-loss/40 bg-loss-soft px-4 text-sm font-semibold text-loss transition-colors duration-150 hover:border-loss/60"
        >
          <Trash2 size={14} strokeWidth={2} />
          Move to Trash
        </button>
      )}

      {!isDeleted && (
        <ConfirmModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Move trade to Trash?"
          confirmLabel="Move to Trash"
          busyLabel="Moving…"
          busy={busy}
          tone="destructive"
          onConfirm={handleSoftDelete}
          body={
            <div className="flex flex-col gap-3">
              {/* Preview so the user can sanity-check the trade being removed. */}
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-base font-semibold text-fg-primary">
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
                  <div className="mt-0.5 text-xs text-fg-tertiary tnum">
                    {longDate(trade.date)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Net P&amp;L
                  </div>
                  <div
                    className={`font-mono text-sm font-semibold tnum ${pnlClass(trade.net_pnl)}`}
                  >
                    {signed(trade.net_pnl)}
                  </div>
                </div>
              </div>
              <p className="text-sm text-fg-secondary">
                You can restore this from Trash for 30 days.
              </p>
            </div>
          }
        />
      )}
    </div>
  )
}
