import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchIntradayMinutes, MassiveError } from '../massive'
import { withRateLimitRetry } from '../rate-limit'

// Commit 1 of the 5c fix: a single stalled HTTP request must never hang the
// whole refresh. These pin the invariant — every massiveGet settles within a
// bounded time, and a timeout is a terminal (non-retried) failure.

describe('massiveGet request timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects with a timeout error when fetch never resolves, instead of hanging forever', async () => {
    vi.useFakeTimers()
    // A fetch that never resolves on its own — it only rejects if the request
    // is aborted (mirrors a stalled socket: connected, no response).
    const fetchMock = vi.fn(
      (_url: string, opts?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchIntradayMinutes('key', 'AAA', '2026-05-01')
    // Attach the rejection assertion before advancing timers so the pending
    // rejection is always handled.
    const settled = expect(promise).rejects.toThrow(/timed out/i)

    // Advance past the per-request ceiling — this fires the abort timer.
    await vi.advanceTimersByTimeAsync(15_000)
    await settled

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats a timeout as a terminal failure — not retried through the 429 backoff ladder', async () => {
    const sleep = vi.fn(async () => {})
    const fn = vi.fn(async () => {
      // A timeout surfaces as a non-429 MassiveError (status 0).
      throw new MassiveError('Request timed out after 15000ms', 0, '/v2/aggs/x')
    })

    await expect(withRateLimitRetry(fn, { sleep })).rejects.toThrow(/timed out/i)
    expect(fn).toHaveBeenCalledTimes(1) // one attempt, no retries
    expect(sleep).not.toHaveBeenCalled() // no 429 backoff sleep
  })

  it('returns parsed bars on a normal successful response (no regression)', async () => {
    const body = { results: [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }] }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    const bars = await fetchIntradayMinutes('key', 'AAA', '2026-05-01')

    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({ t: 1, c: 1.5 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
