import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CatalystVocabularyEditor from '../CatalystVocabularyEditor'
import { ipc } from '@/lib/ipc'
import type { CatalystDef } from '@shared/catalyst-types'

// Characterization tests for the UNTESTED catalyst vocab ops — reorder, rename,
// confirm-delete, unarchive (the single-list twin of the Mistakes editor). lock-#4
// covers only the ADD path. Green on current code; tripwire for the twin-merge.
// The reorder assertion deliberately pins the NO-axis payload (the key shape diff
// the merge's group model must preserve).
vi.mock('@/lib/ipc', () => ({
  ipc: {
    settingsSave: vi.fn(),
    catalystDefsGet: vi.fn(),
    catalystDefCreate: vi.fn(),
    catalystDefRename: vi.fn(),
    catalystDefsReorder: vi.fn(),
    catalystDefDelete: vi.fn(),
    catalystDefUnarchive: vi.fn(),
  },
}))
const m = vi.mocked(ipc)

const def = (over: Partial<CatalystDef>): CatalystDef => ({
  id: 0,
  name: '',
  sort_position: 0,
  is_custom: true,
  is_archived: false,
  ...over,
})

// active: Cat A(1), Cat B(2); archived: Cat Archived(3).
const SEED: CatalystDef[] = [
  def({ id: 1, name: 'Cat A', sort_position: 0 }),
  def({ id: 2, name: 'Cat B', sort_position: 1 }),
  def({ id: 3, name: 'Cat Archived', sort_position: 2, is_archived: true }),
]

beforeEach(() => {
  vi.clearAllMocks()
  m.catalystDefsGet.mockResolvedValue(SEED as never)
  m.catalystDefsReorder.mockResolvedValue([] as never)
  m.catalystDefRename.mockResolvedValue(def({ id: 1, name: 'Cat A renamed' }) as never)
  m.catalystDefDelete.mockResolvedValue({ deleted: true, archivedInstead: false } as never)
  m.catalystDefUnarchive.mockResolvedValue(
    def({ id: 3, name: 'Cat Archived', is_archived: false }) as never,
  )
})

// Independence property (lock-#4, extended to EVERY op): no vocab operation ever
// routes through the page savebar's settingsSave.
afterEach(() => {
  expect(m.settingsSave).not.toHaveBeenCalled()
})

async function renderSeeded() {
  render(<CatalystVocabularyEditor />)
  await screen.findByRole('button', { name: 'Cat A' })
}

describe('CatalystVocabularyEditor — reorder', () => {
  it('move-down on the first row sends reorder({ordered_ids}) with NO axis key', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Move Cat A down' }))
    await waitFor(() =>
      expect(m.catalystDefsReorder).toHaveBeenCalledWith({ ordered_ids: [2, 1] }),
    )
  })

  it('disables the first row up-arrow and the last row down-arrow', async () => {
    await renderSeeded()
    expect(
      (screen.getByRole('button', { name: 'Move Cat A up' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Move Cat B down' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

describe('CatalystVocabularyEditor — rename', () => {
  it('committing a rename with Enter sends rename({id, name})', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Cat A' }))
    const input = screen.getByDisplayValue('Cat A')
    fireEvent.change(input, { target: { value: 'Cat A renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(m.catalystDefRename).toHaveBeenCalledWith({ id: 1, name: 'Cat A renamed' }),
    )
  })

  it('a whitespace-only rename fires no rename IPC (current no-op)', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Cat B' }))
    const input = screen.getByDisplayValue('Cat B')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(m.catalystDefRename).not.toHaveBeenCalled()
  })
})

describe('CatalystVocabularyEditor — delete (confirm flow)', () => {
  it('arm then confirm Yes sends delete({id})', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Cat A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    await waitFor(() => expect(m.catalystDefDelete).toHaveBeenCalledWith({ id: 1 }))
  })

  it('arm then cancel No fires no delete IPC', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Cat A' }))
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(m.catalystDefDelete).not.toHaveBeenCalled()
  })
})

describe('CatalystVocabularyEditor — unarchive', () => {
  it('Show archived then Restore sends unarchive({id})', async () => {
    await renderSeeded()
    fireEvent.click(screen.getByRole('button', { name: 'Show archived' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Cat Archived' }))
    await waitFor(() => expect(m.catalystDefUnarchive).toHaveBeenCalledWith({ id: 3 }))
  })
})
