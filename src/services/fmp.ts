import type { FmpKeyStatus, SharesFloatResult } from '@shared/fmp-types'

// FMP (Financial Modeling Prep) market-data service.
//
// Per ARCHITECTURE.md Rule 4, third-party APIs are wrapped in service
// modules under src/services that take the API key as a parameter and stay
// free of electron / fs / sqlite imports, so they remain web-portable. In
// Electron mode the main process injects the key; in a future web build the
// backend would. Mirrors the structure of src/services/massive.ts.
//
// API surface used here:
//   /stable/shares-float?symbol=...&apikey=...
//     Returns [{ symbol, freeFloat, floatShares, outstandingShares, date }]
//     Empty floatShares / freeFloat surface as '' (empty string) in some
//     small-cap responses (Step 1 verification 2026-05-29: LABT case).
//     Free tier: 250 calls/day at the time of verification.
//
// Secrets-handling rule (mirror massive.ts): NEVER log the full URL — the
// key is in the query string. Log status code + symbol only.

const SHARES_FLOAT_ENDPOINT =
  'https://financialmodelingprep.com/stable/shares-float'

/**
 * Test whether an FMP API key is accepted by FMP.
 *
 * - Pure: accepts apiKey as a parameter, never reads process.env, no
 *   electron/fs/sqlite imports. Uses the global fetch — web-portable.
 * - Returns a typed discriminated union; NEVER throws.
 * - Does NOT auto-retry on 429. Intentional — same one-shot semantics as
 *   verifyMassive: the Settings "Test key" flow wants a single result it
 *   can render, not a multi-second hang.
 * - Probe symbol is AAPL — a stable, always-covered ticker that won't
 *   give us a false negative on plan-gated 403 (those happen on specific
 *   endpoints/timeframes, not the shares-float endpoint as of Step 1).
 */
export async function verifyFmp(apiKey: string): Promise<FmpKeyStatus> {
  const url = `${SHARES_FLOAT_ENDPOINT}?symbol=AAPL&apikey=${encodeURIComponent(apiKey)}`
  try {
    const res = await fetch(url, { method: 'GET' })
    if (res.status === 200) return { kind: 'valid' }
    if (res.status === 401 || res.status === 403) return { kind: 'invalid' }
    if (res.status === 429) return { kind: 'rate-limited' }
    // Any other non-2xx: FMP responded, but not with auth success. Treated
    // as invalid. If a 5xx ever needs distinct handling, add a state.
    return { kind: 'invalid' }
  } catch {
    // fetch() rejects only on network-level failure (DNS, offline, TLS) —
    // never on a non-2xx HTTP status.
    return { kind: 'network-error' }
  }
}

/**
 * Fetch float + outstanding share counts for a symbol.
 *
 * - Returns SharesFloatResult with each field nullable. NEVER throws —
 *   the import-time enrichment path must not block on a single failure.
 * - Empty floatShares / freeFloat values (Step 1's LABT case, where FMP
 *   returns '' as the string value) normalize to null. The orchestrator
 *   treats null as "missing" and the UI surfaces "Unavailable".
 * - 401/403/429/5xx/network-error all collapse to all-null. The caller
 *   distinguishes terminal vs transient errors elsewhere (Commit B will
 *   add this to the enrichment wrapper, like the country/Massive paths).
 */
export async function fetchSharesFloat(
  apiKey: string,
  symbol: string,
): Promise<SharesFloatResult> {
  const nullResult: SharesFloatResult = {
    floatShares: null,
    outstandingShares: null,
    freeFloatPercent: null,
  }
  const url = `${SHARES_FLOAT_ENDPOINT}?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`
  let res: Response
  try {
    res = await fetch(url, { method: 'GET' })
  } catch {
    return nullResult
  }
  if (res.status !== 200) return nullResult

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return nullResult
  }

  // FMP returns an array. Empty = unknown symbol. Read the first row.
  if (!Array.isArray(body) || body.length === 0) return nullResult
  const row = body[0] as Record<string, unknown>

  return {
    floatShares: toNullableNumber(row.floatShares),
    outstandingShares: toNullableNumber(row.outstandingShares),
    freeFloatPercent: toNullableNumber(row.freeFloat),
  }
}

/** Coerce FMP's field value to a number or null. FMP has been observed
 *  returning '' (empty string) for missing values on small-caps — those
 *  must NOT become 0, they must become null so the UI knows to show
 *  "Unavailable" instead of silently misclaiming a real zero. */
function toNullableNumber(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (trimmed === '') return null
    const n = Number.parseFloat(trimmed)
    return Number.isFinite(n) ? n : null
  }
  return null
}
