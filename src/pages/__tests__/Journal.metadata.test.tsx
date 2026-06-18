// @vitest-environment jsdom
//
// Phase 3 — the inline recording-metadata line under each journal field. The
// recorder is stubbed to a "set-duration" button (fires onDuration); text comes
// from the textarea. We assert the four honest display states and that each
// field shows its own line. Pure display — no save assertions here.

import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JournalDay } from '@shared/journal-types'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    journalGet: vi.fn(),
    journalSave: vi.fn(),
    tradesList: vi.fn(),
    playbooksList: vi.fn(),
    sessionSentimentSave: vi.fn(),
  },
}))
vi.mock('@/components/journal/JournalHeader', () => ({ default: () => <div /> }))
vi.mock('@/components/voice/VoiceRecorder', () => ({
  default: ({ onDuration }: { onDuration?: (s: number) => void }) => (
    <button type="button" onClick={() => onDuration?.(34)}>
      set-duration
    </button>
  ),
}))

import Journal from '../Journal'
import { ipc } from '@/lib/ipc'

const journalGet = vi.mocked(ipc.journalGet)
const journalSave = vi.mocked(ipc.journalSave)
const tradesList = vi.mocked(ipc.tradesList)
const playbooksList = vi.mocked(ipc.playbooksList)

function makeDay(): JournalDay {
  return { date: '2026-06-18', entry: null, summary: null, rules: ['Followed the plan'], sentiment: null }
}

beforeEach(() => {
  journalGet.mockReset()
  journalSave.mockReset()
  tradesList.mockReset()
  playbooksList.mockReset()
  journalGet.mockResolvedValue(makeDay())
  tradesList.mockResolvedValue([])
  playbooksList.mockResolvedValue([])
  journalSave.mockResolvedValue(makeDay())
})

function renderJournal() {
  render(
    <MemoryRouter>
      <Journal />
    </MemoryRouter>,
  )
}
const premarketDurationBtn = () =>
  screen.getAllByRole('button', { name: 'set-duration' })[0] // premarket recorder

describe('Journal — recording-metadata line (premarket states)', () => {
  it('text + recording → "0:34 · N words"', async () => {
    renderJournal()
    const area = await screen.findByPlaceholderText(/what are you watching/i)
    fireEvent.change(area, { target: { value: 'two words here' } }) // 3 words
    fireEvent.click(premarketDurationBtn()) // onDuration(34) → 0:34
    expect(screen.getByText('0:34 · 3 words')).toBeTruthy()
  })

  it('text only → "N words" (no duration, no separator)', async () => {
    renderJournal()
    const area = await screen.findByPlaceholderText(/what are you watching/i)
    fireEvent.change(area, { target: { value: 'just typed text' } }) // 3 words
    expect(screen.getByText('3 words')).toBeTruthy() // exact text → no duration / no "·"
  })

  it('recording only, empty text → "0:34" (no words)', async () => {
    renderJournal()
    await screen.findByPlaceholderText(/what are you watching/i)
    fireEvent.click(premarketDurationBtn()) // duration set, text still empty
    expect(screen.getByText('0:34')).toBeTruthy() // exact text → no words / no "·"
  })

  it('empty field → no metadata line at all (honest empty state)', async () => {
    renderJournal()
    await screen.findByPlaceholderText(/what are you watching/i)
    expect(screen.queryByText(/\bwords?\b/)).toBeNull()
    expect(screen.queryByText(/\d:\d\d/)).toBeNull()
  })
})

describe('Journal — recording-metadata line (postsession + singular)', () => {
  it('postsession shows its own count; a single word is singular', async () => {
    renderJournal()
    const post = await screen.findByPlaceholderText(/mistakes, lessons/i)
    fireEvent.change(post, { target: { value: 'one' } }) // 1 word
    expect(screen.getByText('1 word')).toBeTruthy()
  })
})
