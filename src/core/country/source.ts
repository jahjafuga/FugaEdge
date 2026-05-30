// Pure country-source logic, web-portable per ARCHITECTURE.md (no electron/
// fs/sqlite). The electron repo (electron/trades/country.ts) builds its SQL
// from these so the load-bearing rules are unit-tested even though the DB glue
// can't run under vitest.

/** Sources an automatic resolver can PRODUCE.
 *  - 'fmp'      = real domicile from FMP /stable/profile (ISO alpha-2) —
 *                 confident. Primary source as of v0.2.3 Stage 1.
 *  - 'polygon'  = real address.country / name-text hint from Polygon —
 *                 confident. Fallback when FMP returns nothing.
 *  - 'inferred' = guessed from listing locale/exchange only (US-listing ≠
 *                 domicile) — unconfident, re-resolvable, UI shows "assumed".
 *  - 'unknown'  = tried, nothing to go on. */
export type ResolvedSource = 'fmp' | 'polygon' | 'inferred' | 'unknown'

/** Every value the trades.country_source column can hold: an automatic
 *  ResolvedSource, plus 'manual' (an explicit user override the pure
 *  resolvers never produce, so it lives only here, not in ResolvedSource). */
export type CountrySource = ResolvedSource | 'manual'

/** Confident auto-sources — a real domicile signal, not a listing guess.
 *  'fmp' joins 'polygon' here: both are treated as settled on an incremental
 *  run (only re-touched on force). Centralized so isCountryReResolvable and
 *  any future confidence-gated logic share one definition. */
const CONFIDENT_SOURCES: ReadonlySet<string> = new Set<ResolvedSource>([
  'fmp',
  'polygon',
])

/** Whether an auto-resolve may (re)fetch + overwrite a row with this source.
 *  - 'manual' is always protected (user said so).
 *  - force re-resolves anything non-manual.
 *  - an incremental run re-resolves only unconfident rows: never-resolved
 *    (null), 'unknown' (tried, failed), or 'inferred' (a listing guess).
 *    Confident rows ('fmp', 'polygon') are left alone unless forced. */
export function isCountryReResolvable(source: string | null, force: boolean): boolean {
  if (source === 'manual') return false
  if (force) return true
  if (source == null) return true
  return !CONFIDENT_SOURCES.has(source)
}

/** Normalize manual-override input to an ISO alpha-2 (uppercase) or null. */
export function normalizeIso(raw: string | null): string | null {
  if (!raw) return null
  const iso = raw.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(iso) ? iso : null
}

/** Tiny inline badge shown next to a country in the trade-detail editor.
 *  Pure (no JSX) so it's unit-testable under the node-environment vitest
 *  config — the CountryEditor component reads this to render the chip.
 *  Returns null for the confident auto-sources ('fmp', 'polygon') — a
 *  correct domicile needs no caveat. Only the unconfident / overridden
 *  states earn a visible tag. */
export interface CountrySourceBadge {
  label: string
  title: string
}
export function countrySourceBadge(source: CountrySource): CountrySourceBadge | null {
  switch (source) {
    case 'manual':
      return { label: 'manual', title: 'Manually set' }
    case 'inferred':
      return { label: 'assumed', title: 'Assumed from listing — set country to confirm' }
    case 'fmp':
    case 'polygon':
    case 'unknown':
    default:
      // Confident or no-data: no caveat tag. 'unknown' renders as the
      // "Set country" affordance elsewhere, not a badge on a set country.
      return null
  }
}
