import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ResetJournalModal from '../ResetJournalModal'
import { ipc } from '@/lib/ipc'

// GUARD 3 characterization suite (v0.2.3 P3). This pins the CURRENT behavior
// of ResetJournalModal BEFORE TypeToConfirmModal is extracted out of it. The
// same file must stay green, unmodified, after the extraction — any regression
// here means the refactor changed observable behavior.
vi.mock('@/lib/ipc', () => ({
  ipc: { resetDatabase: vi.fn() },
}))

const resetDatabase = vi.mocked(ipc.resetDatabase)

// The confirm button's accessible name flips between these two strings; the
// title ("Reset journal") is a div, not a button, so the role query is exact.
const confirmBtn = () =>
  screen.getByRole('button', { name: 'Reset journal' }) as HTMLButtonElement
const cancelBtn = () =>
  screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement
const wordInput = () => screen.getByRole('textbox') as HTMLInputElement

function openModal() {
  const onClose = vi.fn()
  render(<ResetJournalModal open onClose={onClose} />)
  return { onClose }
}

beforeEach(() => {
  resetDatabase.mockReset()
  resetDatabase.mockResolvedValue(undefined as never)
})

describe('ResetJournalModal — type-to-confirm gating', () => {
  it('starts with the confirm button disabled', () => {
    openModal()
    expect(confirmBtn().disabled).toBe(true)
  })

  it('keeps confirm disabled for the wrong word (case-sensitive)', async () => {
    const user = userEvent.setup()
    openModal()
    await user.type(wordInput(), 'delete')
    expect(confirmBtn().disabled).toBe(true)
  })

  it('enables confirm when the exact word DELETE is typed', async () => {
    const user = userEvent.setup()
    openModal()
    await user.type(wordInput(), 'DELETE')
    expect(confirmBtn().disabled).toBe(false)
  })

  it('enables confirm when DELETE is typed with surrounding whitespace', async () => {
    const user = userEvent.setup()
    openModal()
    await user.type(wordInput(), '  DELETE  ')
    expect(confirmBtn().disabled).toBe(false)
  })
})

describe('ResetJournalModal — confirm action', () => {
  it('calls ipc.resetDatabase exactly once on confirm', async () => {
    const user = userEvent.setup()
    openModal()
    await user.type(wordInput(), 'DELETE')
    await user.click(confirmBtn())
    expect(resetDatabase).toHaveBeenCalledTimes(1)
  })

  it('disables the input and shows "Resetting…" while the reset is in flight', async () => {
    const user = userEvent.setup()
    // A promise that never settles holds the component in its in-flight state.
    resetDatabase.mockReturnValue(new Promise<void>(() => {}) as never)
    openModal()
    await user.type(wordInput(), 'DELETE')
    await user.click(confirmBtn())

    const busy = (await screen.findByRole('button', {
      name: 'Resetting…',
    })) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect(wordInput().disabled).toBe(true)
    expect(cancelBtn().disabled).toBe(true)
  })

  it('surfaces an error from ipc.resetDatabase and leaves the modal usable', async () => {
    const user = userEvent.setup()
    resetDatabase.mockRejectedValue(new Error('disk on fire'))
    openModal()
    await user.type(wordInput(), 'DELETE')
    await user.click(confirmBtn())

    expect(await screen.findByText('disk on fire')).toBeTruthy()
    // resetting cleared → button reverts to "Reset journal" and re-enables
    // because the confirm word is still present in the input.
    await waitFor(() => expect(confirmBtn().disabled).toBe(false))
  })
})

describe('ResetJournalModal — cancel', () => {
  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = openModal()
    await user.click(cancelBtn())
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
