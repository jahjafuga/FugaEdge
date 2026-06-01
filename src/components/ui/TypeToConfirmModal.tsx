import { useState, type ReactNode } from 'react'
import Modal from '@/components/ui/Modal'

interface TypeToConfirmModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  /** Explanatory copy shown above the confirm input. */
  body: ReactNode
  /** The word the user must type verbatim (compared after trim) to arm confirm. */
  confirmWord: string
  /** Destructive confirm button label when idle. */
  confirmLabel: string
  /** Confirm button label while onConfirm is in flight. */
  busyLabel: string
  /** Runs when confirmed. On success the modal STAYS in its busy state — the
   *  caller owns what happens next (close, relaunch, navigate). On throw, the
   *  message is surfaced inline and the modal returns to an editable state. */
  onConfirm: () => Promise<void>
  /** Modal width in px. Defaults to 480. */
  width?: number
}

// Heavyweight destructive-action guard: the confirm button stays disabled
// until the user types `confirmWord` verbatim. Extracted from ResetJournalModal
// so other destructive flows (e.g. the v0.2.3 Trash "Delete Forever") can reuse
// the exact same gating + in-flight + error semantics.
export default function TypeToConfirmModal({
  open,
  onClose,
  title,
  subtitle,
  body,
  confirmWord,
  confirmLabel,
  busyLabel,
  onConfirm,
  width = 480,
}: TypeToConfirmModalProps) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canConfirm = !busy && value.trim() === confirmWord

  const handleConfirm = async () => {
    if (!canConfirm) return
    setError(null)
    setBusy(true)
    try {
      await onConfirm()
      // Success: leave `busy` set. Mirrors the reset-journal flow where the app
      // relaunches and this component is torn down; the caller decides the
      // post-success transition.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} width={width}>
      <div className="flex flex-col gap-4">
        {body}

        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Type {confirmWord} to confirm
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={confirmWord}
            disabled={busy}
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-border-strong bg-bg-1 px-3 py-2 font-mono text-sm text-fg-primary placeholder:text-fg-tertiary outline-none transition-colors duration-150 focus:border-gold disabled:opacity-50"
          />
        </label>

        {error && (
          <div className="rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-xs text-fg-secondary">
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
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="inline-flex h-9 cursor-pointer items-center rounded-md bg-loss px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-loss/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
