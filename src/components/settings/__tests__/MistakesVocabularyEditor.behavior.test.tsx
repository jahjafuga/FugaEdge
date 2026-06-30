import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MistakesVocabularyEditor from '../MistakesVocabularyEditor'
import { ipc } from '@/lib/ipc'
import type { MistakeDef } from '@shared/mistakes-types'

// Characterization tests for the UNTESTED vocab-editor operations — reorder,
// rename, confirm-delete, unarchive, and axis threading. lock-#4 only covers the
// ADD path. These pin CURRENT behavior (green on the unchanged component) so they
// are the tripwire for the planned Mistakes/Catalyst twin-merge extraction.
vi.mock('@/lib/ipc', () => ({
  ipc: {
    settingsSave: vi.fn(),
    mistakeDefsGet: vi.fn(),
    mistakeDefCreate: vi.fn(),
    mistakeDefRename: vi.fn(),
    mistakeDefsReorder: vi.fn(),
    mistakeDefDelete: vi.fn(),
    mistakeDefUnarchive: vi.fn(),
  },
}))
const m = vi.mocked(ipc)

const def = (over: Partial<MistakeDef>): MistakeDef => ({
  id: 0,
  axis: 'technical',
  name: '',
  sort_position: 0,
  is_custom: true,
  is_archived: false,
  ...over,
})

// technical active: Tech A(1), Tech B(2); psychological active: Psy A(3), Psy B(4);
// technical archived: Tech Archived(5).
const SEED: MistakeDef[] = [
  def({ id: 1, axis: 'technical', name: 'Tech A', sort_position: 0 }),
  def({ id: 2, axis: 'technical', name: 'Tech B', sort_position: 1 }),
  def({ id: 3, axis: 'psychological', name: 'Psy A', sort_position: 0 }),
  def({ id: 4, axis: 'psychological', name: 'Psy B', sort_position: 1 }),
  def({ id: 5, axis: 'technical', name: 'Tech Archived', sort_position: 2, is_archived: true }),
]

beforeEach(() => {
  vi.clearAllMocks()
  m.mistakeDefsGet.mockResolvedValue(SEED as never)
  m.mistakeDefsReorder.mockResolvedValue([] as never)
  m.mistakeDefCreate.mockResolvedValue(def({ id: 99, name: 'Created' }) as never)
  m.mistakeDefRename.mockResolvedValue(def({ id: 1, name: 'Tech A renamed' }) as never)
  m.mistakeDefDelete.mockResolvedValue({ deleted: true, archivedInstead: false } as never)
  m.mistakeDefUnarchive.mockResolvedValue(
    def({ id: 5, name: 'Tech Archived', is_archived: false }) as never,
  )
})

// Independence property (lock-#4, extended to EVERY op): no vocab operation ever
// routes through the page savebar's settingsSave.
afterEach(() => {
  expect(m.settingsSave).not.toHaveBeenCalled()
})

async function renderSeeded() {
  render(<MistakesVocabularyEditor />)
  await screen.findByRole('button', { name: 'Tech A' })
}

describe('MistakesVocabularyEditor — reorder', () => {
  it('move-down on the first Technical row sends reorder swapped, with axis', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Move Tech A down' }))
    await waitFor(() =>
      expect(m.mistakeDefsReorder).toHaveBeenCalledWith({
        axis: 'technical',
        ordered_ids: [2, 1],
      }),
    )
  })

  it('disables the first row up-arrow and the last row down-arrow', async () => {
    await renderSeeded()
    expect(
      (screen.getByRole('button', { name: 'Move Tech A up' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Move Tech B down' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

describe('MistakesVocabularyEditor — axis threading', () => {
  it('a reorder in the Psychological column carries axis:psychological', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Move Psy A down' }))
    await waitFor(() =>
      expect(m.mistakeDefsReorder).toHaveBeenCalledWith({
        axis: 'psychological',
        ordered_ids: [4, 3],
      }),
    )
  })

  it('an add in the Psychological column carries axis:psychological', async () => {
    await renderSeeded()
    const inputs = screen.getAllByPlaceholderText('Add a mistake (press Enter)')
    fireEvent.change(inputs[1], { target: { value: 'New psy' } }) // [1] = Psychological card
    fireEvent.click(screen.getAllByRole('button', { name: 'add' })[1])
    await waitFor(() =>
      expect(m.mistakeDefCreate).toHaveBeenCalledWith({ axis: 'psychological', name: 'New psy' }),
    )
  })
})

describe('MistakesVocabularyEditor — rename', () => {
  it('committing a rename with Enter sends rename({id, name})', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Tech A' }))
    const input = screen.getByDisplayValue('Tech A')
    fireEvent.change(input, { target: { value: 'Tech A renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(m.mistakeDefRename).toHaveBeenCalledWith({ id: 1, name: 'Tech A renamed' }),
    )
  })

  it('a whitespace-only rename fires no rename IPC (current no-op)', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Tech B' }))
    const input = screen.getByDisplayValue('Tech B')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(m.mistakeDefRename).not.toHaveBeenCalled()
  })
})

describe('MistakesVocabularyEditor — delete (confirm flow)', () => {
  it('arm then confirm Yes sends delete({id})', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tech A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    await waitFor(() => expect(m.mistakeDefDelete).toHaveBeenCalledWith({ id: 1 }))
  })

  it('arm then cancel No fires no delete IPC', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tech A' }))
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(m.mistakeDefDelete).not.toHaveBeenCalled()
  })
})

describe('MistakesVocabularyEditor — unarchive', () => {
  it('Show archived then Restore sends unarchive({id})', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Show archived' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Tech Archived' }))
    await waitFor(() => expect(m.mistakeDefUnarchive).toHaveBeenCalledWith({ id: 5 }))
  })
})
