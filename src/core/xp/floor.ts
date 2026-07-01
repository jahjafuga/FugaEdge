// v0.2.5 — the never-demote level floor (PURE rule; no electron/db imports).
//
// Level is COMPUTED from XP (curve.ts levelForXp); this rule layers a stored
// "highest level reached" floor on top so a FUTURE curve change can never
// demote a user. displayLevel = max(storedFloor ?? raw, raw). A user is "held"
// only when a stored floor sits ABOVE their XP-computed level — impossible
// under a fixed curve (raw only ever rises), so this is DORMANT until the curve
// changes. Held -> the progress bar reads full (0/0), since the user's XP is
// below the held level's threshold and any fraction would be negative. Storage
// + seeding/bumping live in the repo/handler (ARCHITECTURE #1/#2); this is pure.

import type { LevelProgress } from './curve'

export interface LevelFloor {
  /** The level to SHOW: never below the stored floor. */
  displayLevel: number
  /** True when the floor holds the user above their XP-computed level. */
  heldAboveXp: boolean
}

export function applyLevelFloor(
  rawLevel: number,
  storedFloor: number | null,
): LevelFloor {
  const floor = storedFloor ?? rawLevel
  return {
    displayLevel: Math.max(floor, rawLevel),
    heldAboveXp: storedFloor != null && storedFloor > rawLevel,
  }
}

export interface DisplayProgress {
  level: number
  intoLevel: number
  neededForNext: number
}

/** Apply the floor to a raw levelProgress result. Non-held -> passthrough;
 *  held -> the floored level with a full/"held" bar (intoLevel/neededForNext 0). */
export function displayProgress(
  raw: LevelProgress,
  storedFloor: number | null,
): DisplayProgress {
  const { displayLevel, heldAboveXp } = applyLevelFloor(raw.level, storedFloor)
  return {
    level: displayLevel,
    intoLevel: heldAboveXp ? 0 : raw.intoLevel,
    neededForNext: heldAboveXp ? 0 : raw.neededForNext,
  }
}
