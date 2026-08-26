import { afterEach, describe, expect, it, vi } from 'vitest'

// v0.2.7 — THE BUCKET, WIRED AT THE CHOKEPOINT.
//
// The budget landed unwired and guarded six ways as a primitive. This is the
// other half of that claim: that it now governs the real fetch path, that each
// path reaches it carrying the right kind, and — the property that has to come
// first — that wiring it does NOT slow the normal case.
//
// WHY THE CHOKEPOINT AND NOT THE ENTRY. Three paths converge on ONE fetcher:
// the chart open (bars-get), the bulk refresh (intraday) and the warmup
// recovery (warmup-backfill). A flag on the fetcher could not tell them apart,
// so the kind is threaded from each entry point down. That makes "the entry
// passed a flag" a worthless assertion — what matters is what ARRIVES. Every
// guard below therefore reads the kind AT the chokepoint, by injecting a budget
// that records what it is asked for, and drives the real code path to get there
// with only the database and settings mocked.
//
// WHY A RETRY IS A CALL. withRateLimitRetry wraps AROUND the fetcher
// (intraday.ts:170, warmup-backfill.ts:134) rather than living inside it, so
// each retry re-enters the fetcher and passes the chokepoint again. A retry
// that skipped the budget would make the budget a lie under exactly the
// condition it exists for — a bucket that is already empty.

vi.mock('../repo', () => ({
  getIntradayRow: () => null,
  upsertIntradayRow: () => {},
}))
vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { polygon_api_key: 'test-key' } }),
}))

import { fetchIntradayMinutes, fetchTickerDetails } from '../massive'
import { fetchWarmupBars, getIntradayBars } from '../bars-get'
import {
  createCallBudget,
  setCallBudgetForTests,
  spacingMsForCallsPerMin,
  withRateLimitRetry,
  POLYGON_FREE_TIER_CALLS_PER_MIN as CALLS_PER_MIN,
  type CallBudget,
  type CallKind,
} from '../rate-limit'

const KEY = 'test-key'
const DAY = '2026-05-01'
const SPACING = spacingMsForCallsPerMin(CALLS_PER_MIN)

/** A real budget with an injected clock and sleep, wrapped so every admission
 *  records the kind it arrived as. The wrapper is the only way to see the kind
 *  at the chokepoint — the fetch helper is module-private and takes no
 *  observer, which is exactly why asserting at the entry would prove nothing. */
function wireBudget() {
  const kinds: CallKind[] = []
  const slept: number[] = []
  let t = 0
  const inner = createCallBudget({
    callsPerMin: CALLS_PER_MIN,
    now: () => t,
    // The injected sleep ADVANCES the injected clock. Without that a queued
    // caller wakes into the instant it left and every figure below measures
    // nothing.
    sleep: async (ms: number) => {
      slept.push(ms)
      t += ms
    },
  })
  const recording: CallBudget = {
    async take(kind: CallKind) {
      kinds.push(kind)
      await inner.take(kind)
    },
  }
  setCallBudgetForTests(recording)
  return { kinds, slept, advance: (ms: number) => void (t += ms), now: () => t }
}

const AGGS_BODY = { results: [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }] }

/** Always-OK fetch. The subject here is admission, not payload handling. */
function stubOkFetch() {
  const f = vi.fn(async () => ({ ok: true, json: async () => AGGS_BODY }) as unknown as Response)
  vi.stubGlobal('fetch', f)
  return f
}

afterEach(() => {
  vi.unstubAllGlobals()
  // A process-wide singleton with no reset makes every test depend on the ones
  // before it — the cursor would still be parked where the last test left it.
  setCallBudgetForTests(null)
})

// ─── RN1 : THE NO-REGRESSION GUARD, AND IT RUNS FIRST ────────────────────────

describe('RN1 a single bulk path paced at the derived spacing is never delayed', () => {
  // Read this one first. If wiring a shared budget slowed the ordinary case,
  // nothing else in this file would be worth having.
  it('three paced calls, ZERO waits', async () => {
    stubOkFetch()
    const w = wireBudget()

    for (let i = 0; i < 3; i++) {
      await fetchIntradayMinutes(KEY, 'AAA', DAY, DAY)
      // The caller's own pacer already holds this floor; the budget must find
      // its token already waiting rather than adding a second wait on top.
      w.advance(SPACING)
    }

    expect(
      w.slept,
      'the budget delayed a caller that was already pacing itself correctly — ' +
        'wiring it made the normal case slower, which is a regression, not a fix',
    ).toEqual([])
  })
})

// ─── RN2 : THE ACTUAL FIX ────────────────────────────────────────────────────

describe('RN2 two concurrent bulk paths are bounded by ONE budget', () => {
  // The defect the whole thread exists for. Each path paced its own calls
  // correctly, and the two together offered twice the ceiling because neither
  // knew the other was running. No guard has ever asserted this.
  it('eight calls across two paths admit no more than the budget in one window', async () => {
    stubOkFetch()
    const w = wireBudget()
    const admittedAt: number[] = []

    await Promise.all([
      (async () => {
        for (let i = 0; i < 4; i++) {
          await fetchIntradayMinutes(KEY, 'AAA', DAY, DAY) // the bulk refresh's call
          admittedAt.push(w.now())
        }
      })(),
      (async () => {
        for (let i = 0; i < 4; i++) {
          await fetchWarmupBars(KEY, 'BBB', DAY) // the warmup recovery's call
          admittedAt.push(w.now())
        }
      })(),
    ])

    expect(admittedAt, 'nothing was admitted, so the count below proves nothing').toHaveLength(8)
    const inFirstWindow = admittedAt.filter((t) => t < 60_000).length
    expect(
      inFirstWindow,
      `${inFirstWindow} admissions inside one window against a budget of ${CALLS_PER_MIN} — ` +
        'the two paths are not sharing a budget',
    ).toBeLessThanOrEqual(CALLS_PER_MIN)
  })
})

// ─── RN3 : THE CHART-OPEN PATH ───────────────────────────────────────────────

describe('RN3 the chart-open path arrives as INTERACTIVE', () => {
  it('every leg of a chart open reaches the chokepoint interactive', async () => {
    stubOkFetch()
    const w = wireBudget()

    await getIntradayBars('AAA', DAY)

    // A full miss fetches the active day AND the warmup window, and BOTH are
    // awaited before the payload returns — so a bulk warmup leg would park the
    // chart open in the queue just as surely as a bulk active leg would.
    expect(
      w.kinds,
      'a leg of the chart-open path arrived as bulk and will queue behind the refresh',
    ).toEqual(['interactive', 'interactive'])
  })
})

// ─── RN4 : THE TWO BULK PATHS ────────────────────────────────────────────────

describe('RN4 the bulk refresh and the warmup recovery arrive as BULK', () => {
  it('both reach the chokepoint as bulk', async () => {
    stubOkFetch()
    const w = wireBudget()

    await fetchIntradayMinutes(KEY, 'AAA', DAY, DAY) // intraday.ts:171, verbatim
    await fetchWarmupBars(KEY, 'AAA', DAY) // warmup-backfill.ts:135, verbatim

    expect(w.kinds).toEqual(['bulk', 'bulk'])
  })
})

// ─── RN5 : THE DEFAULT COVERS WHAT WAS NEVER THREADED ────────────────────────

describe('RN5 omitting the kind defaults to bulk', () => {
  // Deliberately a fetcher this beat never touched. Threading the kind through
  // two fetchers proves nothing about the other four; the DEFAULT is what keeps
  // them working, and this is the only guard that says so.
  it('an untouched fetcher still reaches the chokepoint, as bulk', async () => {
    stubOkFetch()
    const w = wireBudget()

    await fetchTickerDetails(KEY, 'AAA')

    expect(w.kinds, 'an untouched fetcher stopped passing through the budget').toEqual(['bulk'])
  })
})

// ─── RN6 : INTERACTIVE IS NOT QUEUED ─────────────────────────────────────────

describe('RN6 interactive is admitted with zero wait against a saturated bucket', () => {
  it('a chart open never waits behind a bulk backlog', async () => {
    stubOkFetch()
    const w = wireBudget()

    for (let i = 0; i < CALLS_PER_MIN; i++) await fetchIntradayMinutes(KEY, 'AAA', DAY, DAY)
    const before = w.slept.length
    expect(
      before,
      'the bucket was never saturated, so the assertion below would be vacuous',
    ).toBeGreaterThan(0)

    await getIntradayBars('BBB', DAY)

    expect(
      w.slept.slice(before),
      'the chart open queued — the user gets a spinner with no end state, which ' +
        'is the failure the interactive mode exists to prevent',
    ).toEqual([])
  })
})

// ─── RN7 : A RETRY IS A CALL ─────────────────────────────────────────────────

describe('RN7 a retry consumes a token', () => {
  it('three attempts spend three tokens', async () => {
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n += 1
        if (n <= 2) {
          return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            headers: { get: () => null },
            text: async () => 'slow down',
          } as unknown as Response
        }
        return { ok: true, json: async () => AGGS_BODY } as unknown as Response
      }),
    )
    const w = wireBudget()

    await withRateLimitRetry(() => fetchIntradayMinutes(KEY, 'AAA', DAY, DAY), {
      sleep: async () => {},
    })

    expect(n, 'the fetch was not retried, so there is no retry to measure').toBe(3)
    expect(
      w.kinds,
      'a retry skipped the budget — the ceiling is a lie under exactly the ' +
        'condition it exists for, an already-empty bucket',
    ).toEqual(['bulk', 'bulk', 'bulk'])
  })
})
