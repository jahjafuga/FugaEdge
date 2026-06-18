// @vitest-environment jsdom
//
// Phase 2 — Journal auto-save. Fake timers drive the debounce; the engine +
// recorder are mocked (this is about the SAVE wiring, not transcription). The
// central guard is the NO-CLOBBER pair: a save must never rehydrate the editor,
// so in-flight keystrokes survive. fireEvent (repo convention for timer-driven
// components); advanceTimersByTimeAsync flushes the debounce + the async save.

import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

// Header stub exposes a date-change trigger (onPrev) so we can test the flush.
vi.mock('@/components/journal/JournalHeader', () => ({
  default: ({ onPrev }: { onPrev: () => void }) => (
    <button type="button" onClick={onPrev}>
      prev-day
    </button>
  ),
}))

// Recorder stub: append a transcript / report a duration (the Beat-D callbacks).
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
const playbooksList = vi.mocked(ipc.playbooksList)

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
  vi.useFakeTimers()
  journalGet.mockReset()
  journalSave.mockReset()
  tradesList.mockReset()
  playbooksList.mockReset()
  journalGet.mockResolvedValue(makeDay(null))
  tradesList.mockResolvedValue([])
  playbooksList.mockResolvedValue([])
  journalSave.mockResolvedValue(makeDay({ premarket_notes: 'echo' }))
})
afterEach(() => {
  vi.useRealTimers()
})

function renderJournal() {
  render(
    <MemoryRouter>
      <Journal />
    </MemoryRouter>,
  )
}
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
async function loadJournal() {
  renderJournal()
  await flush()
}

const premarketArea = () =>
  screen.getByPlaceholderText(/what are you watching/i) as HTMLTextAreaElement
const durationBtns = () => screen.getAllByRole('button', { name: 'set-duration' })

describe('Journal auto-save — debounce + dirty gate', () => {
  it('auto-saves ~1.5s after an edit, no button click', async () => {
    await loadJournal()
    fireEvent.change(premarketArea(), { target: { value: 'typed plan' } })
    expect(journalSave).not.toHaveBeenCalled() // still within the debounce
    await tick(1600)
    expect(journalSave).toHaveBeenCalledTimes(1)
    expect(journalSave.mock.calls[0][0]).toMatchObject({ premarket_notes: 'typed plan' })
  })

  it('does NOT auto-save a clean (untouched) entry', async () => {
    await loadJournal()
    await tick(3000)
    expect(journalSave).not.toHaveBeenCalled()
  })

  it('debounces — rapid edits coalesce into one save', async () => {
    await loadJournal()
    fireEvent.change(premarketArea(), { target: { value: 'a' } })
    await tick(800)
    fireEvent.change(premarketArea(), { target: { value: 'ab' } })
    await tick(800)
    fireEvent.change(premarketArea(), { target: { value: 'abc' } })
    expect(journalSave).not.toHaveBeenCalled() // timer kept resetting
    await tick(1600)
    expect(journalSave).toHaveBeenCalledTimes(1)
    expect(journalSave.mock.calls[0][0]).toMatchObject({ premarket_notes: 'abc' })
  })

  it('carries the Beat-D recording duration in the auto-save payload', async () => {
    await loadJournal()
    fireEvent.click(durationBtns()[0]) // premarket onDuration(7)
    await tick(1600)
    expect(journalSave).toHaveBeenCalled()
    expect(journalSave.mock.calls[0][0]).toMatchObject({ premarket_recording_duration: 7 })
  })

  it('loads a stored duration and accumulates onto it (round-trip)', async () => {
    journalGet.mockResolvedValue(
      makeDay({ premarket_notes: 'loaded', premarket_recording_duration: 42 }),
    )
    await loadJournal()
    fireEvent.click(durationBtns()[0]) // +7 → 49 (accumulates onto the loaded 42)
    await tick(1600)
    expect(journalSave).toHaveBeenCalled()
    expect(journalSave.mock.calls[0][0]).toMatchObject({ premarket_recording_duration: 49 })
  })
})

describe('Journal auto-save — NO CLOBBER (the data-loss guard)', () => {
  it('does not rehydrate the editor from the save response', async () => {
    // The save echoes a DIFFERENT (normalized) value; a rehydrate would push it
    // into the textarea. The editor must keep what the user typed.
    journalSave.mockResolvedValue(makeDay({ premarket_notes: 'SERVER-NORMALIZED' }))
    await loadJournal()
    fireEvent.change(premarketArea(), { target: { value: 'my text' } })
    await tick(1600)
    expect(journalSave).toHaveBeenCalled()
    expect(premarketArea().value).toBe('my text') // NOT 'SERVER-NORMALIZED'
  })

  it('keeps keystrokes typed DURING an in-flight save', async () => {
    let resolveSave: (v: JournalDay) => void = () => {}
    journalSave.mockReturnValue(
      new Promise<JournalDay>((r) => {
        resolveSave = r
      }),
    )
    await loadJournal()
    fireEvent.change(premarketArea(), { target: { value: 'first' } })
    await tick(1600) // save fires, now in-flight (pending)
    expect(journalSave).toHaveBeenCalledTimes(1)
    fireEvent.change(premarketArea(), { target: { value: 'first and more' } }) // type during save
    await act(async () => {
      resolveSave(makeDay({ premarket_notes: 'first' }))
      await Promise.resolve()
    })
    expect(premarketArea().value).toBe('first and more') // newest text survives
  })
})

describe('Journal auto-save — error handling + date-change flush', () => {
  it('a failed save surfaces an error and re-tries (entry stays dirty)', async () => {
    journalSave.mockRejectedValueOnce(new Error('ipc down'))
    await loadJournal()
    fireEvent.change(premarketArea(), { target: { value: 'will fail then retry' } })
    await tick(1600)
    expect(journalSave).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/couldn't save|could not save|save failed/i)).toBeTruthy()
    // still dirty → next debounce re-attempts (second call now succeeds)
    journalSave.mockResolvedValue(makeDay({ premarket_notes: 'will fail then retry' }))
    fireEvent.change(premarketArea(), { target: { value: 'will fail then retry!' } })
    await tick(1600)
    expect(journalSave).toHaveBeenCalledTimes(2)
  })

  it('does not tight-loop retry on a persistent failure (waits for an edit)', async () => {
    journalSave.mockRejectedValue(new Error('persistent'))
    await loadJournal()
    fireEvent.change(premarketArea(), { target: { value: 'fails' } })
    await tick(1600) // first attempt → fails
    expect(journalSave).toHaveBeenCalledTimes(1)
    await tick(6000) // lots of time passes — must NOT auto-retry without an edit
    expect(journalSave).toHaveBeenCalledTimes(1)
  })

  it('flushes a pending edit when the date changes (fixes silent discard)', async () => {
    await loadJournal()
    fireEvent.change(premarketArea(), { target: { value: 'unsaved on date change' } })
    expect(journalSave).not.toHaveBeenCalled() // pending, within debounce
    fireEvent.click(screen.getByRole('button', { name: 'prev-day' })) // change date
    await flush()
    expect(journalSave).toHaveBeenCalled()
    expect(journalSave.mock.calls[0][0]).toMatchObject({
      premarket_notes: 'unsaved on date change',
    })
  })
})
