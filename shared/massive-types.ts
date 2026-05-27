/**
 * Result of testing a Massive API key.
 *
 * Discriminated union so the renderer can switch cleanly without try/catch.
 *
 * `valid`         — Massive accepted the key (HTTP 200).
 * `invalid`       — Massive rejected the key (HTTP 401 / 403): wrong,
 *                   deactivated, or unentitled.
 * `rate-limited`  — HTTP 429. Key is probably fine; couldn't verify right now.
 * `network-error` — Network failure before reaching Massive. Couldn't
 *                   verify; key state unknown.
 */
export type MassiveKeyStatus =
  | { kind: 'valid' }
  | { kind: 'invalid' }
  | { kind: 'rate-limited' }
  | { kind: 'network-error' }
