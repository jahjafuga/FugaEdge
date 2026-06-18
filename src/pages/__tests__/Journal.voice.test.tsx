// @vitest-environment jsdom
//
// Beat D — Journal ⇆ VoiceRecorder wiring tests. Scope is the WIRING, not the
// engine or the recorder internals: the VoiceRecorder is mocked down to two
// buttons (append a transcript / report a duration), the ipc layer is mocked,
// and we assert that a transcript APPENDS into the right textarea (no clobber),
// a duration accumulates + flows into the journalSave payload, and a duration
// change marks the entry dirty. Uses fireEvent (the repo's convention for
// state-driven components).

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JournalDay } from '@shared/journal-types'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    journalGet: vi.fn(),
    journalSave: vi.fn(),
    tradesList: vi.fn(),
    sessionSentimentSave: vi.fn(),
  },
}))

// JournalHeader is date-nav chrome irrelevant to the wiring — stub it out.
vi.mock('@/components/journal/JournalHeader', () => ({ default: () => <div /> }))

// The recorder is exercised elsewhere; here it's two buttons that fire the
// callbacks the Journal wires. Both cards render one, so queries use index
// (premarket card is first in the DOM, postsession second).
vi.mock('@/components/voice/VoiceRecorder', () => ({
  default: ({
    onTranscript,
    onDuration,
  }: {
    onTranscript: (t: string) => void
    onDuration?: (s: number) => void
  }) => (
    <div>
      <button type="button" onClick={() => onTranscript('VOICE')}>
        append-transcript
      </button>
      <button type="button" onClick={() => onDuration?.(7)}>
        set-duration
      </button>
    </div>
  ),
}))

import Journal from '../Journal'
import { ipc } from '@/lib/ipc'

const journalGet = vi.mocked(ipc.journalGet)
const journalSave = vi.mocked(ipc.journalSave)
const tradesList = vi.mocked(ipc.tradesList)

function makeDay(entry: Partial<JournalDay['entry']> | null = null): JournalDay {
  return {
    date: '2026-06-18',
    entry: entry
      ? {
          premarket_notes: '',
          postsession_notes: '',
          emotion_rating: null,
          rules_followed: [],
          rule_violations: [],
          ...entry,
        }
      : null,
    summary: null,
    rules: ['Followed the plan'],
    sentiment: null,
  }
}

beforeEach(() => {
  journalGet.mockReset()
  journalSave.mockReset()
  tradesList.mockReset()
  journalGet.mockResolvedValue(makeDay(null))
  tradesList.mockResolvedValue([])
  // Echo the saved input back as a JournalDay so editorFrom() can rehydrate.
  journalSave.mockImplementation(async (input) =>
    makeDay({
      premarket_notes: input.premarket_notes,
      postsession_notes: input.postsession_notes,
      emotion_rating: input.emotion_rating,
      rules_followed: input.rules_followed,
      rule_violations: input.rule_violations,
      premarket_recording_duration: input.premarket_recording_duration,
      postsession_recording_duration: input.postsession_recording_duration,
    }),
  )
})

function renderJournal() {
  render(
    <MemoryRouter>
      <Journal />
    </MemoryRouter>,
  )
}

const premarketArea = () =>
  screen.getByPlaceholderText(/what are you watching/i) as HTMLTextAreaElement
const postArea = () =>
  screen.getByPlaceholderText(/mistakes, lessons/i) as HTMLTextAreaElement
const saveBtn = () =>
  screen.getByRole('button', { name: /save journal entry/i }) as HTMLButtonElement
const appendBtns = () => screen.getAllByRole('button', { name: 'append-transcript' })
const durationBtns = () => screen.getAllByRole('button', { name: 'set-duration' })

describe('Journal — VoiceRecorder wiring', () => {
  it('appends a transcript into the premarket field without clobbering typed text', async () => {
    renderJournal()
    const area = await screen.findByPlaceholderText(/what are you watching/i)
    fireEvent.change(area, { target: { value: 'typed plan' } })
    fireEvent.click(appendBtns()[0]) // premarket recorder
    expect((area as HTMLTextAreaElement).value).toBe('typed plan\nVOICE')
  })

  it('does not prepend a newline when the field is empty', async () => {
    renderJournal()
    await screen.findByPlaceholderText(/what are you watching/i)
    fireEvent.click(appendBtns()[0])
    expect(premarketArea().value).toBe('VOICE')
  })

  it('appends into the postsession field via the second recorder', async () => {
    renderJournal()
    await screen.findByPlaceholderText(/mistakes, lessons/i)
    fireEvent.click(appendBtns()[1]) // postsession recorder
    expect(postArea().value).toBe('VOICE')
  })

  it('a duration change marks the entry dirty (Save enables)', async () => {
    renderJournal()
    await screen.findByPlaceholderText(/what are you watching/i)
    expect(saveBtn().disabled).toBe(true) // clean on load
    fireEvent.click(durationBtns()[0])
    expect(saveBtn().disabled).toBe(false)
  })

  it('persists the accumulated premarket duration through the save payload', async () => {
    renderJournal()
    await screen.findByPlaceholderText(/what are you watching/i)
    fireEvent.click(durationBtns()[0]) // +7
    fireEvent.click(durationBtns()[0]) // +7 → 14 (accumulates)
    fireEvent.click(saveBtn())
    await waitFor(() => expect(journalSave).toHaveBeenCalled())
    expect(journalSave.mock.calls[0][0]).toMatchObject({
      premarket_recording_duration: 14,
    })
  })

  it('loads a stored duration back from the entry (round-trip)', async () => {
    journalGet.mockResolvedValue(
      makeDay({ premarket_notes: 'loaded', premarket_recording_duration: 42 }),
    )
    renderJournal()
    await screen.findByDisplayValue('loaded')
    // Clean on load (stored duration == snapshot) → Save disabled…
    expect(saveBtn().disabled).toBe(true)
    // …and recording more accumulates onto the stored 42.
    fireEvent.click(durationBtns()[0]) // +7 → 49
    fireEvent.click(saveBtn())
    await waitFor(() => expect(journalSave).toHaveBeenCalled())
    expect(journalSave.mock.calls[0][0]).toMatchObject({
      premarket_recording_duration: 49,
    })
  })
})
