// v0.2.5 Phase A Session 2 — level curve (spec §A1). Pure math, zero imports.
//
// totalXp(L) = 11·(L−1)², an arithmetic ramp: level L costs 11·(2L−3), +22
// over the previous level. levelForXp inverts it, clamped to LEVEL_CAP. This
// gentle quadratic (was 16·(L−1)²) runs ~31% faster: level 10 ≈ 2 weeks, level
// 99 ≈ 3.6 years for a dedicated daily user. totalXp(L) is an exact integer and
// xp/11 recovers the perfect square (L−1)² exactly (correctly-rounded division),
// so sqrt(xp/11) stays exact in IEEE-754 at every threshold — no epsilon games
// at level boundaries. NOTE: both functions must share the same coefficient (11)
// or the inverse breaks; the curve.test.ts inverse-property loop guards this.

export const LEVEL_CAP = 99

export function totalXpForLevel(level: number): number {
  return 11 * (level - 1) ** 2
}

export function levelForXp(xp: number): number {
  return Math.min(LEVEL_CAP, Math.floor(1 + Math.sqrt(xp / 11)))
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
