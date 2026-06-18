// Tests for the local transcription service (Voice Journal).
//
// vitest can't load @huggingface/transformers for real (it needs WebGPU/WASM —
// the same constraint that keeps better-sqlite3 out of the test runner), so we
// MOCK the engine and stub the browser audio globals. The scope here is the
// service's CONTROL FLOW: the ok / model-unavailable / error mapping, the
// never-throws contract, progress forwarding, and the lazy-singleton +
// env-config wiring. The real round-trip (base.en actually transcribing) is
// proven by the spike + the Beat-B2 dev-launch check, not here.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Hoisted so the (hoisted) vi.mock factory can reference them without TDZ.
const { asrCallable, pipelineFactory, mockEnv } = vi.hoisted(() => ({
  asrCallable: vi.fn(),
  pipelineFactory: vi.fn(),
  mockEnv: { backends: { onnx: { wasm: {} as Record<string, unknown> } } },
}))

vi.mock('@huggingface/transformers', () => ({
  env: mockEnv,
  pipeline: (...args: unknown[]) => pipelineFactory(...args),
}))

// Minimal AudioContext stub — decodes any blob to 1s of 16kHz mono silence.
class FakeAudioContext {
  constructor(_opts?: unknown) {}
  async decodeAudioData(_buf: ArrayBuffer) {
    return { getChannelData: (_c: number) => new Float32Array(16_000) }
  }
  async close() {}
}

const aBlob = () => new Blob([new Uint8Array(8)])

beforeEach(() => {
  vi.resetModules() // fresh module → fresh lazy singleton per test
  asrCallable.mockReset()
  pipelineFactory.mockReset()
  pipelineFactory.mockResolvedValue(asrCallable) // default: model loads ok
  asrCallable.mockResolvedValue({ text: ' hello world ' })
  mockEnv.backends.onnx.wasm = {}
  vi.stubGlobal('location', { href: 'http://localhost:5173/' })
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('AudioContext', FakeAudioContext)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function loadService() {
  return import('../transcription')
}

describe('transcribe — control flow', () => {
  it('returns { kind: "ok", text, durationSeconds } on success (text trimmed)', async () => {
    const { transcribe } = await loadService()
    expect(await transcribe(aBlob())).toEqual({
      kind: 'ok',
      text: 'hello world',
      durationSeconds: 1,
    })
  })

  it('handles a pipeline output with no text field → ok with empty text', async () => {
    asrCallable.mockResolvedValue({})
    const { transcribe } = await loadService()
    expect(await transcribe(aBlob())).toEqual({ kind: 'ok', text: '', durationSeconds: 1 })
  })

  it('returns { kind: "model-unavailable" } when the model fails to load AND offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    pipelineFactory.mockRejectedValue(new Error('Failed to fetch'))
    const { transcribe } = await loadService()
    expect(await transcribe(aBlob())).toEqual({ kind: 'model-unavailable' })
  })

  it('returns { kind: "model-unavailable" } on a fetch-shaped load error even when onLine', async () => {
    pipelineFactory.mockRejectedValue(new Error('Could not locate file'))
    const { transcribe } = await loadService()
    expect(await transcribe(aBlob())).toEqual({ kind: 'model-unavailable' })
  })

  it('returns { kind: "error" } when inference throws', async () => {
    asrCallable.mockRejectedValue(new Error('webgpu exploded'))
    const { transcribe } = await loadService()
    expect(await transcribe(aBlob())).toEqual({ kind: 'error', message: 'webgpu exploded' })
  })

  it('returns { kind: "error" } on a non-network model-load failure', async () => {
    pipelineFactory.mockRejectedValue(new Error('boom'))
    const { transcribe } = await loadService()
    expect(await transcribe(aBlob())).toEqual({ kind: 'error', message: 'boom' })
  })

  it('NEVER throws — a decode failure maps to { kind: "error" }', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        async decodeAudioData() {
          throw new Error('bad audio')
        }
        async close() {}
      },
    )
    const { transcribe } = await loadService()
    const r = await transcribe(aBlob())
    expect(r.kind).toBe('error')
    expect((r as { message: string }).message).toContain('audio decode failed')
  })
})

describe('preloadModel — control flow', () => {
  it('returns { kind: "ready" } when the pipeline builds', async () => {
    const { preloadModel } = await loadService()
    expect(await preloadModel()).toEqual({ kind: 'ready' })
  })

  it('forwards model-download progress (status: progress) to onProgress', async () => {
    pipelineFactory.mockImplementation(
      async (_task: string, _model: string, opts: { progress_callback?: (p: unknown) => void }) => {
        opts.progress_callback?.({ status: 'progress', file: 'model.onnx', loaded: 50, total: 100, progress: 50 })
        return asrCallable
      },
    )
    const onProgress = vi.fn()
    const { preloadModel } = await loadService()
    await preloadModel(onProgress)
    expect(onProgress).toHaveBeenCalledWith({ progress: 50, loaded: 50, total: 100, file: 'model.onnx' })
  })

  it('returns { kind: "model-unavailable" } when offline + not cached', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    pipelineFactory.mockRejectedValue(new Error('network error'))
    const { preloadModel } = await loadService()
    expect(await preloadModel()).toEqual({ kind: 'model-unavailable' })
  })

  it('returns { kind: "error" } on a non-network failure', async () => {
    pipelineFactory.mockRejectedValue(new Error('kaboom'))
    const { preloadModel } = await loadService()
    expect(await preloadModel()).toEqual({ kind: 'error', message: 'kaboom' })
  })
})

describe('lazy singleton + env wiring', () => {
  it('builds the pipeline once across multiple transcribes', async () => {
    const { transcribe } = await loadService()
    await transcribe(aBlob())
    await transcribe(aBlob())
    expect(pipelineFactory).toHaveBeenCalledTimes(1)
  })

  it('retries the build after a failure (rejection not cached)', async () => {
    pipelineFactory.mockRejectedValueOnce(new Error('boom')) // first build fails
    const { preloadModel } = await loadService()
    expect((await preloadModel()).kind).toBe('error')
    expect(await preloadModel()).toEqual({ kind: 'ready' }) // second build succeeds
    expect(pipelineFactory).toHaveBeenCalledTimes(2)
  })

  it('sets the proven wasmPaths/proxy/numThreads on the engine env before building', async () => {
    const { preloadModel } = await loadService()
    await preloadModel()
    expect(mockEnv.backends.onnx.wasm).toMatchObject({
      wasmPaths: 'http://localhost:5173/ort/',
      proxy: false,
      numThreads: 1,
    })
  })

  it('does not touch the engine at import time (lazy)', async () => {
    await loadService()
    expect(pipelineFactory).not.toHaveBeenCalled()
  })
})
