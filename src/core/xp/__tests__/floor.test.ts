import { describe, expect, it } from 'vitest'
import { applyLevelFloor, displayProgress } from '../floor'

// v0.2.5 — the never-demote level floor. Pure rule: the displayed level is
// max(storedFloor ?? raw, raw); a user is "held" when a stored floor sits above
// their XP-computed level (only possible after a future curve change). Held ->
// the progress bar reads full (0/0). No electron/db here (ARCHITECTURE #1).

describe('applyLevelFloor', () => {
  it('seed case: a null floor passes the raw level through, not held', () => {
    expect(applyLevelFloor(9, null)).toEqual({ displayLevel: 9, heldAboveXp: false })
  })

  it('normal case: floor equal to raw is a passthrough, not held', () => {
    expect(applyLevelFloor(9, 9)).toEqual({ displayLevel: 9, heldAboveXp: false })
  })

  it('rising case: raw above floor displays raw, not held (caller bumps the floor)', () => {
    expect(applyLevelFloor(10, 9)).toEqual({ displayLevel: 10, heldAboveXp: false })
  })

  it('held case: a floor above raw holds the level and flags held', () => {
    expect(applyLevelFloor(7, 9)).toEqual({ displayLevel: 9, heldAboveXp: true })
  })
})

describe('displayProgress', () => {
  const raw = { level: 9, intoLevel: 41, neededForNext: 231 }

  it('non-held: passes level + progress through unchanged', () => {
    expect(displayProgress(raw, 9)).toEqual({
      level: 9,
      intoLevel: 41,
      neededForNext: 231,
    })
  })

  it('non-held with a null floor (seed): passthrough', () => {
    expect(displayProgress(raw, null)).toEqual({
      level: 9,
      intoLevel: 41,
      neededForNext: 231,
    })
  })

  it('held: shows the floored level with a full/held bar (0/0)', () => {
    const heldRaw = { level: 7, intoLevel: 50, neededForNext: 100 }
    expect(displayProgress(heldRaw, 9)).toEqual({
      level: 9,
      intoLevel: 0,
      neededForNext: 0,
    })
  })
})
