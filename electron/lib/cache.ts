// Tiny in-memory TTL cache for expensive read-only IPC handlers
// (analyticsGet, reportsGet, insightsGet).
//
// Two invalidation knobs:
//   1. Implicit time-based: every entry has a TTL; expired entries are
//      computed fresh on access.
//   2. Explicit version-based: callers that mutate trade data bump the
//      module-level dataVersion via bumpDataVersion(). Cache entries
//      stamped with a stale version count as a miss.
//
// Stays in-process (main); never crosses IPC. The map is small (<10 keys)
// and held by the singleton main process for the app's lifetime.

let dataVersion = 0

export function bumpDataVersion(): void {
  dataVersion += 1
}

export function getDataVersion(): number {
  return dataVersion
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
  version: number
}

interface CacheOptions {
  /** Time-to-live in ms. Defaults to 5 minutes. */
  ttlMs?: number
}

const DEFAULT_TTL_MS = 5 * 60 * 1000

const store = new Map<string, CacheEntry<unknown>>()

export function clearCache(): void {
  store.clear()
}

/**
 * Memoize an expensive sync computation by string key.
 *
 * - Hit: returns cached value if not expired AND version matches.
 * - Miss/stale: invokes compute(), stamps the result with now+ttl + current
 *   version, stores it.
 *
 * The `compute` arg is called *synchronously*. better-sqlite3 is synchronous,
 * so analytics/reports/insights handlers never need to await.
 */
export function memoize<T>(
  key: string,
  compute: () => T,
  opts: CacheOptions = {},
): T {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS
  const now = Date.now()
  const hit = store.get(key) as CacheEntry<T> | undefined
  if (hit && hit.expiresAt > now && hit.version === dataVersion) {
    return hit.value
  }
  const value = compute()
  store.set(key, { value, expiresAt: now + ttl, version: dataVersion })
  return value
}
