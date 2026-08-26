// Shared rate-limit retry helper.
//
// Centralizes the "soft retry on 429" pattern that was previously duplicated
// inline across the market + import fetch paths (resolve-countries,
// enrich-aggregates, country backfill, intraday, and — once the runRefresh
// rate-limit migration landed — runRefresh's internal fetchOne, which had been
// the last holdout, still on its own ad-hoc 350ms throttle + single 12s retry).
// The previous inline design did a single 12s retry and dropped the symbol on
// the second failure — Lao's Day 7A smoke test hit Polygon's free-tier
// 5-calls/min limit and 10 of 19 symbols errored out because one retry
// wasn't enough to wait for the bucket to refill.
//
// New strategy:
//   - up to maxAttempts total (default 3 = initial + 2 retries)
//   - capped exponential backoff: baseBackoffMs, baseBackoffMs * 2.5,
//     baseBackoffMs * 5 → 12s, 30s, 60s by default (matches the
//     free-tier bucket refill cadence)
//   - honor `Retry-After` when MassiveError.retryAfterMs is set
//   - non-429 errors throw immediately (network errors, 500s, malformed
//     responses — none of those benefit from a polite wait)
//
// Pure module; takes the work as an injected callback so tests can use
// any fake without a real fetch. No electron / fs / http imports.

import { MassiveError } from './massive'

export interface RateLimitOptions {
  /** Total attempts including the first call. Default 3. */
  maxAttempts?: number
  /** First retry backoff in ms. Default 12_000 — matches Polygon's
   *  free-tier 5-calls-per-minute bucket refill cadence. */
  baseBackoffMs?: number
  /** Cap so the schedule cannot stretch arbitrarily long. Default
   *  60_000 — one minute matches Polygon's documented quota window. */
  maxBackoffMs?: number
  /** Whether to use `MassiveError.retryAfterMs` when it's present. The
   *  capped exponential schedule is the fallback. Default true. */
  honorRetryAfter?: boolean
  /** Sleep function. Defaulted to setTimeout-based; tests inject. */
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_BACKOFF_MS = 12_000
const DEFAULT_MAX_BACKOFF_MS = 60_000

// ── Proactive pacing basis (free-tier-derived, NOT hardcoded) ────────────────
// The provider call-rate limit is the single named input; the inter-call spacing
// is COMPUTED from it. So moving to a paid/"FugaEdge business" tier is a CONFIG
// change (raise the calls-per-min) — the derivation and every caller are unchanged.
// (SaaS port: the per-user-key model becomes one shared server-side key + a
// shared throttle, but this pacing math stays identical — only where the limit
// lives moves to a tier config.)
//
// Polygon's documented free-tier limit (also referenced in this file's header).
export const POLYGON_FREE_TIER_CALLS_PER_MIN = 5

/** Minimum ms between successive calls to hold at/under `callsPerMin`. Rounds UP
 *  so the derived rate never EXCEEDS the limit (5/min → 12000ms; 100/min → 600ms).
 *  Pure: the limit is the only input. */
export function spacingMsForCallsPerMin(callsPerMin: number): number {
  return Math.ceil(60_000 / callsPerMin)
}

/** Proactive inter-call spacing for runWarmupBackfill — derived from the free-tier
 *  limit so the bulk warmup recovery paces UNDER it and (in the normal case) never
 *  trips a 429. withRateLimitRetry remains the belt-and-suspenders for any 429 that
 *  still slips through. 12000ms today; recomputes if the tier limit changes. */
export const WARMUP_SPACING_MS = spacingMsForCallsPerMin(POLYGON_FREE_TIER_CALLS_PER_MIN)

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Capped exponential schedule. Attempt index 0 → base, 1 → base*2.5,
 *  2 → base*5, … all clamped to maxBackoffMs. The 2.5 multiplier (vs.
 *  plain doubling) was chosen so the three default steps land cleanly
 *  at 12s/30s/60s — readable in logs + matches Polygon's bucket window. */
export function backoffFor(
  attemptIndex: number,
  baseMs: number,
  maxMs: number,
): number {
  const raw = baseMs * Math.pow(2.5, attemptIndex)
  return Math.min(Math.round(raw), maxMs)
}

export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  opts: RateLimitOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseMs = opts.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS
  const maxMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS
  const honor = opts.honorRetryAfter ?? true
  const sleep = opts.sleep ?? realSleep

  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const isRateLimit = e instanceof MassiveError && e.status === 429
      // Anything other than a 429 bubbles up immediately — network
      // errors, 5xxs, parse failures aren't politeness problems.
      if (!isRateLimit) throw e
      // No more attempts left → bubble the original error up so the
      // caller's per-symbol catch (orchestrator level) can record it.
      if (attempt === maxAttempts - 1) throw e

      const fromHeader = honor && e.retryAfterMs != null ? e.retryAfterMs : null
      const fromSchedule = backoffFor(attempt, baseMs, maxMs)
      const waitMs = fromHeader != null ? Math.min(fromHeader, maxMs) : fromSchedule
      await sleep(waitMs)
    }
  }
  // Unreachable — the loop either returns or throws — but appeases the
  // type checker.
  throw lastErr
}

// ── The shared call budget ───────────────────────────────────────────────────
// A pacer per path is not a budget. Several independent pacers, each correctly
// spacing its own calls, together offer several times the ceiling because none
// of them knows the others exist. This is the one object that does.
//
// UNWIRED as it lands: nothing imports it yet. Proving the primitive and proving
// the wiring are separate claims, and a beat that made both at once could not
// show either cleanly.
//
// THE MODEL is a cursor, not a counter. `nextFreeAt` is the earliest moment the
// next call may be issued; every admission pushes it forward by one spacing.
// That keeps the arithmetic in one place and makes the two modes differ in
// exactly one respect — whether the caller waits for the cursor or is let
// through ahead of it.

export type CallKind = 'bulk' | 'interactive'

export interface CallBudgetOptions {
  /** The ceiling. The spacing is DERIVED from it, never chosen. */
  callsPerMin: number
  /** Injected clock; tests drive it. A budget reading the real clock cannot be
   *  asserted — its refill would depend on how long the test took to run. */
  now?: () => number
  /** Injected sleep; tests pass an instant one. Same idiom as the retry helper
   *  above and runWarmupBackfill's option. */
  sleep?: (ms: number) => Promise<void>
}

export interface CallBudget {
  /** Wait for (or claim) permission to issue one call. */
  take(kind: CallKind): Promise<void>
}

/** One budget shared by every caller that goes through a common chokepoint.
 *
 *  BULK waits for the cursor, first come first served: takes are handed their
 *  slot synchronously, before any await, so arrival order is admission order.
 *
 *  INTERACTIVE is admitted at once and never waits, but STILL SPENDS — the
 *  cursor advances exactly as it would have, so the next bulk caller waits that
 *  much longer. The reason it does not queue is a product one: the request
 *  timeout only starts once a request is issued, so time spent waiting for
 *  admission is time nothing is counting, and a user-facing fetch parked in a
 *  queue shows a spinner with no end state. Letting it through keeps the
 *  ceiling honest while keeping the interface answerable. If interactive did
 *  NOT spend, the ceiling would be a fiction and "interactive" would just be
 *  another word for unlimited. */
export function createCallBudget(opts: CallBudgetOptions): CallBudget {
  const spacingMs = spacingMsForCallsPerMin(opts.callsPerMin)
  const now = opts.now ?? (() => Date.now())
  const sleep = opts.sleep ?? realSleep

  // The earliest instant the next call may go out. Zero means "no call yet".
  let nextFreeAt = 0

  return {
    async take(kind: CallKind): Promise<void> {
      const t = now()
      // Claim the slot BEFORE awaiting anything. Two callers arriving in the
      // same tick therefore claim distinct, ordered slots — without this they
      // would both read the same cursor and wake together, which is the exact
      // read-then-write race a per-path pacer already has.
      const slotAt = Math.max(t, nextFreeAt)
      nextFreeAt = slotAt + spacingMs

      if (kind === 'interactive') return // spent, but never waits
      const wait = slotAt - t
      if (wait > 0) await sleep(wait)
    },
  }
}
