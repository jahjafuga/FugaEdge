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
