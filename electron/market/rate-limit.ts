// Shared rate-limit retry helper.
//
// Centralizes the "soft retry on 429" pattern that was duplicated across
// six call sites (resolve-countries, enrich-float, enrich-aggregates,
// country backfill, intraday, and runRefresh's internal fetchOne). The
// previous design did a single 12s retry and dropped the symbol on the
// second failure — Lao's Day 7A smoke test hit Polygon's free-tier
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
