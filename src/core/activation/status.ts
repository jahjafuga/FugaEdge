// v0.2.5 §C / D2 — pure activation status decision table.
//
// The caller (AppLayout) feeds in real inputs and applies the result:
// renderer isPackaged comes from import.meta.env.PROD (A3), forceGate from
// the localStorage flag below (R2, onboarding-force precedent), key
// verification from verify.ts, tradeCount/graceStartedAt from the existing
// tradesList/settingsGet fetches. Pure module — no electron, no node, no IO.

export const GRACE_DAYS = 14

/** localStorage flag that ENABLES the gate in dev for testing (R2). Dev
 *  bypasses the gate by default; packaged builds always enforce. */
export const ACTIVATION_FORCE_KEY = 'fugaedge-activation-force'

export type ActivationMode = 'activated' | 'gate' | 'grace' | 'locked'

export interface ActivationStatusInput {
  /** Renderer-side: import.meta.env.PROD. Edge accepted (A3): an unpackaged
   *  production PREVIEW build enforces the gate — errs in the safe
   *  direction (gate shows where it strictly need not, never the reverse). */
  isPackaged: boolean
  forceGate: boolean
  hasVerifiedKey: boolean
  tradeCount: number
  /** settings.activation_grace_started_at — ISO string or null. */
  graceStartedAt: string | null
  /** ISO timestamp for "now" — injected so the table is fully testable. */
  now: string
}

export interface ActivationStatus {
  mode: ActivationMode
  /** Whole days of grace remaining; present only in 'grace' mode. */
  graceDaysLeft?: number
  /** True when the caller must persist `now` as the grace start (first
   *  graced boot, or healing an unparseable stamp). Stamping is idempotent:
   *  a valid existing stamp never asks again. */
  shouldStampGraceStart?: boolean
}

export function resolveActivationStatus(
  input: ActivationStatusInput,
): ActivationStatus {
  const enforced = input.isPackaged || input.forceGate
  if (!enforced) return { mode: 'activated' }
  if (input.hasVerifiedKey) return { mode: 'activated' }

  // No key. Fresh installs (zero trades) hit the gate AHEAD of onboarding;
  // a DB with existing trades gets the 14-day grace window — the gate gates
  // the app, never the data (§C).
  if (input.tradeCount === 0) return { mode: 'gate' }

  const startMs = input.graceStartedAt ? Date.parse(input.graceStartedAt) : NaN
  if (!Number.isFinite(startMs)) {
    // Never stamped — or a corrupt stamp, which heals by re-stamping.
    return {
      mode: 'grace',
      graceDaysLeft: GRACE_DAYS,
      shouldStampGraceStart: true,
    }
  }

  const nowMs = Date.parse(input.now)
  // Clock skew (stamp in the future) clamps to a full window rather than
  // going negative; no re-stamp — the existing stamp stays authoritative.
  const elapsedDays = Math.max(0, Math.floor((nowMs - startMs) / 86_400_000))
  const left = GRACE_DAYS - elapsedDays
  if (left > 0) return { mode: 'grace', graceDaysLeft: left }
  return { mode: 'locked' }
}
