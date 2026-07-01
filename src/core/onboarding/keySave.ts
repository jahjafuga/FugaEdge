import { isPlausibleApiKey } from './state'

/** The onboarding key step persists at most these two settings keys, and only
 *  when the pasted value is plausible. A subset of the settings payload, kept
 *  local so this stays a pure, portable decision (no shared-types import). */
export interface OnboardingKeySave {
  polygon_api_key?: string
  fmp_api_key?: string
}

/** Build the save payload from the onboarding key step's two raw inputs.
 *  Includes a key ONLY when it passes the plausibility gate, trimmed. Both
 *  implausible -> {} (nothing to save; the user should Skip instead). Massive is
 *  stored under polygon_api_key (the legacy column for the rebranded provider).
 *
 *  This is the case the shared ApiKeyEntry cannot express: its single save is
 *  gated on the Massive key, so an FMP-only submission is impossible there. */
export function buildOnboardingKeySave(massive: string, fmp: string): OnboardingKeySave {
  const out: OnboardingKeySave = {}
  if (isPlausibleApiKey(massive)) out.polygon_api_key = massive.trim()
  if (isPlausibleApiKey(fmp)) out.fmp_api_key = fmp.trim()
  return out
}
