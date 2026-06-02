import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import TypeToConfirmModal from '../TypeToConfirmModal'

// v0.2.3 P5 — pins the `confirmWord` widening (string | () => string).
//   • string path  = the pre-existing ResetJournal contract ("DELETE"), also
//     guarded end-to-end by ResetJournalModal.test.tsx through the wrapper.
//   • function path = the new Trash "Delete Forever" count-scaled confirm,
//     where the caller passes `() => String(count)` so the user types the
//     selection count. The component resolves the function once per render
//     (`word`) and the gating, label, and placeholder all read that resolved
//     string — these tests pin that resolve-once contract.

function setup(
  overrides?: Partial<ComponentProps<typeof TypeToConfirmModal>>,
) {
  const onClose = vi.fn()
  const onConfirm = vi.fn().mockResolvedValue(undefined)
  const utils = render(
    <TypeToConfirmModal
      open
      onClose={onClose}
      title="Delete forever?"
      body={<p>This cannot be undone.</p>}
      confirmWord="DELETE"
      confirmLabel="Delete forever"
      busyLabel="Deleting…"
      onConfirm={onConfirm}
      {...overrides}
    />,
  )
  return { onClose, onConfirm, ...utils }
}

const confirmBtn = () =>
  screen.getByRole('button', { name: 'Delete forever' }) as HTMLButtonElement
const wordInput = () => screen.getByRole('textbox') as HTMLInputElement

describe('TypeToConfirmModal — string confirmWord (backward compat)', () => {
  it('starts disabled and arms on the exact word', async () => {
    const user = userEvent.setup()
    setup()
    expect(confirmBtn().disabled).toBe(true)
    await user.type(wordInput(), 'DELETE')
    expect(confirmBtn().disabled).toBe(false)
  })

  it('stays disabled for a case-mismatch', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(wordInput(), 'delete')
    expect(confirmBtn().disabled).toBe(true)
  })
})

describe('TypeToConfirmModal — function confirmWord (Trash count-scaled)', () => {
  it('resolves the function on initial render for the label and placeholder', () => {
    setup({ confirmWord: () => '47' })
    // Label reflects the resolved count…
    expect(screen.getByText('Type 47 to confirm')).toBeTruthy()
    // …and so does the input placeholder.
    expect(screen.getByPlaceholderText('47')).toBeTruthy()
  })

  it('arms only when the input matches the resolved string', async () => {
    const user = userEvent.setup()
    setup({ confirmWord: () => '47' })
    expect(confirmBtn().disabled).toBe(true)
    await user.type(wordInput(), '47')
    expect(confirmBtn().disabled).toBe(false)
  })

  it('does not arm for a non-matching value', async () => {
    const user = userEvent.setup()
    setup({ confirmWord: () => '47' })
    // A near-miss count and an unrelated string both stay gated.
    await user.type(wordInput(), '46')
    expect(confirmBtn().disabled).toBe(true)
  })

  it('stays armed across re-renders with the same function prop', async () => {
    const user = userEvent.setup()
    const word = () => '47'
    const props: ComponentProps<typeof TypeToConfirmModal> = {
      open: true,
      onClose: vi.fn(),
      title: 'Delete forever?',
      body: <p>x</p>,
      confirmWord: word,
      confirmLabel: 'Delete forever',
      busyLabel: 'Deleting…',
      onConfirm: vi.fn().mockResolvedValue(undefined),
    }
    const { rerender } = render(<TypeToConfirmModal {...props} />)
    await user.type(wordInput(), '47')
    expect(confirmBtn().disabled).toBe(false)
    // Resolve-once recomputes `word()` on every render; the gating must survive
    // a re-render because the resolved value is stable. A regression in the
    // pattern (e.g. comparing against the function reference) would re-disable.
    rerender(<TypeToConfirmModal {...props} subtitle="changed" />)
    expect(confirmBtn().disabled).toBe(false)
  })

  it('calls onConfirm once when armed and confirmed', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup({ confirmWord: () => '47' })
    await user.type(wordInput(), '47')
    await user.click(confirmBtn())
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
