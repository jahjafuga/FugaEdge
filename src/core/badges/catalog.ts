// v0.2.5 Phase B Session 6 (spec §E; R2/R3, D27) — the code-defined badge
// catalog and the preset → named-challenge-badge mapping. PURE module: holds
// catalog DATA + the mapping only. The `icon` field is a lucide icon NAME
// (string), not a component — core stays UI-free (the iteration-4 icons.ts
// precedent); the wall maps the name to a lucide component.
//
// SCOPE (R3): this module DEFINES the full v1 catalog incl. the ledger
// thresholds that *would* earn each tiered/milestone badge. The only award
// path wired this session is challenge-badge minting (engine.ts, via
// challengeBadgeId). Threshold auto-minting (Journaler at 50 sessions, etc.)
// is DEFERRED to its own later beat (recorded in D27 + the phase plan) — the
// wall shows those badges LOCKED until that arc lands.

import type { BadgeTier } from '@shared/identity-types'

export interface BadgeGrade {
  /** copper/silver/gold for tiered badges; null for single-grade badges. */
  tier: BadgeTier | null
  /** Ledger count that earns this grade (display hint + future minting). 0
   *  for condition/challenge badges whose earning isn't a simple count. */
  threshold: number
}

export interface BadgeDef {
  /** Catalog id — the badge_id stored in badge_awards. */
  id: string
  name: string
  /** Lucide icon NAME (string). The wall resolves it to a component. */
  icon: string
  /** What the threshold counts, for the locked hint ("12 / 50 sessions"). */
  unit: string
  description: string
  category: 'process' | 'milestone' | 'challenge'
  grades: BadgeGrade[]
}

const TIERS = (a: number, b: number, c: number): BadgeGrade[] => [
  { tier: 'copper', threshold: a },
  { tier: 'silver', threshold: b },
  { tier: 'gold', threshold: c },
]
const SINGLE: BadgeGrade[] = [{ tier: null, threshold: 0 }]
const AT = (level: number): BadgeGrade[] => [{ tier: null, threshold: level }]

export const BADGE_CATALOG: readonly BadgeDef[] = [
  // ── Process (tiered: copper/silver/gold) ──
  { id: 'journaler', name: 'Journaler', icon: 'BookOpen', unit: 'sessions', category: 'process',
    description: 'Sessions journaled.', grades: TIERS(10, 50, 250) },
  { id: 'streak', name: 'Streak', icon: 'Flame', unit: 'days', category: 'process',
    description: 'Consecutive journaled days.', grades: TIERS(7, 30, 100) },
  { id: 'reviewer', name: 'Reviewer', icon: 'CalendarCheck', unit: 'weekly reviews', category: 'process',
    description: 'Weekly reviews completed.', grades: TIERS(4, 20, 52) },
  { id: 'aligned', name: 'Aligned', icon: 'Target', unit: 'disciplined entries', category: 'process',
    description: 'Disciplined entries logged.', grades: TIERS(10, 50, 200) },
  { id: 'historian', name: 'Historian', icon: 'Archive', unit: 'archive sessions', category: 'process',
    description: 'Historical sessions imported.', grades: TIERS(30, 100, 250) },
  // ── Process (single-grade conditions) ──
  { id: 'locked-in', name: 'Locked In', icon: 'Lock', unit: '', category: 'process',
    description: '≥80% disciplined entries over a 20-session window.', grades: SINGLE },
  { id: 'sharpening', name: 'Sharpening', icon: 'TrendingUp', unit: '', category: 'process',
    description: 'Month-over-month discipline up +10 points.', grades: SINGLE },
  // ── Level milestones (5 marks) ──
  { id: 'level-10', name: 'Level 10', icon: 'Star', unit: 'level', category: 'milestone',
    description: 'Reach level 10.', grades: AT(10) },
  { id: 'level-25', name: 'Level 25', icon: 'Star', unit: 'level', category: 'milestone',
    description: 'Reach level 25.', grades: AT(25) },
  { id: 'level-50', name: 'Level 50', icon: 'Star', unit: 'level', category: 'milestone',
    description: 'Reach level 50.', grades: AT(50) },
  { id: 'level-75', name: 'Level 75', icon: 'Star', unit: 'level', category: 'milestone',
    description: 'Reach level 75.', grades: AT(75) },
  { id: 'level-99', name: 'Level 99', icon: 'Crown', unit: 'level', category: 'milestone',
    description: 'Reach the level cap.', grades: AT(99) },
  // ── Challenge badges (named per preset + a generic for custom). Untiered;
  //    minted at challenge completion via challengeBadgeId (R2). ──
  { id: 'challenge-journal-30', name: 'Journal 30 Days', icon: 'BookOpen', unit: '', category: 'challenge',
    description: 'Completed the Journal 30 Days challenge.', grades: SINGLE },
  { id: 'challenge-annotation-century', name: 'Annotation Century', icon: 'PenLine', unit: '', category: 'challenge',
    description: 'Completed the Annotation Century challenge.', grades: SINGLE },
  { id: 'challenge-discipline-week', name: 'Discipline Week', icon: 'Target', unit: '', category: 'challenge',
    description: 'Completed the Discipline Week challenge.', grades: SINGLE },
  { id: 'challenge-review-ritual', name: 'Review Ritual', icon: 'Repeat', unit: '', category: 'challenge',
    description: 'Completed the Review Ritual challenge.', grades: SINGLE },
  { id: 'challenge-grow-base', name: 'Grow the Base', icon: 'TrendingUp', unit: '', category: 'challenge',
    description: 'Completed the Grow the Base equity challenge.', grades: SINGLE },
  { id: 'challenge-million', name: 'Make a Million', icon: 'Trophy', unit: '', category: 'challenge',
    description: 'Completed the Make a Million equity challenge.', grades: SINGLE },
  { id: 'challenge-complete', name: 'Challenge Complete', icon: 'Award', unit: '', category: 'challenge',
    description: 'Completed a custom challenge.', grades: SINGLE },
]

const BY_ID: ReadonlyMap<string, BadgeDef> = new Map(
  BADGE_CATALOG.map((b) => [b.id, b]),
)

export function badgeById(id: string): BadgeDef | undefined {
  return BY_ID.get(id)
}

// Preset id → its named challenge badge (R2). A custom / diverged goal carries
// preset_id null and mints the single generic badge. NEVER 'goal:'+ulid again.
const PRESET_BADGE: Readonly<Record<string, string>> = {
  'journal-30': 'challenge-journal-30',
  'annotation-century': 'challenge-annotation-century',
  'discipline-week': 'challenge-discipline-week',
  'review-ritual': 'challenge-review-ritual',
  'equity-grow-base': 'challenge-grow-base',
  'equity-million': 'challenge-million',
}

/** The catalog badge id a completed goal mints, from its preset_id (R2). */
export function challengeBadgeId(presetId: string | null | undefined): string {
  return (presetId && PRESET_BADGE[presetId]) || 'challenge-complete'
}
