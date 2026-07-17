// @vitest-environment jsdom
//
// THE FINAL TWO (build B) — the renderer pin: the archived-collision
// message travels through VocabularyEditor's EXISTING error pipe
// (errText -> row-scoped feedback, the "keep the input open" branch).
// Zero renderer changes in this beat — this pin is green before AND after
// the repo guards land; it exists so the pipe can never silently regress
// out from under the new messages. Declared green-first.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import VocabularyEditor, {
  type VocabDef,
  type VocabOperations,
} from '../VocabularyEditor'

const DEF: VocabDef = { id: 1, name: 'Earnings', sort_position: 0, is_archived: false, group: null }

const ARCHIVED_MSG = '"FDA approval" already exists — archived; unarchive it instead'

function ops(): VocabOperations {
  return {
    defsGet: vi.fn(async () => [DEF]),
    create: vi.fn(async () => DEF),
    rename: vi.fn(async () => {
      // Mirror the IPC wrapping the repo guard's throw.
      throw new Error(`Error invoking remote method 'catalyst:rename': Error: ${ARCHIVED_MSG}`)
    }),
    reorder: vi.fn(async () => [DEF]),
    delete: vi.fn(async () => ({ deleted: false, archivedInstead: true })),
    unarchive: vi.fn(async () => DEF),
  }
}

describe('VocabularyEditor — the archived-collision message surfaces (build B renderer pin)', () => {
  it('(6) a rejected rename shows the repo message through the existing pipe and keeps the input open', async () => {
    render(
      <VocabularyEditor
        groups={[{ key: null, label: 'Catalyst type' }]}
        operations={ops()}
        copy={{
          label: 'Catalysts',
          description: 'd',
          addPlaceholder: 'Add a catalyst',
          keptInHistoryNote: (n) => `${n} kept in history`,
          permanentlyRemovedNote: (n) => `${n} permanently removed`,
        }}
      />,
    )
    // Load, open the inline rename, commit a colliding name.
    fireEvent.click(await screen.findByRole('button', { name: 'Earnings' }))
    const input = screen.getByDisplayValue('Earnings')
    fireEvent.change(input, { target: { value: 'FDA approval' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // The repo's message, unwrapped by errText, lands as row feedback; the
    // input stays open so the user can fix the name.
    await waitFor(() => expect(screen.getByText(ARCHIVED_MSG)).toBeTruthy())
    expect(screen.getByDisplayValue('FDA approval')).toBeTruthy()
  })
})
