import { type ReactNode } from 'react'
import Modal from '@/components/ui/Modal'

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Body content shown above the action row (e.g. a preview + 30-day note). */
  body: ReactNode
  confirmLabel: string
  /** Confirm label while the action is in flight. Defaults to confirmLabel. */
  busyLabel?: string
  /** Caller-controlled in-flight flag: disables both buttons and swaps the
   *  confirm label to busyLabel. */
  busy?: boolean
  /** Visual weight of the confirm button. 'destructive' = loss red; 'default'
   *  = gold primary. */
  tone?: 'default' | 'destructive'
  onConfirm: () => void | Promise<void>
}

// Lightweight confirm dialog — a single confirm + cancel, no type-to-confirm
// gate. For reversible-but-notable actions (e.g. v0.2.3 soft-delete "Move to
// Trash", where the body carries a preview + the 30-day recovery note).
// In-flight state and error handling are owned by the caller via `busy` /
// `onConfirm`; for the heavyweight type-to-confirm flow see TypeToConfirmModal.
export default function ConfirmModal({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  busyLabel,
  busy = false,
  tone = 'default',
  onConfirm,
}: ConfirmModalProps) {
  const confirmTone =
    tone === 'destructive'
      ? 'bg-loss text-white hover:bg-loss/90'
      : 'bg-gold text-accent-ink hover:bg-gold-hover'

  return (
    <Modal open={open} onClose={onClose} title={title} width={440}>
      <div className="flex flex-col gap-4">
        {body}

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
            onClick={() => onConfirm()}
            disabled={busy}
            className={`inline-flex h-9 cursor-pointer items-center rounded-md px-4 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${confirmTone}`}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
