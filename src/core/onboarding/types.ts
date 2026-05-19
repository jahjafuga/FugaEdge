// Pure types for the first-time-user onboarding flow. Web-portable per
// /ARCHITECTURE.md — no electron / fs / sqlite imports.

export type TradingStyle = 'small-cap' | 'large-cap' | 'mixed'

export interface OnboardingState {
  /** Step index 0..3 — Welcome / Account / Style / Import. */
  step: number
  /** Account size in dollars. Defaults to $1,000 so a "skip" path still
   *  writes a non-zero value (signals onboarding ran). */
  accountSize: number
  /** Max daily loss alert in dollars. Defaults to $20. */
  maxDailyLoss: number
  /** Trading style; null until user picks one. */
  style: TradingStyle | null
}

export const ONBOARDING_FLAG_KEY = 'fugaedge-onboarding-complete'
/** Set by the "Restart onboarding" button in Settings — forces the modal
 *  to show on next mount regardless of trade-count / account-size. Cleared
 *  on next completion. */
export const ONBOARDING_FORCE_KEY = 'fugaedge-onboarding-force'
export const DEFAULT_ACCOUNT_SIZE = 1000
export const DEFAULT_MAX_DAILY_LOSS = 20
export const ONBOARDING_STEPS = ['welcome', 'account', 'style', 'import', 'api-key'] as const
export type OnboardingStepName = (typeof ONBOARDING_STEPS)[number]
