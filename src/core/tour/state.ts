// Trigger predicate for the product tour. Mirrors the onboarding pattern:
// an auto-trigger (flag absent) plus a force-restart override the Settings
// page can flip.

export interface ShouldShowTourInputs {
  /** True when the localStorage tour-complete flag is set. */
  flagSet: boolean
  /** True when the user just clicked "Restart tour" in Settings. */
  forceRestart: boolean
}

export function shouldShowTour(opts: ShouldShowTourInputs): boolean {
  if (opts.forceRestart) return true
  return !opts.flagSet
}
