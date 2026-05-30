// Pure refresh-eligibility logic, web-portable per ARCHITECTURE.md (no electron/
// fs/sqlite). The electron market repo (electron/market/repo.ts) reads each
// errored row's stored error + fetched_at and asks shouldRetryErrored whether a
// force=false refresh should re-attempt it — so the rule is unit-tested even
// though the SQL glue can't run under vitest.

// Re-attempt a still-plan-gated (symbol, date) this long after the last attempt.
// The free-tier 403 is TIME-WINDOW-gated ("your plan doesn't include this data
// time frame"), not plan-permanent: a date that 403s today can age into
// availability later. Live evidence puts the gate at >= ~1 month (a 28-day-old
// date still 403s), so 30 days would re-hammer dates that are still blocked.
// 45 days sits comfortably past the observed floor — the grind stays quiet, yet
// a pair self-heals once it ages in (or the user upgrades + force-refreshes).
// Single named constant: trivially tunable.
export const PLAN_GATE_COOLDOWN_MS = 45 * 24 * 60 * 60 * 1000

/** High-confidence "permanent on this plan (for now)" signal: our OWN '403:'
 *  prefix (written by fetchOne as `${status}: ${message}`) AND Polygon's
 *  NOT_AUTHORIZED body. Anything else — 429, network, timeout, a bare 403, or
 *  any unrecognized string — is treated as transient. We parse our own
 *  deterministic prefix, not Polygon's free text. */
export function isPlanGated(error: string | null): boolean {
  if (!error) return false
  return error.startsWith('403:') && error.includes('NOT_AUTHORIZED')
}

/** Whether a force=false refresh should re-attempt an ERRORED (symbol, date).
 *  Conservative bias — retry everything EXCEPT a plan-gated pair still inside
 *  its cooldown window. force=true bypasses this entirely (handled upstream in
 *  the needing-fetch functions, which return all pairs before any filtering). */
export function shouldRetryErrored(
  error: string | null,
  fetchedAt: string | null,
  now: number,
  cooldownMs: number = PLAN_GATE_COOLDOWN_MS,
): boolean {
  if (!isPlanGated(error)) return true // transient / ambiguous → always retry
  const last = fetchedAt ? Date.parse(fetchedAt) : NaN
  if (!Number.isFinite(last)) return true // no usable timestamp → never strand
  return now - last >= cooldownMs // skip inside the window; re-attempt past it
}
