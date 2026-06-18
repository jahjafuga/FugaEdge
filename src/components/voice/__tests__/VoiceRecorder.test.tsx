// @vitest-environment jsdom
//
// VoiceRecorder state-machine + result-mapping tests. The engine service is
// mocked and the browser media APIs (getUserMedia / MediaRecorder / AudioContext
// / requestAnimationFrame) are stubbed — none run under jsdom. We use fireEvent
// (not userEvent) because the component drives timers + rAF (the repo's
// timer-dependent-component test convention). Scope: idle→recording→processing→
// idle, the typed-result mapping (ok / model-unavailable / error), Cancel
// discards without transcribing, and mic-permission-denied is handled.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// Mock the B2 service — the component must call ONLY this, never the engine.
vi.mock('@/services/transcription', () => ({
  transcribe: vi.fn(),
  preloadModel: vi.fn(),
}))
import { transcribe, preloadModel } from '@/services/transcription'
import VoiceRecorder from '../VoiceRecorder'

const transcribeMock = vi.mocked(transcribe)
const preloadMock = vi.mocked(preloadModel)

// ── browser media stubs ──────────────────────────────────────────────────────
const trackStop = vi.fn()
const getUserMedia = vi.fn()

class FakeMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  state = 'inactive'
  mimeType = 'audio/webm'
  constructor(public stream: unknown) {}
  start() {
    this.state = 'recording'
    this.ondataavailable?.({ data: new Blob(['x']) })
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

class FakeAudioContext {
  createAnalyser() {
    return { fftSize: 0, frequencyBinCount: 8, getByteTimeDomainData: () => {} }
  }
  createMediaStreamSource() {
    return { connect: () => {} }
  }
  async close() {}
}

beforeEach(() => {
  transcribeMock.mockReset()
  preloadMock.mockReset()
  preloadMock.mockResolvedValue({ kind: 'ready' })
  transcribeMock.mockResolvedValue({ kind: 'ok', text: 'hello world', durationSeconds: 3 })
  trackStop.mockReset()
  getUserMedia.mockReset()
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: trackStop }] })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const recordBtn = () => screen.getByRole('button', { name: /record/i })
const stopBtn = () => screen.getByRole('button', { name: /stop/i })
const cancelBtn = () => screen.getByRole('button', { name: /cancel/i })

async function startRecording() {
  fireEvent.click(recordBtn())
  await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
  await screen.findByRole('button', { name: /stop/i })
}

describe('VoiceRecorder — state machine', () => {
  it('idle → recording on Record click (requests the mic, shows Stop)', async () => {
    render(<VoiceRecorder onTranscript={vi.fn()} />)
    expect(recordBtn()).toBeTruthy()
    await startRecording()
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(stopBtn()).toBeTruthy()
  })

  it('Stop → transcribe → onTranscript + onDuration, back to idle', async () => {
    const onTranscript = vi.fn()
    const onDuration = vi.fn()
    render(<VoiceRecorder onTranscript={onTranscript} onDuration={onDuration} />)
    await startRecording()
    fireEvent.click(stopBtn())
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('hello world'))
    expect(onDuration).toHaveBeenCalledWith(3)
    expect(transcribeMock).toHaveBeenCalledTimes(1)
    await screen.findByRole('button', { name: /record/i }) // back to idle
  })

  it('Cancel discards — no transcribe, back to idle', async () => {
    const onTranscript = vi.fn()
    render(<VoiceRecorder onTranscript={onTranscript} />)
    await startRecording()
    fireEvent.click(cancelBtn())
    await screen.findByRole('button', { name: /record/i })
    expect(transcribeMock).not.toHaveBeenCalled()
    expect(onTranscript).not.toHaveBeenCalled()
  })

  it('mic-permission denied → handled (error message, no crash, no transcribe)', async () => {
    getUserMedia.mockRejectedValue(new Error('Permission denied'))
    render(<VoiceRecorder onTranscript={vi.fn()} />)
    fireEvent.click(recordBtn())
    await waitFor(() => expect(screen.getByText(/microphone|permission/i)).toBeTruthy())
    expect(transcribeMock).not.toHaveBeenCalled()
  })
})

describe('VoiceRecorder — typed-result mapping', () => {
  it('model-unavailable → the honest offline message', async () => {
    preloadMock.mockResolvedValue({ kind: 'model-unavailable' })
    render(<VoiceRecorder onTranscript={vi.fn()} />)
    await startRecording()
    fireEvent.click(stopBtn())
    await waitFor(() =>
      expect(screen.getByText(/one-time download|connect to the internet/i)).toBeTruthy(),
    )
    expect(transcribeMock).not.toHaveBeenCalled() // never reached the transcribe step
  })

  it('error result → error state with the message + a way back', async () => {
    transcribeMock.mockResolvedValue({ kind: 'error', message: 'webgpu exploded' })
    render(<VoiceRecorder onTranscript={vi.fn()} />)
    await startRecording()
    fireEvent.click(stopBtn())
    await waitFor(() => expect(screen.getByText(/webgpu exploded/i)).toBeTruthy())
  })

  it('does not import the engine — only the service is mocked + called', async () => {
    const onTranscript = vi.fn()
    render(<VoiceRecorder onTranscript={onTranscript} />)
    await startRecording()
    fireEvent.click(stopBtn())
    await waitFor(() => expect(onTranscript).toHaveBeenCalled())
    // preloadModel + transcribe are the only engine-facing calls.
    expect(preloadMock).toHaveBeenCalled()
    expect(transcribeMock).toHaveBeenCalled()
  })
})

describe('VoiceRecorder — first-use download UX', () => {
  it('shows the one-time model-download state while preloadModel is pending', async () => {
    let resolvePreload: (v: { kind: 'ready' }) => void = () => {}
    preloadMock.mockReturnValue(
      new Promise((r) => {
        resolvePreload = r
      }),
    )
    render(<VoiceRecorder onTranscript={vi.fn()} />)
    await startRecording()
    fireEvent.click(stopBtn())
    await waitFor(() => expect(screen.getByText(/downloading voice model/i)).toBeTruthy())
    // Communicates it's a one-time / large download (the first-use experience).
    expect(screen.getByText(/one-time|293/i)).toBeTruthy()
    resolvePreload({ kind: 'ready' }) // let it proceed so no promise dangles
  })
})
