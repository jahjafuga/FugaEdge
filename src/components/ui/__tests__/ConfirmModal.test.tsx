import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import ConfirmModal from '../ConfirmModal'

// Distinct title / confirm-label / body strings so role+text queries stay
// unambiguous (the Modal title is a div, the confirm label is a button).
function setup(overrides?: Partial<ComponentProps<typeof ConfirmModal>>) {
  const onClose = vi.fn()
  const onConfirm = vi.fn()
  render(
    <ConfirmModal
      open
      onClose={onClose}
      title="Delete trade?"
      body={<p>Recoverable for 30 days.</p>}
      confirmLabel="Move to Trash"
      onConfirm={onConfirm}
      {...overrides}
    />,
  )
  return { onClose, onConfirm }
}

const btn = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement

describe('ConfirmModal', () => {
  it('renders the title and body', () => {
    setup()
    expect(screen.getByText('Delete trade?')).toBeTruthy()
    expect(screen.getByText('Recoverable for 30 days.')).toBeTruthy()
  })

  it('fires onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup()
    await user.click(btn('Move to Trash'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('fires onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = setup()
    await user.click(btn('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables confirm and shows busyLabel while busy', () => {
    setup({ busy: true, busyLabel: 'Moving…' })
    const confirm = btn('Moving…')
    expect(confirm.disabled).toBe(true)
    // The idle label is no longer present while busy.
    expect(screen.queryByRole('button', { name: 'Move to Trash' })).toBeNull()
  })

  it('applies loss styling to the confirm button when tone is destructive', () => {
    setup({ tone: 'destructive' })
    expect(btn('Move to Trash').className).toContain('bg-loss')
  })

  it('does not apply loss styling to the confirm button by default', () => {
    setup()
    expect(btn('Move to Trash').className).not.toContain('bg-loss')
  })
})
