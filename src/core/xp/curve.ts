// v0.2.5 Phase A Session 2 — level curve (spec §A1). Pure math, zero imports.
//
// totalXp(L) = 16·(L−1)², an arithmetic ramp: level L costs 16·(2L−3), +32
// over the previous level. levelForXp inverts it, clamped to LEVEL_CAP. The
// milestone inputs are all 16·k² so sqrt(xp/16) is exact in IEEE-754 at
// every threshold — no epsilon games needed at level boundaries.

export const LEVEL_CAP = 99

export function totalXpForLevel(level: number): number {
  return 16 * (level - 1) ** 2
}

export function levelForXp(xp: number): number {
  return Math.min(LEVEL_CAP, Math.floor(1 + Math.sqrt(xp / 16)))
}

export interface LevelProgress {
  level: number
  /** XP accumulated past the current level's threshold. */
  intoLevel: number
  /** XP still needed to reach the next level; 0 at LEVEL_CAP. */
  neededForNext: number
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp)
  const intoLevel = xp - totalXpForLevel(level)
  const neededForNext =
    level >= LEVEL_CAP ? 0 : totalXpForLevel(level + 1) - xp
  return { level, intoLevel, neededForNext }
}
