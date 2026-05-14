// Pure Polygon ticker-ref → country/region resolver. Web-portable per
// ARCHITECTURE.md — no electron/fs/sqlite/http imports.

import {
  SHELL_JURISDICTIONS,
  getCountryName,
  getRegionForCountry,
} from './regions'

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
  source: 'polygon' | 'unknown'
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

function build(iso: string | null): ResolvedCountry {
  if (!iso) {
    return { country: null, country_name: 'Unknown', region: 'Unknown', source: 'unknown' }
  }
  return {
    country: iso,
    country_name: getCountryName(iso),
    region: getRegionForCountry(iso),
    source: 'polygon',
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

  // No address.country (or it was a shell with no text hint) — try locale.
  const locale = r.locale?.trim().toLowerCase() ?? ''
  if (locale === 'us') return build('US')

  // Last resort: primary_exchange prefix.
  const exch = r.primary_exchange?.trim().toUpperCase() ?? ''
  if (exch && EXCHANGE_PREFIX_MAP[exch]) {
    return build(EXCHANGE_PREFIX_MAP[exch])
  }

  return build(null)
}
