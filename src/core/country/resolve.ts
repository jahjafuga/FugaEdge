// Pure country/region resolvers. Web-portable per ARCHITECTURE.md — no
// electron/fs/sqlite/http imports.
//
// Two entry points, used PRIMARY → FALLBACK by the orchestrators:
//   - resolveCountryFromFmp(country)  — v0.2.3 PRIMARY. FMP /stable/profile's
//     real domicile (ISO alpha-2). Confident → source 'fmp'.
//   - resolveCountryFromPolygon(ref)  — FALLBACK. Polygon ticker-ref
//     address/text/listing heuristics. Confident 'polygon' or guessed 'inferred'.

import {
  SHELL_JURISDICTIONS,
  getCountryName,
  getRegionForCountry,
} from './regions'
import { normalizeIso, type ResolvedSource } from './source'

export interface PolygonTickerRef {
  results?: {
    address?: { country?: string }
    locale?: string
    primary_exchange?: string
    name?: string
    description?: string
    sic_description?: string
  }
}

export interface ResolvedCountry {
  country: string | null
  country_name: string
  region: string
  // Source confidence — see ResolvedSource in ./source for the full set.
  // 'fmp'      = real domicile from FMP /stable/profile — confident, PRIMARY.
  // 'polygon'  = real address.country (or a name/description hint) — confident, FALLBACK.
  // 'inferred' = guessed from listing locale / exchange only (US-listing ≠ US-domicile);
  //              Polygon's free tier carries no domicile field, so US-listed foreign
  //              issuers land here. Re-resolvable and flagged in the UI for confirmation.
  // 'unknown'  = nothing to go on.
  source: ResolvedSource
}

const SHELL_SET: ReadonlySet<string> = new Set<string>(SHELL_JURISDICTIONS)

// Name/description heuristics for the SHELL_JURISDICTIONS escape hatch.
// Order matters: more specific phrases (e.g. "hong kong") must be tested
// before broader ones (e.g. "china") so a "Hong Kong" company isn't
// misclassified as China.
const TEXT_HINTS: { iso: string; needles: string[] }[] = [
  { iso: 'HK', needles: ['hong kong'] },
  { iso: 'SG', needles: ['singapore'] },
  { iso: 'IL', needles: ['israel', 'tel aviv'] },
  { iso: 'TW', needles: ['taiwan', 'taipei'] },
  { iso: 'KR', needles: ['south korea', 'seoul'] },
  { iso: 'JP', needles: ['japan', 'tokyo'] },
  { iso: 'AU', needles: ['australia', 'sydney'] },
  { iso: 'CA', needles: ['canada', 'toronto', 'vancouver'] },
  { iso: 'GB', needles: ['united kingdom', 'london', ' uk '] },
  // China last so "Hong Kong" wins over "China" for HK companies that
  // happen to mention the mainland.
  { iso: 'CN', needles: ['china', 'shenzhen', 'shanghai', 'beijing'] },
]

const EXCHANGE_PREFIX_MAP: Record<string, string> = {
  XNAS: 'US', XNYS: 'US', ARCX: 'US', BATS: 'US', IEXG: 'US',
  XHKG: 'HK',
  XSES: 'SG',
  XTSE: 'CA', XTSX: 'CA',
  XLON: 'GB',
  XTKS: 'JP', XOSE: 'JP',
  XASX: 'AU',
  XKRX: 'KR',
  XTAI: 'TW',
  XBOM: 'IN', XNSE: 'IN',
  XETR: 'DE', XFRA: 'DE',
  XPAR: 'FR',
  XAMS: 'NL',
  XSWX: 'CH',
}

function build(iso: string | null, source: 'fmp' | 'polygon' | 'inferred' = 'polygon'): ResolvedCountry {
  if (!iso) {
    return { country: null, country_name: 'Unknown', region: 'Unknown', source: 'unknown' }
  }
  return {
    country: iso,
    country_name: getCountryName(iso),
    region: getRegionForCountry(iso),
    source,
  }
}

function scanText(...parts: (string | undefined | null)[]): string | null {
  const haystack = parts
    .filter((p): p is string => !!p)
    .map((p) => ` ${p.toLowerCase()} `)
    .join(' ')
  if (!haystack.trim()) return null
  for (const { iso, needles } of TEXT_HINTS) {
    for (const needle of needles) {
      if (haystack.includes(needle)) return iso
    }
  }
  return null
}

export function resolveCountryFromPolygon(ref: PolygonTickerRef): ResolvedCountry {
  const r = ref.results
  if (!r) return build(null)

  const addrRaw = r.address?.country?.trim().toUpperCase() ?? ''
  if (addrRaw) {
    if (!SHELL_SET.has(addrRaw)) {
      // Real operations country — pass through. If we don't recognize the
      // ISO at all (e.g. someone manually picked something exotic), it
      // still lands in 'Other' region via getRegionForCountry.
      return build(addrRaw)
    }
    // Shell jurisdiction — try to find a real operations hint.
    const fromText = scanText(r.name, r.description, r.sic_description)
    if (fromText) return build(fromText)
    // Fall through to exchange/locale heuristics before giving up — a
    // Cayman-shelled company listed on XHKG is almost certainly Hong Kong.
  }

  // No address.country (or it was a shell with no text hint) — fall back to
  // listing signals. These tell us where it's LISTED, not its domicile, so
  // they're marked 'inferred' (the free tier has no domicile field — US-listed
  // foreign issuers are indistinguishable from US companies here).
  const locale = r.locale?.trim().toLowerCase() ?? ''
  if (locale === 'us') return build('US', 'inferred')

  // Last resort: primary_exchange prefix.
  const exch = r.primary_exchange?.trim().toUpperCase() ?? ''
  if (exch && EXCHANGE_PREFIX_MAP[exch]) {
    return build(EXCHANGE_PREFIX_MAP[exch], 'inferred')
  }

  return build(null)
}

/**
 * v0.2.3 Stage 1 — PRIMARY country resolver, from FMP /stable/profile's
 * `country` field (already normalized to ISO alpha-2 or null by
 * fetchCompanyProfile). FMP returns the real DOMICILE, which Polygon's free
 * tier omits for US-listed foreign issuers — so a valid FMP country is always
 * confident: source 'fmp', NEVER 'inferred'.
 *
 * Pure (no API/key/fs) — same web-portable contract as resolveCountryFromPolygon.
 *
 * A valid alpha-2 → confident { country, country_name, region, source: 'fmp' }.
 * null / empty / malformed → the same unknown sentinel build(null) returns,
 * which the orchestrator reads as "FMP had nothing → fall back to Polygon".
 * normalizeIso re-validates defensively even though fetchCompanyProfile
 * already screened the value (pure functions don't trust their callers).
 */
export function resolveCountryFromFmp(country: string | null): ResolvedCountry {
  const iso = normalizeIso(country)
  if (!iso) return build(null)
  return build(iso, 'fmp')
}
