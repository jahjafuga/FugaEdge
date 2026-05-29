// Pure country-source logic, web-portable per ARCHITECTURE.md (no electron/
// fs/sqlite). The electron repo (electron/trades/country.ts) builds its SQL
// from these so the load-bearing rules are unit-tested even though the DB glue
// can't run under vitest.

export type CountrySource = 'polygon' | 'inferred' | 'manual' | 'unknown'

/** Whether an auto-resolve may (re)fetch + overwrite a row with this source.
 *  - 'manual' is always protected (user said so).
 *  - force re-resolves anything non-manual.
 *  - an incremental run re-resolves only unconfident rows: never-resolved
 *    (null), 'unknown' (tried, failed), or 'inferred' (a listing guess). */
export function isCountryReResolvable(source: string | null, force: boolean): boolean {
  if (source === 'manual') return false
  if (force) return true
  return source == null || source === 'unknown' || source === 'inferred'
}

/** Normalize manual-override input to an ISO alpha-2 (uppercase) or null. */
export function normalizeIso(raw: string | null): string | null {
  if (!raw) return null
  const iso = raw.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(iso) ? iso : null
}
