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
import { verifyFmp, fetchSharesFloat } from '../fmp'

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
