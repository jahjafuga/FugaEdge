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
  /** Persisted account_size — null/0 ⇒ "never configured". */
  accountSize: number | null | undefined
  /** True when the localStorage onboarding-complete flag is set. */
  flagSet: boolean
  /** True when the user explicitly clicked "Restart onboarding" — forces
   *  the modal regardless of the auto-trigger heuristics. */
  forceRestart?: boolean
}

/** Auto-trigger: ALL three conditions per the spec must hold —
 *   - no trades imported
 *   - account_size null or 0
 *   - localStorage flag not set
 *  PLUS: a manual "force restart" token short-circuits the heuristic so
 *  the user can replay the flow from Settings without wiping their data. */
export function shouldShowOnboarding(opts: ShouldShowInputs): boolean {
  if (opts.forceRestart) return true
  if (opts.flagSet) return false
  if (opts.tradeCount > 0) return false
  const acct = opts.accountSize ?? 0
  if (acct > 0) return false
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
