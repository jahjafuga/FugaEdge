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

// ── Fix (a) — missing-first refresh classification + ordering ────────────────
// The market-refresh worklist used to be one alphabetical batch with missing
// and stale symbols interleaved, so a newly-traded symbol (no market_data row)
// queued behind the whole stale alphabet and — under the rate limit — rarely
// got through. These pure helpers classify each symbol and order MISSING ones
// first so a fresh symbol surfaces on the first refresh click. The electron
// repo supplies the rows; the policy stays here, unit-tested, web-portable.

export type RefreshKind =
  | 'missing'           // no market_data row yet — fetch first (high priority)
  | 'errored-retry'     // errored, transient/ambiguous — re-attempt
  | 'errored-cooldown'  // errored, plan-gated inside cooldown — skip this run
  | 'stale'             // present, no error, older than the cache window — re-fetch
  | 'fresh'             // present, no error, within the cache window — skip

/** Classify one symbol's market_data row (or its absence) for a force=false
 *  refresh. Pure — `now`/`staleAfterMs` are injected. Mirrors the prior inline
 *  predicate in symbolsNeedingFetch, now reusable + testable. */
export function classifyRefresh(
  row: { error: string | null; fetched_at: string } | null,
  now: number,
  staleAfterMs: number,
  cooldownMs: number = PLAN_GATE_COOLDOWN_MS,
): RefreshKind {
  if (!row) return 'missing'
  if (row.error) {
    return shouldRetryErrored(row.error, row.fetched_at, now, cooldownMs)
      ? 'errored-retry'
      : 'errored-cooldown'
  }
  const fetched = Date.parse(row.fetched_at)
  // Unparseable timestamp → treat as stale (never strand a row on a bad date).
  if (!Number.isFinite(fetched)) return 'stale'
  return now - fetched >= staleAfterMs ? 'stale' : 'fresh'
}

/** Whether a classified symbol should be fetched this run (excludes fresh +
 *  in-cooldown). */
export function shouldRefresh(kind: RefreshKind): boolean {
  return kind === 'missing' || kind === 'errored-retry' || kind === 'stale'
}

/** Missing-first ordering: MISSING symbols lead, then stale / errored-retry;
 *  fresh and in-cooldown are dropped. Input is the classified symbols in their
 *  natural (alphabetical) order; output preserves that order WITHIN each bucket.
 *  Pure — the electron repo classifies its rows and calls this. */
export function orderRefreshSymbols(
  classified: { symbol: string; kind: RefreshKind }[],
): string[] {
  const missing: string[] = []
  const rest: string[] = []
  for (const { symbol, kind } of classified) {
    if (kind === 'missing') missing.push(symbol)
    else if (shouldRefresh(kind)) rest.push(symbol)
    // fresh / errored-cooldown → excluded
  }
  return [...missing, ...rest]
}
