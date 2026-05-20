import type { MassiveKeyStatus } from '@shared/massive-types'

// Massive API-key verification service.
//
// Per ARCHITECTURE.md Rule 4, third-party APIs are wrapped in service
// modules under src/services that take the API key as a parameter and stay
// free of electron / fs / sqlite imports, so they remain web-portable. In
// Electron mode the main process injects the key; in a future web build the
// backend would.

const ENDPOINT = 'https://api.massive.com/v1/marketstatus/now'

/**
 * Test whether a Massive API key is accepted by the Massive API.
 *
 * - Pure: accepts apiKey as a parameter, never reads process.env, no
 *   electron/fs/sqlite imports. Uses the global fetch — web-portable.
 * - Returns a typed discriminated union; NEVER throws.
 * - Does NOT auto-retry on 429. Intentional: the Save flow wants a
 *   one-shot result it can report to the user, not a multi-second hang.
 *   This is a deliberate divergence from electron/market/rate-limit.ts,
 *   whose withRateLimitRetry helper is for bulk fetches, not verification.
 */
export async function verifyMassive(apiKey: string): Promise<MassiveKeyStatus> {
  const url = `${ENDPOINT}?apiKey=${encodeURIComponent(apiKey)}`
  try {
    const res = await fetch(url, { method: 'GET' })
    if (res.status === 200) return { kind: 'valid' }
    if (res.status === 401 || res.status === 403) return { kind: 'invalid' }
    if (res.status === 429) return { kind: 'rate-limited' }
    // Any other non-2xx: Massive responded, but not with auth success.
    // Treated as invalid. If a 5xx ever needs distinct handling, add a state.
    return { kind: 'invalid' }
  } catch {
    // fetch() rejects only on network-level failure (DNS, offline, TLS) —
    // never on a non-2xx HTTP status.
    return { kind: 'network-error' }
  }
}
