import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import PlaybookPicker from '@/components/playbook/PlaybookPicker'
import { signed, pnlClass } from '@/lib/format'

interface BulkSetPlaybookModalProps {
  open: boolean
  onClose: () => void
  /** Number of selected trades the pick will apply to. */
  count: number
  /** Combined Net P&L of the selection (preview only). */
  netPnlTotal?: number
  /** In-flight flag — disables the buttons and swaps the Apply label. */
  busy?: boolean
  /** Apply-reject error; shown inline, modal stays open for retry. */
  error?: string | null
  onApply: (playbookId: number | null) => void
}

// Phase 2 bulk-retag — the "Set playbook" surface: a single-select PlaybookPicker
// + an Apply-to-N confirm, in ONE modal (the button -> picker -> confirm
// composition). Non-destructive (gold Apply, not loss-red). Apply is disabled
// until the user actively picks (touched) so it never applies nothing by accident;
// choosing "No playbook" is a valid pick (bulk-clear). Mirrors ConfirmModal's
// shell + button styling; carries the picker inline rather than a separate confirm.
export default function BulkSetPlaybookModal({
  open,
  onClose,
  count,
  netPnlTotal,
  busy = false,
  error = null,
  onApply,
}: BulkSetPlaybookModalProps) {
  const [pendingPlaybookId, setPendingPlaybookId] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)

  // Reset the pending pick each time the modal opens (a fresh selection).
  useEffect(() => {
    if (open) {
      setPendingPlaybookId(null)
      setTouched(false)
    }
  }, [open])

  const plural = count === 1 ? '' : 's'

  return (
    <Modal
      open={open}
      onClose={onClose}
      premium
      title={`Set playbook on ${count} trade${plural}?`}
      width={440}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Playbook
          </span>
          <PlaybookPicker
            value={pendingPlaybookId}
            onChange={(id) => {
              setPendingPlaybookId(id)
              setTouched(true)
            }}
          />
          <p className="text-xs text-fg-tertiary">
            Sets the primary playbook on all selected trades. "No playbook" clears it.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-2 px-4 py-3">
          <div className="font-mono text-base font-semibold text-fg-primary tnum">
            {count} trade{plural}
          </div>
          {netPnlTotal != null && (
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                Combined Net P&amp;L
              </div>
              <div
                className={`font-mono text-sm font-semibold tnum ${pnlClass(netPnlTotal)}`}
              >
                {signed(netPnlTotal)}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="text-xs font-medium text-loss">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border-strong bg-bg-1 px-4 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(pendingPlaybookId)}
            disabled={busy || !touched}
            className="inline-flex h-9 cursor-pointer items-center rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Applying…' : `Apply to ${count}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
