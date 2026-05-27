import Modal from '@/components/ui/Modal'
import ApiKeyEntry from '@/components/settings/ApiKeyEntry'
import type { MassiveKeyStatus } from '@shared/massive-types'

// Interception modal shown when the user triggers a backfill without a
// Massive API key configured. Wraps the shared ApiKeyEntry (verify mode)
// inside the generic Modal primitive. Stateless — the caller owns open /
// close and reacts to the verified result via onKeySaved.
interface BackfillKeyModalProps {
  open: boolean
  onClose: () => void
  /** Fired with the Massive verification result after the user saves a key. */
  onKeySaved: (status: MassiveKeyStatus | null) => void
}

export default function BackfillKeyModal({
  open,
  onClose,
  onKeySaved,
}: BackfillKeyModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Massive API key"
      subtitle="Country backfill needs a Massive API key."
      width={480}
    >
      <ApiKeyEntry
        verifyOnSave
        hideHeader
        saveLabel="Save and continue"
        onSaved={onKeySaved}
      />
    </Modal>
  )
}
