// Session 3 — chunked backfill orchestrator (pure, domain-agnostic).
//
// Drives a sequential pass over an item list, processing one at a time and
// yielding control between fixed-size chunks so a large backfill never blocks
// the host's event loop (renderer paint, main-process IPC) for long. Knows
// nothing about trades, technicals, SQLite, or Electron — callers inject the
// per-item work (processItem), the inter-chunk yield (yieldBetweenChunks), and
// observation hooks (onProgress / onError).
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db imports, no console.
// Host-specific concerns (how to yield, how to log an error, how to surface
// progress) all arrive as callbacks, so this exact file runs unchanged inside a
// Next.js server action or a web worker.

/** Progress tick emitted after each item is attempted (success OR error). */
export interface ChunkedBackfillProgress<T> {
  /** 1-indexed position of the item just attempted. */
  current: number
  /** Total number of items in the run. */
  total: number
  /** The item just attempted. */
  item: T
}

/** Summary returned once the whole run completes. */
export interface ChunkedBackfillResult {
  /** Items whose processItem resolved without throwing. */
  processed: number
  /** Items whose processItem threw (caught; the run continued). */
  errors: number
  /** Wall-clock duration of the run, in milliseconds. */
  durationMs: number
}

/** Inputs for a single backfill run. */
export interface ChunkedBackfillOptions<T> {
  /** The work list. Processed in array order, one at a time. */
  items: readonly T[]
  /** Per-item work. Rejections are caught, counted, and reported via onError. */
  processItem: (item: T) => Promise<void>
  /**
   * Items per chunk. A yield (yieldBetweenChunks) fires after each completed
   * chunk except the last. Defaults to 50 when omitted or invalid
   * (non-integer, zero, or negative).
   */
  chunkSize?: number
  /**
   * Called between chunks (never after the final chunk). Awaited, so the caller
   * can hand control back to the event loop — e.g. `() => new Promise(r =>
   * setImmediate(r))` in the main process, or a setTimeout(0) in a renderer.
   */
  yieldBetweenChunks?: () => Promise<void>
  /** Observation hook fired after every item (including errored ones). */
  onProgress?: (progress: ChunkedBackfillProgress<T>) => void
  /** Error sink for a thrown processItem. Receives the raw error and the item. */
  onError?: (error: unknown, item: T) => void
}

/**
 * Run a chunked, sequential backfill over opts.items. Resolves when every item
 * has been attempted. Never rejects on a per-item failure — failures are caught,
 * counted in `errors`, and forwarded to onError so a single bad item can't abort
 * the whole sweep.
 */
export async function runChunkedBackfill<T>(
  opts: ChunkedBackfillOptions<T>,
): Promise<ChunkedBackfillResult> {
  const startedAt = Date.now()

  // Resolve chunkSize: positive integers only, else fall back to the default.
  // The `typeof` guard is purely for TS narrowing; Number.isInteger already
  // rejects undefined / non-numbers at runtime, so semantics are unchanged.
  const chunkSize =
    typeof opts.chunkSize === 'number' &&
    Number.isInteger(opts.chunkSize) &&
    opts.chunkSize > 0
      ? opts.chunkSize
      : 50

  let processed = 0
  let errors = 0
  const total = opts.items.length

  for (let i = 0; i < total; i++) {
    const item = opts.items[i]

    try {
      await opts.processItem(item)
      processed++
    } catch (err) {
      errors++
      opts.onError?.(err, item)
    }

    opts.onProgress?.({ current: i + 1, total, item })

    const reachedChunkBoundary = (i + 1) % chunkSize === 0
    const moreItemsRemain = i + 1 < total
    if (reachedChunkBoundary && moreItemsRemain && opts.yieldBetweenChunks) {
      await opts.yieldBetweenChunks()
    }
  }

  return { processed, errors, durationMs: Date.now() - startedAt }
}
