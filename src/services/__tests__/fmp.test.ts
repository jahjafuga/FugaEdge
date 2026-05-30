// Tests for the FMP (Financial Modeling Prep) service module.
//
// Mirror of src/services/__tests__/massive.test.ts shape: the service module
// is pure and web-portable (no electron/fs/sqlite imports, no process.env
// reads), so it's testable in plain-Node vitest with a stubbed global fetch.
//
// Empirically grounded — Step 1 verification on 2026-05-29 confirmed:
//   - FMP /stable/shares-float returns 200 OK on the free tier for all
//     10 sample tickers
//   - Response shape: { freeFloat, floatShares, outstandingShares, symbol, date }
//   - ~10% of small-caps have EMPTY floatShares (LABT) — the parser must
//     return null for floatShares (not throw, not coerce to 0) in this case
//   - Invalid keys return 401/403 (mirror Massive's auth-fail semantics)

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { verifyFmp, fetchSharesFloat, fetchCompanyProfile } from '../fmp'

// Captured SPRC /stable/profile response (2026-05-31 basket verification) —
// loaded via fs rather than a JSON import so tsc --noEmit doesn't need
// resolveJsonModule turned on.
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const SPRC_PROFILE = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'fmp-profile-sprc.json'), 'utf8'),
) as Record<string, unknown>[]

// ── Helpers ───────────────────────────────────────────────────────────────

function mockFetchOnce(response: { status: number; body?: unknown } | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return new Response(
      response.body == null ? '' : JSON.stringify(response.body),
      { status: response.status },
    )
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

// ── verifyFmp ─────────────────────────────────────────────────────────────

describe('verifyFmp — API key verification', () => {
  it('returns { kind: "valid" } on HTTP 200', async () => {
    mockFetchOnce({ status: 200, body: [{ symbol: 'AAPL', floatShares: 1 }] })
    expect(await verifyFmp('test-key')).toEqual({ kind: 'valid' })
  })

  it('returns { kind: "invalid" } on HTTP 401', async () => {
    mockFetchOnce({ status: 401, body: { error: 'Unauthorized' } })
    expect(await verifyFmp('bad-key')).toEqual({ kind: 'invalid' })
  })

  it('returns { kind: "invalid" } on HTTP 403', async () => {
    mockFetchOnce({ status: 403, body: { error: 'Forbidden' } })
    expect(await verifyFmp('bad-key')).toEqual({ kind: 'invalid' })
  })

  it('returns { kind: "rate-limited" } on HTTP 429', async () => {
    mockFetchOnce({ status: 429 })
    expect(await verifyFmp('test-key')).toEqual({ kind: 'rate-limited' })
  })

  it('returns { kind: "invalid" } on other non-2xx (5xx, 404 — anything FMP-returned but not success)', async () => {
    mockFetchOnce({ status: 500 })
    expect(await verifyFmp('test-key')).toEqual({ kind: 'invalid' })
  })

  it('returns { kind: "network-error" } when fetch rejects (DNS, offline, TLS)', async () => {
    mockFetchOnce(new TypeError('fetch failed'))
    expect(await verifyFmp('test-key')).toEqual({ kind: 'network-error' })
  })

  it('NEVER throws — even on a thrown error from fetch, returns a discriminated union', async () => {
    mockFetchOnce(new Error('boom'))
    await expect(verifyFmp('test-key')).resolves.toBeDefined()
  })
})

// ── fetchSharesFloat ──────────────────────────────────────────────────────

describe('fetchSharesFloat — happy path + edge cases from Step 1 verification', () => {
  it('parses the CLIK-shaped happy case (all three numeric fields)', async () => {
    // Real shape observed 2026-05-29: CLIK returned
    // { freeFloat: 20.9597, floatShares: 132507, outstandingShares: 632201 }
    mockFetchOnce({
      status: 200,
      body: [
        {
          symbol: 'CLIK',
          date: '2026-05-29',
          freeFloat: 20.9597,
          floatShares: 132507,
          outstandingShares: 632201,
        },
      ],
    })
    const result = await fetchSharesFloat('test-key', 'CLIK')
    expect(result).toEqual({
      floatShares: 132507,
      outstandingShares: 632201,
      freeFloatPercent: 20.9597,
    })
  })

  it('parses the LABT-shaped empty-float case (outstanding present, float null)', async () => {
    // Real shape observed 2026-05-29: LABT returned
    // { freeFloat: '', floatShares: '', outstandingShares: 4689177 }
    // The empty strings normalize to null — NOT to 0.
    mockFetchOnce({
      status: 200,
      body: [
        {
          symbol: 'LABT',
          freeFloat: '',
          floatShares: '',
          outstandingShares: 4689177,
        },
      ],
    })
    const result = await fetchSharesFloat('test-key', 'LABT')
    expect(result).toEqual({
      floatShares: null,
      outstandingShares: 4689177,
      freeFloatPercent: null,
    })
  })

  it('returns nulls when FMP returns an empty array (unknown symbol)', async () => {
    mockFetchOnce({ status: 200, body: [] })
    const result = await fetchSharesFloat('test-key', 'NOSUCH')
    expect(result).toEqual({
      floatShares: null,
      outstandingShares: null,
      freeFloatPercent: null,
    })
  })

  it('returns nulls on 401/403 (plan-gated or invalid key — caller decides whether to alert)', async () => {
    mockFetchOnce({ status: 403 })
    const result = await fetchSharesFloat('bad-key', 'AAPL')
    expect(result).toEqual({
      floatShares: null,
      outstandingShares: null,
      freeFloatPercent: null,
    })
  })

  it('returns nulls on a network error — NEVER throws', async () => {
    mockFetchOnce(new TypeError('fetch failed'))
    const result = await fetchSharesFloat('test-key', 'AAPL')
    expect(result).toEqual({
      floatShares: null,
      outstandingShares: null,
      freeFloatPercent: null,
    })
  })

  it('coerces string-typed numeric fields to numbers (defensive — FMP has been inconsistent here)', async () => {
    mockFetchOnce({
      status: 200,
      body: [
        {
          symbol: 'XYZ',
          freeFloat: '74.32',
          floatShares: '757397',
          outstandingShares: '1019033',
        },
      ],
    })
    const result = await fetchSharesFloat('test-key', 'XYZ')
    expect(result).toEqual({
      floatShares: 757397,
      outstandingShares: 1019033,
      freeFloatPercent: 74.32,
    })
  })

  it('returns nulls on malformed JSON (FMP returned a 200 with bad body)', async () => {
    // Simulate a 200 with non-JSON content — Response constructor with a
    // raw string forces ConvertFrom-Json to throw inside the parser.
    const fn = vi.fn(async () => new Response('not json {{{', { status: 200 }))
    vi.stubGlobal('fetch', fn)
    const result = await fetchSharesFloat('test-key', 'AAPL')
    expect(result).toEqual({
      floatShares: null,
      outstandingShares: null,
      freeFloatPercent: null,
    })
  })
})

// ── 15s AbortController timeout (mirrors Polygon massive.ts:55-91) ────────
// Smoke-found gap: the FMP fetch had no timeout protection — a stalled
// request could silently hang in the fire-and-forget import path forever.
// These guards pin the AbortController wiring so a future regression
// (drop the signal, drop the timer) is caught at test time.

describe('fetchSharesFloat — 15s AbortController timeout', () => {
  it('passes an AbortSignal to fetch (timeout plumbing wired)', async () => {
    let signalCapture: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
        signalCapture = init?.signal
        return new Response(
          JSON.stringify([
            { symbol: 'CLIK', floatShares: 132507, outstandingShares: 632201, freeFloat: 20.96 },
          ]),
          { status: 200 },
        )
      }),
    )

    await fetchSharesFloat('test-key', 'CLIK')

    // The signal must be plumbed for the AbortController timeout to bite a
    // real stalled fetch — without it the controller.abort() in the
    // setTimeout callback would do nothing.
    expect(signalCapture).toBeDefined()
    expect(signalCapture).toBeInstanceOf(AbortSignal)
  })

  it('aborts and throws after 15s when the fetch stalls (no infinite hang)', async () => {
    vi.useFakeTimers()
    // Mock fetch as a never-resolving promise that DOES honor the signal —
    // the implementation under test must pass signal AND the controller
    // must fire abort after the 15s timer for this to reject.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err: Error & { name: string } = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
          // Otherwise: hang forever.
        })
      }),
    )

    const promise = fetchSharesFloat('test-key', 'STALL')
    // Catch the eventual rejection on this branch so unhandled-rejection
    // warnings don't pollute the test output between assertion points.
    const caught = promise.catch((e) => e)

    // Step well past the 15s timeout so the timer callback fires.
    await vi.advanceTimersByTimeAsync(20_000)

    const e = await caught
    expect(e).toBeInstanceOf(Error)
    // The message matches Polygon's massive.ts pattern verbatim so future
    // consumers persisting this to market_data.error can prefix with the
    // same `${e.status === 0 ? 'network' : e.status}: ${e.message}` shape,
    // which the existing refresh-eligibility.ts classifier treats as
    // transient (NOT plan-gated 403:NOT_AUTHORIZED) and retries.
    expect((e as Error).message).toBe('Request timed out after 15000ms')

    vi.useRealTimers()
  })
})

describe('verifyFmp — 15s AbortController timeout', () => {
  it('aborts and returns network-error after 15s when the verify call stalls', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err: Error & { name: string } = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      }),
    )

    const promise = verifyFmp('test-key')
    await vi.advanceTimersByTimeAsync(20_000)

    // verifyFmp keeps its existing "never throws" contract — a timeout
    // surfaces as network-error, consistent with the other catch branches.
    expect(await promise).toEqual({ kind: 'network-error' })

    vi.useRealTimers()
  })
})

// ── fetchCompanyProfile (v0.2.3 — country + Stage 2 cap/sector/industry) ─────
// Returns a CompanyProfile { country, marketCap, sector, industry } (each
// field independently nullable) or null on a TOTAL miss (non-200 / empty
// array / malformed / network). NEVER throws except on a real 15s timeout.
// Grounded in the 2026-05-31 basket verification (SPRC→IL/567401/Healthcare/
// Biotechnology, ZZZZZ→[]).

describe('fetchCompanyProfile — country + Stage 2 fields', () => {
  it('parses the full SPRC fixture (country + marketCap + sector + industry)', async () => {
    mockFetchOnce({ status: 200, body: SPRC_PROFILE })
    expect(await fetchCompanyProfile('test-key', 'SPRC')).toEqual({
      country: 'IL',
      marketCap: 567401,
      sector: 'Healthcare',
      industry: 'Biotechnology',
    })
  })

  it('returns null on an empty array (unknown symbol — ZZZZZ case)', async () => {
    mockFetchOnce({ status: 200, body: [] })
    expect(await fetchCompanyProfile('test-key', 'ZZZZZ')).toBeNull()
  })

  it('country missing → object with country null (NOT a total-miss null)', async () => {
    mockFetchOnce({ status: 200, body: [{ symbol: 'X', marketCap: 100, sector: 'Tech', industry: 'Software' }] })
    expect(await fetchCompanyProfile('test-key', 'X')).toEqual({
      country: null, marketCap: 100, sector: 'Tech', industry: 'Software',
    })
  })

  it('country empty string → country null (not a bogus code), other fields intact', async () => {
    mockFetchOnce({ status: 200, body: [{ symbol: 'X', country: '', marketCap: 5 }] })
    const r = await fetchCompanyProfile('test-key', 'X')
    expect(r).toMatchObject({ country: null, marketCap: 5 })
  })

  it('country malformed ("USA") → country null', async () => {
    mockFetchOnce({ status: 200, body: [{ symbol: 'X', country: 'USA' }] })
    expect((await fetchCompanyProfile('test-key', 'X'))?.country).toBeNull()
  })

  it('normalizes a lowercase country to uppercase alpha-2', async () => {
    mockFetchOnce({ status: 200, body: [{ symbol: 'X', country: 'il' }] })
    expect((await fetchCompanyProfile('test-key', 'X'))?.country).toBe('IL')
  })

  // ── Stage 2: marketCap / sector / industry coercion ──
  it('marketCap: empty string → null (not 0)', async () => {
    mockFetchOnce({ status: 200, body: [{ symbol: 'X', country: 'US', marketCap: '' }] })
    expect((await fetchCompanyProfile('test-key', 'X'))?.marketCap).toBeNull()
  })

  it('marketCap: string-typed number → coerced to number (FMP has been inconsistent)', async () => {
    mockFetchOnce({ status: 200, body: [{ symbol: 'X', country: 'US', marketCap: '1207504' }] })
    expect((await fetchCompanyProfile('test-key', 'X'))?.marketCap).toBe(1207504)
  })

  it('marketCap: missing → null', async () => {
    mockFetchOnce({ status: 200, body: [{ symbol: 'X', country: 'US' }] })
    expect((await fetchCompanyProfile('test-key', 'X'))?.marketCap).toBeNull()
  })

  it('sector / industry: present → trimmed strings', async () => {
    mockFetchOnce({ status: 200, body: [{ symbol: 'X', country: 'US', sector: '  Technology ', industry: ' Semiconductors ' }] })
    const r = await fetchCompanyProfile('test-key', 'X')
    expect(r).toMatchObject({ sector: 'Technology', industry: 'Semiconductors' })
  })

  it('sector / industry: empty string → null', async () => {
    mockFetchOnce({ status: 200, body: [{ symbol: 'X', country: 'US', sector: '', industry: '   ' }] })
    expect(await fetchCompanyProfile('test-key', 'X')).toMatchObject({ sector: null, industry: null })
  })

  it('sector / industry: missing → null', async () => {
    mockFetchOnce({ status: 200, body: [{ symbol: 'X', country: 'US' }] })
    expect(await fetchCompanyProfile('test-key', 'X')).toMatchObject({ sector: null, industry: null })
  })

  // ── Total-miss → null (unchanged contract) ──
  it('returns null on 401/403 (invalid or plan-gated key)', async () => {
    mockFetchOnce({ status: 403 })
    expect(await fetchCompanyProfile('bad-key', 'SPRC')).toBeNull()
  })

  it('returns null on a network error — NEVER throws', async () => {
    mockFetchOnce(new TypeError('fetch failed'))
    expect(await fetchCompanyProfile('test-key', 'SPRC')).toBeNull()
  })

  it('returns null on malformed JSON (200 with a bad body)', async () => {
    const fn = vi.fn(async () => new Response('not json {{{', { status: 200 }))
    vi.stubGlobal('fetch', fn)
    expect(await fetchCompanyProfile('test-key', 'SPRC')).toBeNull()
  })

  it('passes an AbortSignal to fetch (timeout plumbing wired)', async () => {
    let signalCapture: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
        signalCapture = init?.signal
        return new Response(JSON.stringify(SPRC_PROFILE), { status: 200 })
      }),
    )
    await fetchCompanyProfile('test-key', 'SPRC')
    expect(signalCapture).toBeInstanceOf(AbortSignal)
  })

  it('aborts and THROWS after 15s when the fetch stalls (mirrors fetchSharesFloat)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err: Error & { name: string } = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      }),
    )

    const promise = fetchCompanyProfile('test-key', 'STALL')
    const caught = promise.catch((e) => e)
    await vi.advanceTimersByTimeAsync(20_000)

    const e = await caught
    expect(e).toBeInstanceOf(Error)
    expect((e as Error).message).toBe('Request timed out after 15000ms')

    vi.useRealTimers()
  })
})
