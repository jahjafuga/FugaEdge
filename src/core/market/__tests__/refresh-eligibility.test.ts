import { describe, expect, it } from 'vitest'
import {
  PLAN_GATE_COOLDOWN_MS,
  classifyRefresh,
  isPlanGated,
  orderRefreshSymbols,
  shouldRetryErrored,
} from '../refresh-eligibility'

// Commit B (5c grind-shortener): a force=false refresh must STOP re-attempting
// plan-gated 403 pairs every run (a heavy daily grind), while still retrying genuinely
// transient failures. Conservative bias: skip ONLY on the high-confidence
// plan-gate signal; everything else (incl. ambiguous) retries.

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-05-29T00:00:00Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

// Stored error strings use OUR OWN deterministic prefix (fetchOne):
//   `${status}: ${message}` — '403:' / '429:' / 'network:'.
const GATED = '403: 403 Forbidden — {"status":"NOT_AUTHORIZED","message":"Your plan doesn\'t include this data time frame."}'
const BARE_403 = '403: 403 Forbidden — some unrelated body'
const RATE = '429: 429 Too Many Requests'
const TIMEOUT = 'network: Request timed out after 15000ms'
const NETERR = 'network: Network error: fetch failed'

describe('isPlanGated — high-confidence permanent-on-this-plan signal only', () => {
  it('true ONLY for ^403: AND NOT_AUTHORIZED', () => {
    expect(isPlanGated(GATED)).toBe(true)
  })
  it('false for a 403 WITHOUT NOT_AUTHORIZED (not high-confidence)', () => {
    expect(isPlanGated(BARE_403)).toBe(false)
  })
  it('false for transient classes and null', () => {
    expect(isPlanGated(RATE)).toBe(false)
    expect(isPlanGated(TIMEOUT)).toBe(false)
    expect(isPlanGated(NETERR)).toBe(false)
    expect(isPlanGated(null)).toBe(false)
  })
})

describe('shouldRetryErrored — retry everything except a plan-gated pair within cooldown', () => {
  it('SKIPS a plan-gated pair still inside the cooldown', () => {
    expect(shouldRetryErrored(GATED, iso(10 * DAY), NOW)).toBe(false)
  })
  it('RETRIES a plan-gated pair once it ages PAST the cooldown (self-heal)', () => {
    expect(shouldRetryErrored(GATED, iso(50 * DAY), NOW)).toBe(true)
  })
  it('RETRIES a 403 without NOT_AUTHORIZED (not high-confidence → transient)', () => {
    expect(shouldRetryErrored(BARE_403, iso(1 * DAY), NOW)).toBe(true)
  })
  it('ALWAYS retries 429 / timeout / network', () => {
    expect(shouldRetryErrored(RATE, iso(1 * DAY), NOW)).toBe(true)
    expect(shouldRetryErrored(TIMEOUT, iso(1 * DAY), NOW)).toBe(true)
    expect(shouldRetryErrored(NETERR, iso(1 * DAY), NOW)).toBe(true)
  })
  it('retries a plan-gated pair with a missing/invalid timestamp (never strand)', () => {
    expect(shouldRetryErrored(GATED, null, NOW)).toBe(true)
  })
  it('cooldown is comfortably past the observed >=1-month gate', () => {
    expect(PLAN_GATE_COOLDOWN_MS).toBeGreaterThanOrEqual(35 * DAY)
  })
})

// Fix (a) — missing-first refresh classification + ordering. A newly-traded
// symbol (no market_data row) must surface AHEAD of the stale alphabet so it
// gets through on the first refresh click instead of queuing behind 145 stale
// symbols. The classification is pure; the electron repo supplies the rows.
const STALE_MS = 7 * DAY

describe('classifyRefresh — per-symbol refresh class', () => {
  it('null row → missing', () => {
    expect(classifyRefresh(null, NOW, STALE_MS)).toBe('missing')
  })
  it('errored transient → errored-retry', () => {
    expect(classifyRefresh({ error: RATE, fetched_at: iso(1 * DAY) }, NOW, STALE_MS)).toBe('errored-retry')
    expect(classifyRefresh({ error: NETERR, fetched_at: iso(1 * DAY) }, NOW, STALE_MS)).toBe('errored-retry')
  })
  it('errored plan-gated inside cooldown → errored-cooldown; aged past it → errored-retry', () => {
    expect(classifyRefresh({ error: GATED, fetched_at: iso(10 * DAY) }, NOW, STALE_MS)).toBe('errored-cooldown')
    expect(classifyRefresh({ error: GATED, fetched_at: iso(50 * DAY) }, NOW, STALE_MS)).toBe('errored-retry')
  })
  it('present + no error: fresh within window, stale past it', () => {
    expect(classifyRefresh({ error: null, fetched_at: iso(3 * DAY) }, NOW, STALE_MS)).toBe('fresh')
    expect(classifyRefresh({ error: null, fetched_at: iso(8 * DAY) }, NOW, STALE_MS)).toBe('stale')
  })
  it('unparseable fetched_at → stale (never strand a row on a bad date)', () => {
    expect(classifyRefresh({ error: null, fetched_at: 'not-a-date' }, NOW, STALE_MS)).toBe('stale')
  })
})

describe('orderRefreshSymbols — missing-first, fresh/cooldown excluded', () => {
  it('missing lead; stale + errored-retry follow; fresh + cooldown dropped; order within bucket preserved', () => {
    const classified = [
      { symbol: 'AAA', kind: 'stale' as const },
      { symbol: 'BBB', kind: 'missing' as const },
      { symbol: 'CCC', kind: 'fresh' as const },
      { symbol: 'DDD', kind: 'missing' as const },
      { symbol: 'EEE', kind: 'errored-retry' as const },
      { symbol: 'FFF', kind: 'errored-cooldown' as const },
    ]
    // BBB, DDD (missing, in input order) then AAA, EEE (stale/retry); CCC fresh
    // and FFF cooldown excluded.
    expect(orderRefreshSymbols(classified)).toEqual(['BBB', 'DDD', 'AAA', 'EEE'])
  })
  it('all fresh → [] (nothing to fetch)', () => {
    expect(
      orderRefreshSymbols([
        { symbol: 'AAA', kind: 'fresh' as const },
        { symbol: 'BBB', kind: 'errored-cooldown' as const },
      ]),
    ).toEqual([])
  })
  it('empty → []', () => {
    expect(orderRefreshSymbols([])).toEqual([])
  })
})
