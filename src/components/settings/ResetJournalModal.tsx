import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { ipc } from '@/lib/ipc'

interface ResetJournalModalProps {
  open: boolean
  onClose: () => void
}

const CONFIRM_WORD = 'DELETE'

// Destructive-action guard for "Reset journal". The live database is renamed
// aside to a dated fugaedge-reset-*.db file (recoverable manually — no
// restore UI in v0.2.0) and FugaEdge restarts on a fresh empty journal.
export default function ResetJournalModal({ open, onClose }: ResetJournalModalProps) {
  const [value, setValue] = useState('')
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canReset = !resetting && value.trim() === CONFIRM_WORD

  const handleReset = async () => {
    if (!canReset) return
    setError(null)
    setResetting(true)
    try {
      await ipc.resetDatabase()
      // Success: the main process relaunches FugaEdge within ~200ms. Keep the
      // "Resetting…" state on screen until the app restarts — there is
      // nothing more for this component to do.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResetting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset journal"
      subtitle="Start over with a fresh, empty journal."
      width={480}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-secondary">
          Your current journal — every trade, note, and setting — is saved
          aside as a dated{' '}
          <span className="font-mono text-fg-primary">fugaedge-reset-….db</span>{' '}
          file next to the database, then FugaEdge restarts on a fresh empty
          journal. Recovering the old data is a manual step — there is no
          in-app restore yet — so only do this if you mean it.
        </p>

        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Type {CONFIRM_WORD} to confirm
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={CONFIRM_WORD}
            disabled={resetting}
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
            disabled={resetting}
            className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border-strong bg-bg-1 px-4 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={!canReset}
            className="inline-flex h-9 cursor-pointer items-center rounded-md bg-loss px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-loss/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {resetting ? 'Resetting…' : 'Reset journal'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
