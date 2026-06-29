import { describe, it, expect, vi } from 'vitest'
import {
  backoffFor,
  withRateLimitRetry,
  spacingMsForCallsPerMin,
  WARMUP_SPACING_MS,
  POLYGON_FREE_TIER_CALLS_PER_MIN,
} from '../rate-limit'
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

describe('spacingMsForCallsPerMin / WARMUP_SPACING_MS — free-tier-derived pacing', () => {
  it('5 calls/min (Polygon free tier) -> 12000 ms floor', () => {
    expect(spacingMsForCallsPerMin(5)).toBe(12_000)
  })

  it('a higher paid/business-tier limit derives a SMALLER spacing (parameterized, not hardcoded)', () => {
    expect(spacingMsForCallsPerMin(60)).toBe(1_000) // 1/sec
    expect(spacingMsForCallsPerMin(100)).toBe(600)
    expect(spacingMsForCallsPerMin(120)).toBe(500)
  })

  it('rounds UP so the derived call rate never EXCEEDS the limit', () => {
    expect(spacingMsForCallsPerMin(7)).toBe(8_572) // ceil(60000/7) = ceil(8571.43)
  })

  it('WARMUP_SPACING_MS is COMPUTED from the named free-tier constant (config, not a magic 12000)', () => {
    expect(POLYGON_FREE_TIER_CALLS_PER_MIN).toBe(5)
    expect(WARMUP_SPACING_MS).toBe(spacingMsForCallsPerMin(POLYGON_FREE_TIER_CALLS_PER_MIN))
    expect(WARMUP_SPACING_MS).toBe(12_000)
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
