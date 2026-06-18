import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square, X, Loader2, AlertCircle, RotateCcw } from 'lucide-react'
import { preloadModel, transcribe, type ModelProgress } from '@/services/transcription'

// Reusable voice recorder. Records mic audio, shows a live waveform + timer, and
// on Stop hands the clip to the transcription SERVICE (Beat B2) — it imports
// ONLY @/services/transcription, never @huggingface/transformers. The media
// plumbing (getUserMedia / MediaRecorder / AudioContext / AnalyserNode) is
// standard browser API, so the component ports to a web build unchanged.
//
// Presentational + callback-based, mirroring SentimentIconPicker / EmotionPicker:
// it owns the recording UX and emits the transcript + clip length; the parent
// decides what to do with them (Beat D wires these into the journal textareas).

interface VoiceRecorderProps {
  /** Receives the transcript once a recording is transcribed. */
  onTranscript: (text: string) => void
  /** Receives the clip length in seconds (recording metadata). */
  onDuration?: (seconds: number) => void
  disabled?: boolean
}

type RecorderState = 'idle' | 'recording' | 'processing' | 'downloading' | 'error'

const OFFLINE_MSG =
  'Voice model needs a one-time download — connect to the internet, then try again.'

function formatElapsed(totalSeconds: number): string {
  const s = Math.floor(totalSeconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function VoiceRecorder({
  onTranscript,
  onDuration,
  disabled = false,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const cancelledRef = useRef(false)
  const modelReadyRef = useRef(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef(0)

  const teardownWaveform = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Cleanup on unmount — never leave the mic open or a rAF running.
  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop()
      } catch {
        /* already inactive */
      }
      teardownWaveform()
      stopStream()
    }
  }, [teardownWaveform, stopStream])

  const setupWaveform = useCallback((stream: MediaStream) => {
    // Non-critical: a waveform failure must never stop recording.
    try {
      const audioCtx = new AudioContext()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 1024
      audioCtx.createMediaStreamSource(stream).connect(analyser)
      audioCtxRef.current = audioCtx
      const data = new Uint8Array(analyser.frequencyBinCount)
      const goldRgb = getComputedStyle(document.documentElement)
        .getPropertyValue('--gold')
        .trim()
      const stroke = goldRgb ? `rgb(${goldRgb})` : '#d4af37'

      const draw = () => {
        rafRef.current = requestAnimationFrame(draw)
        // Drive the timer off the same loop (only re-render on a second change).
        const secs = Math.floor((performance.now() - startTimeRef.current) / 1000)
        setElapsed((prev) => (prev !== secs ? secs : prev))
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        const { width: w, height: h } = canvas
        analyser.getByteTimeDomainData(data)
        ctx.clearRect(0, 0, w, h)
        ctx.lineWidth = 2
        ctx.strokeStyle = stroke
        ctx.beginPath()
        const slice = w / data.length
        let x = 0
        for (let i = 0; i < data.length; i++) {
          const y = (data[i] / 255) * h
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
          x += slice
        }
        ctx.stroke()
      }
      rafRef.current = requestAnimationFrame(draw)
    } catch {
      /* waveform unavailable — recording continues without it */
    }
  }, [])

  const runTranscription = useCallback(
    async (blob: Blob) => {
      if (!modelReadyRef.current) {
        setState('downloading')
        setProgress(0)
        const pre = await preloadModel((p: ModelProgress) => {
          const pct =
            p.total > 0
              ? Math.round((p.loaded / p.total) * 100)
              : Math.round(p.progress)
          setProgress(Math.max(0, Math.min(100, pct)))
        })
        if (pre.kind === 'model-unavailable') {
          setErrorMsg(OFFLINE_MSG)
          setState('error')
          return
        }
        if (pre.kind === 'error') {
          setErrorMsg(pre.message)
          setState('error')
          return
        }
        modelReadyRef.current = true
      }
      setState('processing')
      const res = await transcribe(blob)
      if (res.kind === 'ok') {
        onTranscript(res.text)
        onDuration?.(res.durationSeconds)
        setState('idle')
      } else if (res.kind === 'model-unavailable') {
        setErrorMsg(OFFLINE_MSG)
        setState('error')
      } else {
        setErrorMsg(res.message)
        setState('error')
      }
    },
    [onTranscript, onDuration],
  )

  const start = useCallback(async () => {
    setErrorMsg('')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setErrorMsg('Microphone permission denied. Enable mic access, then try again.')
      setState('error')
      return
    }
    streamRef.current = stream
    cancelledRef.current = false
    chunksRef.current = []
    const recorder = new MediaRecorder(stream)
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      teardownWaveform()
      stopStream()
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      if (cancelledRef.current) {
        setState('idle')
        return
      }
      void runTranscription(blob)
    }
    recorderRef.current = recorder
    startTimeRef.current = performance.now()
    setElapsed(0)
    recorder.start()
    setState('recording')
    setupWaveform(stream)
  }, [runTranscription, setupWaveform, teardownWaveform, stopStream])

  const stop = useCallback(() => {
    cancelledRef.current = false
    setState('processing')
    recorderRef.current?.stop()
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    recorderRef.current?.stop()
  }, [])

  const reset = useCallback(() => {
    setErrorMsg('')
    setState('idle')
  }, [])

  return (
    <div className="rounded-lg border border-border bg-bg-1 p-4" aria-live="polite">
      {state === 'idle' && (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Mic size={16} strokeWidth={2} />
          Record
        </button>
      )}

      {state === 'recording' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-loss">
              <span className="h-2 w-2 animate-pulse rounded-full bg-loss" />
              Recording
            </span>
            <span className="font-mono text-sm tabular-nums text-fg-secondary">
              {formatElapsed(elapsed)}
            </span>
          </div>
          <canvas
            ref={canvasRef}
            width={480}
            height={64}
            className="h-16 w-full rounded-md bg-bg-2"
            aria-hidden="true"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={stop}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 hover:bg-gold-hover"
            >
              <Square size={14} strokeWidth={2} />
              Stop
            </button>
            <button
              type="button"
              onClick={cancel}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-fg-secondary transition-colors duration-150 hover:border-fg-muted hover:text-fg-primary"
            >
              <X size={14} strokeWidth={2} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {(state === 'processing' || state === 'downloading') && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-fg-secondary">
            <Loader2 size={16} className="animate-spin text-gold" />
            {state === 'downloading'
              ? `Downloading voice model (one-time, ~293 MB)… ${progress}%`
              : 'Transcribing…'}
          </div>
          {state === 'downloading' && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-3">
              <div
                className="h-full rounded-full bg-gold transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {state === 'error' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 text-sm text-fg-secondary">
            <AlertCircle size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-fg-secondary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            <RotateCcw size={14} strokeWidth={2} />
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
