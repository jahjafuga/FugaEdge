// Pure constants for the country → region bucketing system. Web-portable
// per ARCHITECTURE.md — safe to import from any environment.

/** ISO 3166-1 alpha-2 codes that indicate a corporate-shell jurisdiction
 *  rather than the country a company actually operates in. When Polygon
 *  returns one of these as address.country we treat it as missing and try
 *  other signals (name/description text) to find the operating country. */
export const SHELL_JURISDICTIONS = [
  'KY', // Cayman Islands
  'BM', // Bermuda
  'VG', // British Virgin Islands
  'MH', // Marshall Islands
  'JE', // Jersey
  'GG', // Guernsey
  'IM', // Isle of Man
] as const

/** Ordered list of region buckets — display order in UI dropdowns and
 *  breakdown tables. USA first (most US-traders), Unknown last. */
export const REGIONS = [
  'USA',
  'China',
  'Hong Kong',
  'Singapore',
  'Israel',
  'Canada',
  'UK',
  'Europe',
  'Australia',
  'Japan',
  'Korea',
  'Taiwan',
  'India',
  'LatAm',
  'Other',
  'Unknown',
] as const

export type Region = (typeof REGIONS)[number]

/** ISO alpha-2 → bucket key. Per locked spec: Macau folds into China for
 *  trading purposes; Hong Kong stays separate. AU and NZ both fall in
 *  Australia. Anything not listed maps to 'Other' via the lookup helper. */
export const REGION_MAP: Record<string, Region> = {
  US: 'USA',
  CN: 'China', MO: 'China',
  HK: 'Hong Kong',
  SG: 'Singapore',
  IL: 'Israel',
  CA: 'Canada',
  GB: 'UK',
  DE: 'Europe', FR: 'Europe', IT: 'Europe', ES: 'Europe', NL: 'Europe',
  CH: 'Europe', SE: 'Europe', NO: 'Europe', DK: 'Europe', FI: 'Europe',
  IE: 'Europe', BE: 'Europe', AT: 'Europe', PT: 'Europe', LU: 'Europe',
  GR: 'Europe', PL: 'Europe', CZ: 'Europe', HU: 'Europe',
  AU: 'Australia', NZ: 'Australia',
  JP: 'Japan',
  KR: 'Korea',
  TW: 'Taiwan',
  IN: 'India',
  MX: 'LatAm', BR: 'LatAm', AR: 'LatAm', CL: 'LatAm', CO: 'LatAm', PE: 'LatAm',
}

/** ISO alpha-2 → display name. Covers every code in REGION_MAP plus
 *  common non-mapped codes (which still fall in 'Other' for region but
 *  should display correctly). */
export const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  CN: 'China', MO: 'Macau',
  HK: 'Hong Kong',
  SG: 'Singapore',
  IL: 'Israel',
  CA: 'Canada',
  GB: 'United Kingdom',
  DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', NL: 'Netherlands',
  CH: 'Switzerland', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland',
  IE: 'Ireland', BE: 'Belgium', AT: 'Austria', PT: 'Portugal', LU: 'Luxembourg',
  GR: 'Greece', PL: 'Poland', CZ: 'Czech Republic', HU: 'Hungary',
  AU: 'Australia', NZ: 'New Zealand',
  JP: 'Japan',
  KR: 'South Korea',
  TW: 'Taiwan',
  IN: 'India',
  MX: 'Mexico', BR: 'Brazil', AR: 'Argentina', CL: 'Chile', CO: 'Colombia', PE: 'Peru',
  // Shell jurisdictions — included so manual overrides display correctly
  // even though they aren't the operating country in normal flow.
  KY: 'Cayman Islands', BM: 'Bermuda', VG: 'British Virgin Islands',
  MH: 'Marshall Islands', JE: 'Jersey', GG: 'Guernsey', IM: 'Isle of Man',
  // Common-but-unmapped codes — fall in 'Other' region, named here so the UI
  // doesn't show a bare ISO code.
  RU: 'Russia', TR: 'Turkey', SA: 'Saudi Arabia', AE: 'United Arab Emirates',
  ZA: 'South Africa', NG: 'Nigeria', EG: 'Egypt', TH: 'Thailand',
  ID: 'Indonesia', MY: 'Malaysia', PH: 'Philippines', VN: 'Vietnam',
  PK: 'Pakistan', BD: 'Bangladesh', LK: 'Sri Lanka',
  RO: 'Romania', BG: 'Bulgaria', UA: 'Ukraine', HR: 'Croatia', SI: 'Slovenia',
  SK: 'Slovakia', EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania', IS: 'Iceland',
  MT: 'Malta', CY: 'Cyprus',
}

/** Region key → ISO alpha-2 of the country that visually represents
 *  the region in UI labels (so a region row in Reports can show a flag
 *  next to its name). For multi-country regions (Europe, LatAm, Other,
 *  Unknown) the value is `null` — there's no single fair representative
 *  flag, so the caller renders the region name only.
 *
 *  Keys MUST stay in sync with the REGIONS list — the unit test guards
 *  that. */
export const REGION_REPRESENTATIVE_COUNTRY: Record<Region, string | null> = {
  USA: 'US',
  China: 'CN',
  'Hong Kong': 'HK',
  Singapore: 'SG',
  Israel: 'IL',
  Canada: 'CA',
  UK: 'GB',
  Europe: null,
  Australia: 'AU',
  Japan: 'JP',
  Korea: 'KR',
  Taiwan: 'TW',
  India: 'IN',
  LatAm: null,
  Other: null,
  Unknown: null,
}

export function getRegionForCountry(iso: string | null | undefined): Region {
  if (!iso) return 'Unknown'
  const code = iso.toUpperCase()
  if (code in REGION_MAP) return REGION_MAP[code]
  // Any well-formed ISO-looking code we don't recognize falls in 'Other'.
  if (/^[A-Z]{2}$/.test(code)) return 'Other'
  return 'Unknown'
}

export function getCountryName(iso: string | null | undefined): string {
  if (!iso) return 'Unknown'
  const code = iso.toUpperCase()
  return COUNTRY_NAMES[code] ?? 'Unknown'
}
