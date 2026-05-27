import { describe, it, expect, vi } from 'vitest'
import { backoffFor, withRateLimitRetry } from '../rate-limit'
import { MassiveError, parseRetryAfterHeader } from '../massive'

function makeSleep() {
  const calls: number[] = []
  const sleep = vi.fn(async (ms: number) => {
    calls.push(ms)
  })
  return { sleep, calls }
}

describe('withRateLimitRetry', () => {
  it('honors Retry-After header on 429 and retries after that wait', async () => {
    const { sleep, calls } = makeSleep()
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(
        new MassiveError('429 Too Many Requests', 429, '/v3/reference/tickers/AAA', 7_000),
      )
      .mockResolvedValueOnce('ok')

    const out = await withRateLimitRetry(fn, { sleep })

    expect(out).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
    // Honored the header value (7s) — NOT the 12s default schedule.
    expect(calls).toEqual([7_000])
  })

  it('falls back to baseBackoffMs when 429 lacks Retry-After', async () => {
    const { sleep, calls } = makeSleep()
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(
        new MassiveError('429 Too Many Requests', 429, '/path', null),
      )
      .mockResolvedValueOnce('ok')

    const out = await withRateLimitRetry(fn, { sleep, baseBackoffMs: 12_000 })

    expect(out).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
    // First retry uses baseBackoffMs unchanged (12s).
    expect(calls).toEqual([12_000])
  })

  it('throws the last 429 after exhausting all attempts', async () => {
    const { sleep, calls } = makeSleep()
    const finalErr = new MassiveError('429 Too Many Requests', 429, '/path', null)
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(
        new MassiveError('429 Too Many Requests', 429, '/path', null),
      )
      .mockRejectedValueOnce(
        new MassiveError('429 Too Many Requests', 429, '/path', null),
      )
      .mockRejectedValueOnce(finalErr)

    await expect(
      withRateLimitRetry(fn, { sleep, maxAttempts: 3, baseBackoffMs: 12_000 }),
    ).rejects.toBe(finalErr)
    expect(fn).toHaveBeenCalledTimes(3)
    // Two sleeps between three attempts (none after the final failure).
    // Schedule: 12s, 30s.
    expect(calls).toEqual([12_000, 30_000])
  })

  it('throws non-429 errors immediately without retry', async () => {
    const { sleep, calls } = makeSleep()
    const networkErr = new MassiveError('Network error', 0, '/path', null)
    const fn = vi.fn<[], Promise<string>>().mockRejectedValueOnce(networkErr)

    await expect(withRateLimitRetry(fn, { sleep })).rejects.toBe(networkErr)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([])
  })
})

describe('backoffFor', () => {
  it('produces the expected default schedule (12s → 30s → 60s)', () => {
    expect(backoffFor(0, 12_000, 60_000)).toBe(12_000)
    expect(backoffFor(1, 12_000, 60_000)).toBe(30_000)
    expect(backoffFor(2, 12_000, 60_000)).toBe(60_000)
  })

  it('caps long schedules at maxBackoffMs', () => {
    expect(backoffFor(10, 12_000, 60_000)).toBe(60_000)
  })
})

describe('parseRetryAfterHeader', () => {
  it('parses an integer-seconds value into ms', () => {
    expect(parseRetryAfterHeader('60')).toBe(60_000)
    expect(parseRetryAfterHeader('0')).toBe(0)
  })

  it('returns null for missing or malformed values', () => {
    expect(parseRetryAfterHeader(null)).toBe(null)
    expect(parseRetryAfterHeader('')).toBe(null)
    expect(parseRetryAfterHeader('   ')).toBe(null)
    expect(parseRetryAfterHeader('-5')).toBe(null)
    expect(parseRetryAfterHeader('Wed, 21 Oct 2026 07:28:00 GMT')).toBe(null)
  })
})
