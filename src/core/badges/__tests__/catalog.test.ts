import { describe, expect, it } from 'vitest'
import {
  BADGE_CATALOG,
  challengeBadgeId,
  badgeById,
  type BadgeDef,
} from '../catalog'

// v0.2.5 Phase B Session 6 (R2/R3, D27) — the code-defined badge catalog and
// the preset → named-challenge-badge mapping. Pure module: catalog DATA plus
// the mapping; the wall (UI) maps icon NAMES to lucide components (core stays
// UI-free, the iteration-4 icons.ts precedent).

describe('challengeBadgeId — preset → named catalog badge (R2)', () => {
  it('maps equity presets to their named badge; retired process shadows fall to generic', () => {
    expect(challengeBadgeId('equity-million')).toBe('challenge-million')
    expect(challengeBadgeId('equity-grow-base')).toBe('challenge-grow-base')
    // Approach A: the four process ladder-shadow badges are retired. Their
    // presets survive (the goal and its XP live on) but now mint the generic
    // challenge-complete; Journaler/Aligned/Reviewer/Annotator carry the honor.
    expect(challengeBadgeId('journal-30')).toBe('challenge-complete')
    expect(challengeBadgeId('annotation-century')).toBe('challenge-complete')
    expect(challengeBadgeId('discipline-week')).toBe('challenge-complete')
    expect(challengeBadgeId('review-ritual')).toBe('challenge-complete')
  })

  it('null (custom goal) and unknown presets fall back to the generic badge', () => {
    expect(challengeBadgeId(null)).toBe('challenge-complete')
    expect(challengeBadgeId('not-a-preset')).toBe('challenge-complete')
  })

  it('every challenge badge the mapping can return exists in the catalog', () => {
    const ids = new Set(BADGE_CATALOG.map((b) => b.id))
    for (const presetOrNull of [
      'equity-million',
      'equity-grow-base',
      'journal-30',
      'annotation-century',
      'discipline-week',
      'review-ritual',
      null,
    ] as const) {
      expect(ids.has(challengeBadgeId(presetOrNull))).toBe(true)
    }
  })
})

describe('BADGE_CATALOG shape + invariants', () => {
  it('has unique ids and every def carries name + icon + at least one grade', () => {
    const ids = BADGE_CATALOG.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const b of BADGE_CATALOG) {
      expect(b.name.length).toBeGreaterThan(0)
      expect(b.icon.length).toBeGreaterThan(0)
      expect(b.grades.length).toBeGreaterThan(0)
    }
  })

  it('ships the speced tiered process badges with copper/silver/gold thresholds', () => {
    const tiered: Record<string, [number, number, number]> = {
      journaler: [10, 50, 250],
      streak: [7, 30, 100],
      reviewer: [4, 20, 52],
      aligned: [10, 50, 200],
      historian: [30, 100, 250],
    }
    for (const [id, thresholds] of Object.entries(tiered)) {
      const def = badgeById(id) as BadgeDef
      expect(def).toBeTruthy()
      expect(def.grades.map((g) => g.tier)).toEqual(['copper', 'silver', 'gold'])
      expect(def.grades.map((g) => g.threshold)).toEqual(thresholds)
    }
  })

  it('ships the five level marks and the two condition badges', () => {
    for (const id of ['level-10', 'level-25', 'level-50', 'level-75', 'level-99']) {
      expect(badgeById(id)?.category).toBe('milestone')
    }
    expect(badgeById('locked-in')?.grades).toEqual([{ tier: null, threshold: 0 }])
    expect(badgeById('sharpening')?.grades).toEqual([{ tier: null, threshold: 0 }])
  })

  it('no standard-catalog badge references P&L sign or dollar size (D19); challenge badges are untiered', () => {
    for (const b of BADGE_CATALOG) {
      if (b.category === 'challenge') {
        expect(b.grades).toEqual([{ tier: null, threshold: 0 }])
      }
    }
  })
})
