// Pure decisions for the onboarding flow. Inputs come from the renderer's
// IPC fetches; the side effects (settings save, playbook seed, flag flip)
// happen at the call site.

import {
  DEFAULT_ACCOUNT_SIZE,
  DEFAULT_MAX_DAILY_LOSS,
  type OnboardingState,
} from './types'

export interface ShouldShowInputs {
  /** Total trades in the DB (any state). */
  tradeCount: number
  /** L24 — true when an account_size ROW exists in settings (raw stored-key
   *  existence via SettingsPayload.stored_keys). The DEFAULTED value is
   *  useless here: the settings repo fills 25,000 on a fresh DB, so a value
   *  check suppressed onboarding on every fresh install. */
  accountSizeStored: boolean
  /** True when the localStorage onboarding-complete flag is set. */
  flagSet: boolean
  /** True when the user explicitly clicked "Restart onboarding" — forces
   *  the modal regardless of the auto-trigger heuristics. */
  forceRestart?: boolean
}

/** Auto-trigger: ALL three conditions per the spec must hold —
 *   - no trades imported
 *   - no account_size row ever stored (L24: raw key, never the defaulted value)
 *   - localStorage flag not set
 *  PLUS: a manual "force restart" token short-circuits the heuristic so
 *  the user can replay the flow from Settings without wiping their data. */
export function shouldShowOnboarding(opts: ShouldShowInputs): boolean {
  if (opts.forceRestart) return true
  if (opts.flagSet) return false
  if (opts.tradeCount > 0) return false
  if (opts.accountSizeStored) return false
  return true
}

export function emptyOnboardingState(): OnboardingState {
  return {
    step: 0,
    accountSize: DEFAULT_ACCOUNT_SIZE,
    maxDailyLoss: DEFAULT_MAX_DAILY_LOSS,
    style: null,
  }
}

/** Clamp / sanitize numeric input to non-negative. Empty / NaN → 0 so the
 *  caller can swap to the default elsewhere. */
export function cleanAmount(raw: number | string | null | undefined): number {
  if (raw == null) return 0
  const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/** Plausibility check for a Massive API key. Lenient by design — real
 *  validation happens against the service in a later step. Guards the UX
 *  against obviously-empty or pasted-wrong submissions. */
export function isPlausibleApiKey(s: string): boolean {
  const trimmed = s.trim()
  if (trimmed.length < 16) return false
  return /^[A-Za-z0-9_-]+$/.test(trimmed)
}
