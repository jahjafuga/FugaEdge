/**
 * Result of testing an FMP (Financial Modeling Prep) API key.
 *
 * Discriminated union so the renderer can switch cleanly without try/catch.
 * Mirrors the MassiveKeyStatus shape used by the existing Massive key card.
 *
 * `valid`         — FMP accepted the key (HTTP 200).
 * `invalid`       — FMP rejected the key (HTTP 401/403): wrong, expired,
 *                   or not entitled to the requested endpoint.
 * `rate-limited`  — HTTP 429. Key is probably fine; couldn't verify right now.
 * `network-error` — Network failure before reaching FMP. Couldn't verify;
 *                   key state unknown.
 */
export type FmpKeyStatus =
  | { kind: 'valid' }
  | { kind: 'invalid' }
  | { kind: 'rate-limited' }
  | { kind: 'network-error' }

/**
 * Per-symbol response from FMP's /stable/shares-float endpoint.
 *
 * Step 1 verification (2026-05-29) confirmed all three fields are useful:
 *   - floatShares: TRADEABLE supply (the momentum-relevant number).
 *   - outstandingShares: ISSUED supply; preserved so it can replace the
 *     legacy "Shares Out" display alongside the new Float field.
 *   - freeFloatPercent: floatShares / outstandingShares × 100 — surfaced
 *     for the eventual UI tooltip / hover-detail.
 *
 * Empty/missing fields normalize to `null` — NEVER coerced to 0. ~10% of
 * small-caps (e.g. LABT in Step 1) return non-null outstandingShares but
 * null floatShares; the UI shows "Float unavailable" in that case rather
 * than falling back to outstanding (the current bug).
 */
export interface SharesFloatResult {
  floatShares: number | null
  outstandingShares: number | null
  freeFloatPercent: number | null
}

/**
 * Per-symbol response from FMP's /stable/profile endpoint, narrowed to the
 * fields FugaEdge persists.
 *
 * v0.2.3 Stage 1 introduced this call for `country` (real domicile — ISO
 * 3166-1 alpha-2 — which Polygon's free tier omits for US-listed foreign
 * issuers). Stage 2 widens it to also carry market_cap, sector, and industry
 * from the SAME response (zero extra requests).
 *
 * TAXONOMY NOTE: FMP `sector` uses FMP's own bucket taxonomy ("Healthcare",
 * "Technology", "Industrials") with finer granularity in `industry`
 * ("Biotechnology", "Semiconductors"). This is NOT Polygon's SIC-description
 * text (e.g. "PHARMACEUTICAL PREPARATIONS"). Future sector/industry analytics
 * must expect FMP buckets, not SEC SIC strings.
 *
 * Every field is independently nullable — a symbol can have a country but a
 * null industry, etc. Empty strings / missing values normalize to null.
 */
export interface CompanyProfile {
  /** ISO 3166-1 alpha-2 uppercase, or null. The domicile. */
  country: string | null
  /** Market capitalization (numeric), or null. Via toNullableNumber. */
  marketCap: number | null
  /** FMP sector bucket ("Healthcare"), or null. NOT SIC text. */
  sector: string | null
  /** FMP industry ("Biotechnology"), finer than sector, or null. */
  industry: string | null
}
