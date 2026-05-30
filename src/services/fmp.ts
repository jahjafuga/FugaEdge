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
//   /stable/profile?symbol=...&apikey=...
//     Returns [{ symbol, companyName, country, exchange, marketCap, sector, ... }].
//     country is ISO 3166-1 alpha-2 uppercase (e.g. "IL" for SPRC) — the
//     DOMICILE, which Polygon's free tier omits for US-listed foreign issuers
//     (the country-default bug). Empty array = unknown symbol (verified
//     2026-05-31: ZZZZZ → []). Stage 1 reads ONLY country; market_cap / sector
//     ride the same response but are deferred to Stage 2 (not wired here yet).
//
// Secrets-handling rule (mirror massive.ts): NEVER log the full URL — the
// key is in the query string. Log status code + symbol only.

const SHARES_FLOAT_ENDPOINT =
  'https://financialmodelingprep.com/stable/shares-float'

const COMPANY_PROFILE_ENDPOINT =
  'https://financialmodelingprep.com/stable/profile'

// Per-request hard timeout — mirrors electron/market/massive.ts's
// REQUEST_TIMEOUT_MS so a stalled FMP request can't silently hang the
// fire-and-forget import path. Smoke-found 2026-05-30: without this,
// a stuck FMP fetch would never settle and no error would surface —
// the same failure mode commit edcf2a4 already fixed for Polygon.
const REQUEST_TIMEOUT_MS = 15_000

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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal })
    if (res.status === 200) return { kind: 'valid' }
    if (res.status === 401 || res.status === 403) return { kind: 'invalid' }
    if (res.status === 429) return { kind: 'rate-limited' }
    // Any other non-2xx: FMP responded, but not with auth success. Treated
    // as invalid. If a 5xx ever needs distinct handling, add a state.
    return { kind: 'invalid' }
  } catch {
    // fetch() rejects on network-level failure (DNS, offline, TLS) OR on
    // the AbortController firing — both collapse to network-error here,
    // keeping the Settings "Test key" flow's contract of returning a
    // discriminated union without ever throwing.
    return { kind: 'network-error' }
  } finally {
    clearTimeout(timer)
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
  // Per-request timeout: the AbortController fires after REQUEST_TIMEOUT_MS
  // and the same timer also bounds a stalled response stream (headers
  // arrived, body never finishes). Cleared in `finally`.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetch(url, { method: 'GET', signal: controller.signal })
    } catch (e) {
      // Distinguish timeout-abort from genuine network failure. Timeout
      // throws so the orchestrator records it in errors[] under a clear
      // diagnostic; network failures keep the existing nullResult contract
      // (silent "missing" — the import path can't block on a single
      // unreachable symbol). The timeout message mirrors Polygon's
      // massive.ts verbatim so a future consumer persisting this to
      // market_data.error can use the same `${status === 0 ? 'network' :
      // status}: ${e.message}` prefix shape — that lands as
      // "network: Request timed out after 15000ms", which the existing
      // refresh-eligibility.ts classifier treats as transient (NOT
      // plan-gated 403:NOT_AUTHORIZED) and retries on next refresh.
      const timedOut =
        !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError'
      if (timedOut) {
        throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`)
      }
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
  } finally {
    clearTimeout(timer)
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

/**
 * Fetch the company DOMICILE country for a symbol from /stable/profile.
 *
 * Stage 1 (country) — the reason this endpoint exists in our codebase: FMP's
 * profile carries the real domicile as `country` (ISO 3166-1 alpha-2, e.g.
 * "IL" for SPRC), which Polygon's free tier omits for US-listed foreign
 * issuers — the source of the wrong "US (inferred)" bug. Verified across a
 * 12-ticker basket on 2026-05-31 (SPRC→IL, HTCO→SG, BABA/NIO→CN, ASML→NL,
 * NVO→DK, TSM→TW, SHOP→CA; US names→US; ZZZZZ→[]).
 *
 * Contract — a byte-for-byte mirror of fetchSharesFloat:
 * - Pure: apiKey as a parameter, no process.env / electron / fs / sqlite.
 * - NEVER throws on non-200 / empty / malformed → returns null. The country
 *   resolver treats null as "FMP had nothing" and falls back to Polygon.
 * - 15s AbortController; a genuine timeout THROWS (same as fetchSharesFloat)
 *   so the orchestrator can record it in errors[] rather than silently
 *   masking a stall as "no data".
 * - Secrets rule: never log the URL/key — status + symbol only.
 *
 * Stage 1 deliberately returns ONLY the country string. market_cap / sector
 * live in this same response but are Stage 2 — do not read them here yet.
 */
export async function fetchCompanyProfile(
  apiKey: string,
  symbol: string,
): Promise<string | null> {
  const url = `${COMPANY_PROFILE_ENDPOINT}?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`
  // Per-request timeout: the AbortController fires after REQUEST_TIMEOUT_MS
  // and the same timer also bounds a stalled response stream. Cleared in
  // `finally`. Mirrors fetchSharesFloat verbatim.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetch(url, { method: 'GET', signal: controller.signal })
    } catch (e) {
      // Distinguish timeout-abort from genuine network failure — same split
      // as fetchSharesFloat. Timeout throws so the orchestrator records a
      // clear diagnostic; a plain network failure returns null (silent
      // "no data → fall back to Polygon"; the import path can't block on a
      // single unreachable symbol).
      const timedOut =
        !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError'
      if (timedOut) {
        throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`)
      }
      return null
    }
    if (res.status !== 200) return null

    let body: unknown
    try {
      body = await res.json()
    } catch {
      return null
    }

    // FMP returns an array. Empty = unknown symbol (verified: ZZZZZ → []).
    if (!Array.isArray(body) || body.length === 0) return null
    const row = body[0] as Record<string, unknown>

    // country is ISO alpha-2 uppercase. Normalize defensively: trim +
    // uppercase, and reject anything that isn't a clean 2-letter code
    // (empty string, null, or a malformed value) by returning null so the
    // resolver falls back to Polygon rather than persisting garbage.
    const raw = row.country
    if (typeof raw !== 'string') return null
    const iso = raw.trim().toUpperCase()
    return /^[A-Z]{2}$/.test(iso) ? iso : null
  } finally {
    clearTimeout(timer)
  }
}
