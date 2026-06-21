// Shared near-zero-base ratio guard. A ratio is meaningless when its base is
// near zero: a period that netted -$10 makes any "% change vs it" explode
// (+547%), and a $50 cumulative-P&L peak makes a $90 drawdown read "-180%".
// Each caller passes its own baseFloor (a $ amount below which the base is too
// small to compare against). Pure — no electron/DB/React.

/** Default $-base floor below which a ratio against it is treated as noise. */
export const DEFAULT_BASE_FLOOR = 50

/** numerator / |base|, or null when |base| < baseFloor (the base is too small
 *  for the ratio to mean anything). The shared base-floor primitive used by
 *  both the comparison-insight relative-changes and the drawdown %. */
export function safeRatio(
  numerator: number,
  base: number,
  opts: { baseFloor?: number } = {},
): number | null {
  const floor = opts.baseFloor ?? DEFAULT_BASE_FLOOR
  if (Math.abs(base) < floor) return null
  return numerator / Math.abs(base)
}

/** Relative change (curr - prior) / |prior|, floored on |prior| via safeRatio.
 *  Null when the prior base is too small to compare against. */
export function relativeChange(
  curr: number,
  prior: number,
  opts: { baseFloor?: number } = {},
): number | null {
  return safeRatio(curr - prior, prior, opts)
}
