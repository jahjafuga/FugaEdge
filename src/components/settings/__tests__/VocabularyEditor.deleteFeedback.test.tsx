// Bug A — the SILENT hard-delete branch (a communication fix, not a behaviour one).
//
// The delete GUARD is correct and untouched: the repo hard-deletes only a custom entry with
// ZERO usages and archives everything else (mistakes/repo.ts:280-295; catalyst identical, and
// both are locked by their own repo tests). What was broken is what the user was TOLD. The
// shared VocabularyEditor showed a "kept in history" note on the archive branch but called
// setFeedback(null) on the hard-delete branch — silence — so the one case that really does
// remove a row made it look like the entry "just disappeared".
//
// The editor cannot pre-warn which outcome is coming: VocabDef carries no is_custom and no
// usage count, and no repo/IPC exposes one. The outcome is known ONLY from the delete
// response ({ deleted, archivedInstead }), so both branches must report it AFTER the fact.
//
// Driven through BOTH real consumers, because the component is shared — the fix lands on
// Mistakes and Catalyst together, and each must supply the new copy string.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalystDef } from '@shared/catalyst-types'
import type { MistakeDef } from '@shared/mistakes-types'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    mistakeDefsGet: vi.fn(),
    mistakeDefCreate: vi.fn(),
    mistakeDefRename: vi.fn(),
    mistakeDefsReorder: vi.fn(),
    mistakeDefDelete: vi.fn(),
    mistakeDefUnarchive: vi.fn(),
    catalystDefsGet: vi.fn(),
    catalystDefCreate: vi.fn(),
    catalystDefRename: vi.fn(),
    catalystDefsReorder: vi.fn(),
    catalystDefDelete: vi.fn(),
    catalystDefUnarchive: vi.fn(),
  },
}))

import MistakesVocabularyEditor from '../MistakesVocabularyEditor'
import CatalystVocabularyEditor from '../CatalystVocabularyEditor'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

const MISTAKE: MistakeDef = {
  id: 1,
  axis: 'technical',
  name: 'Mis A',
  sort_position: 0,
  is_custom: true,
  is_archived: false,
}
const CATALYST: CatalystDef = {
  id: 1,
  name: 'Cat A',
  sort_position: 0,
  is_custom: true,
  is_archived: false,
}

// What the repo's guard returns when it really HARD-DELETED (custom + zero usages) ...
const HARD_DELETED = { deleted: true, archivedInstead: false }
// ... and when it ARCHIVED instead (a default, or in use on trades).
const ARCHIVED = { deleted: false, archivedInstead: true }

beforeEach(() => {
  vi.clearAllMocks()
  m.mistakeDefsGet.mockResolvedValue([MISTAKE] as never)
  m.catalystDefsGet.mockResolvedValue([CATALYST] as never)
})

async function armAndConfirmRemove(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Remove ${name}` }))
  fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
}

describe('VocabularyEditor — the hard-delete branch is no longer silent (Mistakes)', () => {
  it('a hard-delete SAYS SO: a permanent-removal note that names the entry', async () => {
    m.mistakeDefDelete.mockResolvedValue(HARD_DELETED as never)
    render(<MistakesVocabularyEditor />)
    await armAndConfirmRemove('Mis A')

    await waitFor(() => expect(m.mistakeDefDelete).toHaveBeenCalledWith({ id: 1 }))
    const note = await screen.findByText(/permanently removed/i)
    expect(note.textContent).toContain('Mis A')
  })

  it('an archive STILL shows the kept-in-history note (the working branch is not broken)', async () => {
    m.mistakeDefDelete.mockResolvedValue(ARCHIVED as never)
    render(<MistakesVocabularyEditor />)
    await armAndConfirmRemove('Mis A')

    const note = await screen.findByText(/kept in your history/i)
    expect(note.textContent).toContain('Mis A')
  })

  it('the two outcomes are DISTINGUISHABLE — a permanent removal never claims the entry was kept', async () => {
    m.mistakeDefDelete.mockResolvedValue(HARD_DELETED as never)
    render(<MistakesVocabularyEditor />)
    await armAndConfirmRemove('Mis A')

    await screen.findByText(/permanently removed/i)
    expect(screen.queryByText(/kept in your history/i)).toBeNull()
  })
})

describe('VocabularyEditor — the SAME fix lands on Catalyst (it is the shared component)', () => {
  it('a hard-delete SAYS SO', async () => {
    m.catalystDefDelete.mockResolvedValue(HARD_DELETED as never)
    render(<CatalystVocabularyEditor />)
    await armAndConfirmRemove('Cat A')

    await waitFor(() => expect(m.catalystDefDelete).toHaveBeenCalledWith({ id: 1 }))
    const note = await screen.findByText(/permanently removed/i)
    expect(note.textContent).toContain('Cat A')
  })

  it('an archive STILL shows the kept-in-history note', async () => {
    m.catalystDefDelete.mockResolvedValue(ARCHIVED as never)
    render(<CatalystVocabularyEditor />)
    await armAndConfirmRemove('Cat A')

    const note = await screen.findByText(/kept in your history/i)
    expect(note.textContent).toContain('Cat A')
  })
})
