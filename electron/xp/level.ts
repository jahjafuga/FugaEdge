// v0.2.5 — the DISPLAYED level: raw curve level with the never-demote floor
// applied (seed on first read, raise monotonically). Extracted so xpSummaryGet
// AND the badge minter read the SAME floored level. Milestone badges MUST use
// this, never raw levelForXp, so a floor-held user qualifies for the badge they
// actually see. The floor seed/bump is monotonic + idempotent (identical to what
// xpSummaryGet has always done on every read); it is NOT an XP write.

import { levelProgress } from '@/core/xp/curve'
import { displayProgress } from '@/core/xp/floor'
import { getLevelFloor, getXpTotal, setLevelFloor } from './repo'

export interface DisplayedLevel {
  totalXp: number
  level: number
  intoLevel: number
  neededForNext: number
}

export function displayedLevel(): DisplayedLevel {
  const totalXp = getXpTotal()
  const raw = levelProgress(totalXp)
  let floor = getLevelFloor()
  if (floor == null || raw.level > floor) {
    floor = raw.level
    setLevelFloor(floor)
  }
  const { level, intoLevel, neededForNext } = displayProgress(raw, floor)
  return { totalXp, level, intoLevel, neededForNext }
}
