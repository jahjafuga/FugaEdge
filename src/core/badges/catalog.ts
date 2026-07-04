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
  // ── Process execution ladders (Arc 1 Beat 1) — process-framed, no $ amounts ──
  { id: 'green_days', name: 'Green Days', icon: 'CalendarDays', unit: 'profitable days', category: 'process',
    description: 'Profitable trading days.', grades: TIERS(5, 25, 100) },
  { id: 'winners', name: 'Winners', icon: 'TrendingUp', unit: 'winning trades', category: 'process',
    description: 'Winning trades.', grades: TIERS(25, 100, 500) },
  { id: 'risk_respected', name: 'Risk Respected', icon: 'ShieldCheck', unit: 'days within max-loss', category: 'process',
    description: 'Days you stayed within your max-loss limit.', grades: TIERS(10, 50, 200) },
  { id: 'low_float_hunter', name: 'Low-Float Hunter', icon: 'Crosshair', unit: 'low-float trades', category: 'process',
    description: 'Trades on sub-20M-float runners.', grades: TIERS(25, 100, 400) },
  { id: 'green_streak', name: 'Green Streak', icon: 'Zap', unit: 'day streak', category: 'process',
    description: 'Consecutive profitable days.', grades: TIERS(3, 7, 15) },
  { id: 'annotator', name: 'Annotator', icon: 'PenLine', unit: 'annotated trades', category: 'process',
    description: 'Fully annotated trades.', grades: TIERS(100, 500, 2000) },
  // ── Process (single-grade conditions) ──
  { id: 'locked-in', name: 'Locked In', icon: 'Lock', unit: '', category: 'process',
    description: '≥80% disciplined entries over a 20-session window.', grades: SINGLE },
  { id: 'sharpening', name: 'Sharpening', icon: 'TrendingUp', unit: '', category: 'process',
    description: 'Month-over-month discipline up +10 points.', grades: SINGLE },
  // ── Money milestones (Arc 3 Beat 1) — the profit-peak ladder. Gold
  //    single grades (untiered rungs, gold by declaration); the peak is the
  //    high-water mark of cumulative earned P&L over non-sim, non-deleted
  //    trades — earned at peak, never un-earned by drawdown. XP-FENCED by
  //    construction: minting is display-only (electron/badges/mint.ts). ──
  { id: 'money-100', name: 'First $100', icon: 'DollarSign', unit: 'peak profit ($)', category: 'milestone',
    description: 'Peak trading profit reached $100.', grades: [{ tier: 'gold', threshold: 100 }] },
  { id: 'money-1k', name: '$1K Club', icon: 'Coins', unit: 'peak profit ($)', category: 'milestone',
    description: 'Peak trading profit reached $1,000.', grades: [{ tier: 'gold', threshold: 1_000 }] },
  { id: 'money-10k', name: '$10K Club', icon: 'Gem', unit: 'peak profit ($)', category: 'milestone',
    description: 'Peak trading profit reached $10,000.', grades: [{ tier: 'gold', threshold: 10_000 }] },
  { id: 'money-100k', name: '$100K Club', icon: 'Landmark', unit: 'peak profit ($)', category: 'milestone',
    description: 'Peak trading profit reached $100,000.', grades: [{ tier: 'gold', threshold: 100_000 }] },
  { id: 'money-1m', name: '$1M Club', icon: 'Medal', unit: 'peak profit ($)', category: 'milestone',
    description: 'Peak trading profit reached $1,000,000.', grades: [{ tier: 'gold', threshold: 1_000_000 }] },
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
  // ── Challenge badges — the two EQUITY challenges + a generic for custom.
  //    Untiered; minted at completion via challengeBadgeId (R2). The four
  //    process ladder-shadows (journal-30 / annotation-century / discipline-week
  //    / review-ritual) were RETIRED (Approach A): their presets survive but now
  //    mint the generic challenge-complete; the Journaler / Aligned / Reviewer /
  //    Annotator ladders carry those accomplishments. ──
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

// Preset id → its named challenge badge (R2). Only the EQUITY presets keep a
// named badge; the four process presets were retired (Approach A) and fall
// through to the generic challenge-complete, as does a custom / diverged goal
// (preset_id null). NEVER 'goal:'+ulid again.
const PRESET_BADGE: Readonly<Record<string, string>> = {
  'equity-grow-base': 'challenge-grow-base',
  'equity-million': 'challenge-million',
}

/** The catalog badge id a completed goal mints, from its preset_id (R2). */
export function challengeBadgeId(presetId: string | null | undefined): string {
  return (presetId && PRESET_BADGE[presetId]) || 'challenge-complete'
}
