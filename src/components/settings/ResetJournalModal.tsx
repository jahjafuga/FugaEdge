import TypeToConfirmModal from '@/components/ui/TypeToConfirmModal'
import { ipc } from '@/lib/ipc'

interface ResetJournalModalProps {
  open: boolean
  onClose: () => void
}

// Destructive-action guard for "Reset journal". The live database is renamed
// aside to a dated fugaedge-reset-*.db file (recoverable manually — no
// restore UI in v0.2.0) and FugaEdge restarts on a fresh empty journal.
//
// The type-to-confirm mechanics live in the reusable TypeToConfirmModal; this
// component only supplies the reset-specific copy and the reset IPC call.
export default function ResetJournalModal({ open, onClose }: ResetJournalModalProps) {
  return (
    <TypeToConfirmModal
      open={open}
      onClose={onClose}
      title="Reset journal"
      subtitle="Start over with a fresh, empty journal."
      confirmWord="DELETE"
      confirmLabel="Reset journal"
      busyLabel="Resetting…"
      onConfirm={async () => {
        await ipc.resetDatabase()
        // Success: the main process relaunches FugaEdge within ~200ms. Nothing
        // more to do here — TypeToConfirmModal stays in its busy state until
        // the app restarts and tears this component down.
      }}
      body={
        <p className="text-sm text-fg-secondary">
          Your current journal — every trade, note, and setting — is saved
          aside as a dated{' '}
          <span className="font-mono text-fg-primary">fugaedge-reset-….db</span>{' '}
          file next to the database, then FugaEdge restarts on a fresh empty
          journal. Recovering the old data is a manual step — there is no
          in-app restore yet — so only do this if you mean it.
        </p>
      }
    />
  )
}
