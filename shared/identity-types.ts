// v0.2.5 Phase A — shared types for the identity tables (spec §B), reused
// by the electron repos now and the renderer/IPC layer when Phase B ships
// the consuming features. Lives in shared/ per ARCHITECTURE.md rule #7.

// ── Profile (single row) ──────────────────────────────────────────────────

export interface Profile {
  id: string // ULID
  display_name: string | null
  handle: string | null
  /** Avatar as a data-URL, downscaled ≤256px renderer-side before save (D20). */
  avatar_data: string | null
  trading_style: string | null
  markets: string | null
  bio: string | null
  /** Featured badge ids (≤3) — parsed from featured_badges_json at the repo
   *  boundary, same idiom as trades.mistakes_json → mistakes. */
  featured_badges: string[]
  /** ISO date (YYYY-MM-DD). Seeded at first creation: MIN(date) over
   *  non-deleted trades when any exist, else today (L2). */
  member_since: string | null
  created_at: string | null
  updated_at: string | null
}

/** Editable profile fields — everything except id/created_at/updated_at,
 *  which the repo owns. Absent fields are left untouched. */
export interface UpdateProfileInput {
  display_name?: string | null
  handle?: string | null
  avatar_data?: string | null
  trading_style?: string | null
  markets?: string | null
  bio?: string | null
  featured_badges?: string[]
  member_since?: string | null
}

// ── Goals ─────────────────────────────────────────────────────────────────

export type GoalKind = 'equity' | 'process'
export type GoalStatus = 'active' | 'completed' | 'abandoned'

export interface Goal {
  id: string // ULID
  title: string
  kind: GoalKind
  /** Raw config JSON. equity: {start_date, start_amount, target_amount};
   *  process: {metric, target, window}. The Phase B goals engine owns the
   *  parse — the repo stores and returns it verbatim. */
  config_json: string
  status: GoalStatus
  created_at: string | null
  completed_at: string | null
}

export interface CreateGoalInput {
  title: string
  kind: GoalKind
  config_json: string
}

// ── Badge awards ──────────────────────────────────────────────────────────

export type BadgeTier = 'copper' | 'silver' | 'gold'

export interface BadgeAward {
  id: string // ULID
  badge_id: string
  /** NULL = untiered (user challenge badges). Dedup is on
   *  (badge_id, IFNULL(tier,'')) — see idx_badge_awards_identity. */
  tier: BadgeTier | null
  awarded_at: string
  source_ref: string | null
}

export interface AwardBadgeInput {
  badge_id: string
  tier: BadgeTier | null
  source_ref?: string | null
}
