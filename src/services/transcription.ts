// Local speech-to-text service (Voice Journal). Wraps @huggingface/transformers
// (Whisper base.en on WebGPU) behind a small typed boundary so the VoiceRecorder
// component never touches the engine directly — ARCHITECTURE.md rule 4.
//
// Unlike the main-process API services (massive.ts / fmp.ts), this runs in the
// RENDERER: WebGPU + WASM are browser APIs and the model is public (no secret,
// no IPC). It stays pure of electron / fs / sqlite and uses only
// @huggingface/transformers + standard browser APIs, so it ports to a web build
// unchanged ("could this run in a Next.js page?" — yes). Its result types live
// here, not in shared/, because only the renderer consumes them.
//
// The ORT runtime is served from the renderer's own origin (electron.vite.config
// .ts viteStaticCopy → /ort/, kept as real files by asarUnpack). wasmPaths is
// resolved RELATIVE to the renderer so it works in dev (http://localhost) and in
// the packaged app over file:// — proven in Beat B1. No proxy/threads → no blob:
// → the tight CSP stays as-is.

const MODEL_ID = 'Xenova/whisper-base.en'
const TARGET_SAMPLE_RATE = 16_000

/** Outcome of a transcription. Never thrown — always returned. */
export type TranscriptionResult =
  | { kind: 'ok'; text: string; durationSeconds: number }
  | { kind: 'model-unavailable' }
  | { kind: 'error'; message: string }

/** Outcome of warming the model + runtime. */
export type PreloadResult =
  | { kind: 'ready' }
  | { kind: 'model-unavailable' }
  | { kind: 'error'; message: string }

/** Model-download progress, surfaced so a UI can show a real progress bar. */
export interface ModelProgress {
  progress: number
  loaded: number
  total: number
  file?: string
}

type AsrOutput = { text?: string }
type AsrPipeline = (audio: Float32Array) => Promise<AsrOutput>

// Lazy singleton — the model + ORT wasm load on FIRST use, never at import, so
// app launch is untouched. Reset to null on failure so a later call (e.g. once
// back online) retries instead of replaying a cached rejection.
let pipelinePromise: Promise<AsrPipeline> | null = null
let envConfigured = false

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// A model-load failure is "model-unavailable" (offline first use, nothing
// cached) when the renderer is offline or the error reads like a fetch/model
// failure; everything else is a genuine error. Once the model is cached in the
// browser Cache API, later calls succeed offline — so this only bites first use.
function looksUnavailable(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const m = messageOf(e).toLowerCase()
  return (
    m.includes('fetch') ||
    m.includes('network') ||
    m.includes('failed to load') ||
    m.includes('could not locate') ||
    m.includes('no such file')
  )
}

function classifyLoadError(
  e: unknown,
): { kind: 'model-unavailable' } | { kind: 'error'; message: string } {
  return looksUnavailable(e)
    ? { kind: 'model-unavailable' }
    : { kind: 'error', message: messageOf(e) }
}

async function buildPipeline(
  onProgress?: (p: ModelProgress) => void,
): Promise<AsrPipeline> {
  const lib = await import('@huggingface/transformers')
  if (!envConfigured) {
    // PROVEN recipe (Beat B1): relative wasmPaths, single-threaded, no proxy
    // worker → no blob: scripts → loads under the tight CSP as-is.
    const wasm = lib.env.backends.onnx.wasm
    if (wasm) {
      wasm.wasmPaths = new URL('./ort/', location.href).href
      wasm.proxy = false
      wasm.numThreads = 1
      envConfigured = true
    }
  }
  const pipe = await lib.pipeline('automatic-speech-recognition', MODEL_ID, {
    device: 'webgpu',
    progress_callback: onProgress
      ? (p: unknown) => {
          const e = p as {
            status?: string
            file?: string
            loaded?: number
            total?: number
            progress?: number
          }
          if (e.status === 'progress') {
            onProgress({
              progress: e.progress ?? 0,
              loaded: e.loaded ?? 0,
              total: e.total ?? 0,
              file: e.file,
            })
          }
        }
      : undefined,
  })
  return pipe as unknown as AsrPipeline
}

function getPipeline(
  onProgress?: (p: ModelProgress) => void,
): Promise<AsrPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = buildPipeline(onProgress).catch((e) => {
      pipelinePromise = null // allow a retry on the next call
      throw e
    })
  }
  return pipelinePromise
}

// Decode any recorded audio Blob to the 16kHz mono Float32 Whisper expects. An
// AudioContext at 16kHz resamples on decode; channel 0 is the mono signal (mic
// capture is mono). The component never learns this engine detail.
async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    return decoded.getChannelData(0)
  } finally {
    await ctx.close()
  }
}

/**
 * Warm the model + ORT runtime so the first real transcribe is instant.
 * Surfaces model-download progress for a UI bar. Never throws.
 */
export async function preloadModel(
  onProgress?: (p: ModelProgress) => void,
): Promise<PreloadResult> {
  try {
    await getPipeline(onProgress)
    return { kind: 'ready' }
  } catch (e) {
    return classifyLoadError(e)
  }
}

/**
 * Transcribe a recorded audio Blob. Decodes to 16kHz mono internally, runs
 * Whisper base.en on WebGPU, returns the transcript + clip length. Never
 * throws — decode / load / inference failures map to a typed result.
 */
export async function transcribe(audio: Blob): Promise<TranscriptionResult> {
  let samples: Float32Array
  try {
    samples = await decodeTo16kMono(audio)
  } catch (e) {
    return { kind: 'error', message: `audio decode failed: ${messageOf(e)}` }
  }
  const durationSeconds = samples.length / TARGET_SAMPLE_RATE
  let pipe: AsrPipeline
  try {
    pipe = await getPipeline()
  } catch (e) {
    return classifyLoadError(e)
  }
  try {
    const out = await pipe(samples)
    const text = typeof out?.text === 'string' ? out.text.trim() : ''
    return { kind: 'ok', text, durationSeconds }
  } catch (e) {
    return { kind: 'error', message: messageOf(e) }
  }
}
