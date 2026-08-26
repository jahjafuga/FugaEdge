import { describe, it, expect, vi } from 'vitest'

// v0.2.7 — THE CALL BUDGET, A PURE PRIMITIVE.
//
// UNWIRED BY DESIGN. Nothing imports this but the guards below. An audit found
// several independent pacers, each correctly spacing its own calls, which
// together offer three times the budget because none of them knows the others
// exist. A single bucket at the shared chokepoint is the fix; this beat builds
// and proves the bucket, and a later one wires it. Proving the primitive and
// proving the wiring are two different claims and mixing them has cost this
// codebase a beat before.
//
// TWO ADMISSION MODES, and the second is a product decision, not a shortcut:
//
//   BULK        waits its turn, FIFO among bulk callers.
//   INTERACTIVE is admitted immediately and never waits — but STILL CONSUMES a
//               token, so the budget stays honest and the next bulk caller
//               waits that much longer.
//
// WHY INTERACTIVE NEVER WAITS. A queued interactive fetch shows a spinner with
// no end state: the request timeout starts when the request is issued, so time
// spent waiting for admission is time no timeout is counting. The user gets a
// skeleton that never resolves and cannot tell it from a hang. A limiter that
// does that is a worse product than the collisions it prevents.
//
// THE PAIR THAT MAKES IT HONEST is the last two guards. Interactive admitted
// immediately is only defensible if it still spends from the same budget —
// otherwise "interactive" is a name for "unlimited", and the ceiling is a
// fiction. So one guard proves it never waits and its companion proves it still
// costs, and a plant reddens each without touching the other.
//
// EVERY BUDGET ASSERTION READS THE DERIVATION, never a number. A literal would
// pass today and stop guarding the moment the limit moved.

import {
  createCallBudget,
  spacingMsForCallsPerMin,
  POLYGON_FREE_TIER_CALLS_PER_MIN as CALLS_PER_MIN,
} from '../rate-limit'

/** The house idiom — rate-limit.test.ts:11-17. Records every delay and returns
 *  instantly, so a paced run is real in prod and observable under test. */
function makeSleep() {
  const calls: number[] = []
  const sleep = vi.fn(async (ms: number) => {
    calls.push(ms)
  })
  return { sleep, calls }
}

/** A clock the test drives. A bucket reading the real clock cannot be asserted:
 *  its refill would depend on how long the test itself took to run. */
function makeClock() {
  let t = 0
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

const SPACING = spacingMsForCallsPerMin(CALLS_PER_MIN)

function budget() {
  const { sleep, calls } = makeSleep()
  const clock = makeClock()
  // The sleep the bucket is handed also advances the clock, so a recorded wait
  // and the passage of time agree — otherwise a queued caller would sleep and
  // wake into the same instant it left.
  const advancingSleep = async (ms: number) => {
    await sleep(ms)
    clock.advance(ms)
  }
  return {
    b: createCallBudget({ callsPerMin: CALLS_PER_MIN, now: clock.now, sleep: advancingSleep }),
    calls,
    clock,
  }
}

// ─── RM1 ─────────────────────────────────────────────────────────────────────

describe('RM1 bulk respects the budget', () => {
  it('N bulk callers spend no more than the budget allows in one window', async () => {
    const { b, clock } = budget()
    const admittedAt: number[] = []
    for (let i = 0; i < CALLS_PER_MIN + 3; i++) {
      await b.take('bulk')
      admittedAt.push(clock.now())
    }
    // Count how many landed inside the first minute. The budget is the ceiling.
    const inFirstWindow = admittedAt.filter((t) => t < 60_000).length
    expect(
      inFirstWindow,
      `${inFirstWindow} admissions inside one window against a budget of ${CALLS_PER_MIN}`,
    ).toBeLessThanOrEqual(CALLS_PER_MIN)
  })

  it('and consecutive bulk admissions are at least the derived spacing apart', () => {
    // Stated as a relationship to the derivation, never to the number it makes.
    expect(SPACING).toBe(spacingMsForCallsPerMin(CALLS_PER_MIN))
    expect(60_000 / SPACING).toBeLessThanOrEqual(CALLS_PER_MIN)
  })
})

// ─── RM2 ─────────────────────────────────────────────────────────────────────

describe('RM2 bulk is FIFO', () => {
  it('three bulk callers are admitted in arrival order', async () => {
    const { b } = budget()
    const order: number[] = []
    // Start all three before awaiting any, so they genuinely queue together.
    const p = [0, 1, 2].map(async (i) => {
      await b.take('bulk')
      order.push(i)
    })
    await Promise.all(p)
    expect(order, 'the queue reordered its callers').toEqual([0, 1, 2])
  })
})

// ─── RM3 ─────────────────────────────────────────────────────────────────────

describe('RM3 the queue drains', () => {
  // Without this, a bucket that never refills passes RM1 perfectly by admitting
  // nobody at all.
  it('every queued bulk caller is eventually admitted', async () => {
    const { b } = budget()
    let admitted = 0
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        await b.take('bulk')
        admitted += 1
      }),
    )
    expect(admitted, 'the bucket starved its own queue').toBe(6)
  })
})

// ─── RM4 ─────────────────────────────────────────────────────────────────────

describe('RM4 interactive never waits', () => {
  it('admitted with ZERO wait against a saturated bucket', async () => {
    const { b, calls } = budget()
    // Drain the bucket first.
    for (let i = 0; i < CALLS_PER_MIN; i++) await b.take('bulk')
    const before = calls.length

    await b.take('interactive')

    const slept = calls.slice(before)
    expect(
      slept,
      'the interactive caller waited — a queued chart open spins with no end state',
    ).toEqual([])
  })
})

// ─── RM5 : THE COMPANION THAT MAKES IT HONEST ────────────────────────────────

describe('RM5 interactive still consumes', () => {
  it('a bulk caller waits LONGER after an interactive admission', async () => {
    // Baseline: one bulk take against a fresh bucket, then the next bulk wait.
    const a = budget()
    await a.b.take('bulk')
    const beforeA = a.calls.length
    await a.b.take('bulk')
    const baselineWait = a.calls.slice(beforeA).reduce((s, n) => s + n, 0)

    // Same again, but an interactive admission is spent in between.
    const c = budget()
    await c.b.take('bulk')
    await c.b.take('interactive')
    const beforeC = c.calls.length
    await c.b.take('bulk')
    const afterInteractive = c.calls.slice(beforeC).reduce((s, n) => s + n, 0)

    expect(
      afterInteractive,
      'interactive did not spend from the budget — the ceiling is a fiction',
    ).toBeGreaterThan(baselineWait)
  })
})

// ─── RM6 : THE DISCRIMINATOR ─────────────────────────────────────────────────

describe('RM6 a single caller against an empty bucket never waits', () => {
  // Without this, RM1 passes for a bucket that always sleeps.
  it('the first bulk take is immediate', async () => {
    const { b, calls } = budget()
    await b.take('bulk')
    expect(calls, 'the bucket paced a call with nothing to pace against').toEqual([])
  })
})
