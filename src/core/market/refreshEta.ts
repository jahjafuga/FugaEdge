// Remaining-time estimate for a refresh run.
//
// MEASURED, NEVER PREDICTED. Pace is elapsed divided by completed — what this
// run has actually managed — and never the inter-call spacing. Two independent
// reasons, either of which would settle it on its own:
//
//   1. The shared call budget makes real pace variable. A chart open spends from
//      the same ceiling, so a theoretical estimate is wrong precisely when the
//      user is also using the app, which is most of the time.
//   2. The spacing derives from a constant named for a service this code does
//      not call. Anything built on it would inherit that wrongness silently.
//
// NO FABRICATED DATA. Before the first progress event there is no pace, and at
// the finish there is nothing left to wait for. Both return null so the caller
// renders an em-dash. Never a zero — "0s left" promises an instant finish — and
// never a placeholder string. Same law the money formatters follow.
//
// Pure: no clock, no imports. The caller owns elapsed, which keeps this callable
// from a test without faking time.

/**
 * Milliseconds still to go, from observed pace, or null when there is no honest
 * answer.
 *
 * @param elapsedMs how long this run has been going
 * @param completed items finished so far
 * @param total     items in the run
 */
export function estimateRemainingMs(
  elapsedMs: number,
  completed: number,
  total: number,
): number | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null
  if (!Number.isFinite(completed) || !Number.isFinite(total)) return null
  // No pace yet: nothing has finished, so nothing can be inferred.
  if (completed <= 0) return null
  // Nothing left to wait for. Returning zero here would render as an estimate of
  // no time remaining, which is a claim rather than an absence.
  if (completed >= total) return null

  const msPerItem = elapsedMs / completed
  return Math.round(msPerItem * (total - completed))
}
