// v0.2.5 Phase A — shared types for the append-only XP ledger (spec §A2/§A3).
// Event names are EXACTLY the spec §A2 award table (post-D19: equity goals
// award zero XP, so there is no goal_milestone type). NO event type may ever
// reference P&L sign, trade count, position size, or dollar/equity targets.
//
// EXCEPTION (2026-07-01, by founder decision): the 'maxloss_respected'
// discipline award reads a day's realized net P&L to check a self-set daily
// loss limit. This is the single, contained §A2 exception (staying within a
// self-set limit is a controllable process act, not a P&L outcome). It lives
// entirely in electron/xp/pnl-facts.ts; facts.ts and every other award remain
// P&L-blind, and the facts.ts allowlist guard is untouched.

export type XpEventType =
  | 'session_journaled'
  | 'session_journaled_archive'
  | 'trade_fully_annotated'
  | 'disciplined_entry'
  | 'daily_streak_bonus'
  | 'weekly_review_completed'
  | 'goal_completed' // process goals only (D19)
  | 'maxloss_respected' // §A2 exception (see the header note)

/** A persisted ledger row. */
export interface XpEvent {
  id: string // ULID — lexicographic order matches insert order
  event_type: XpEventType
  source_ref: string | null
  xp: number
  /** D13 key formats, e.g. session:{date}, annotate:{trade_key}. The UNIQUE
   *  constraint on this column IS the dedup mechanism (D12). */
  idempotency_key: string
  created_at: string // ISO UTC
}

/** An award the engine wants to record. The repo mints id/created_at and
 *  INSERT OR IGNOREs on idempotency_key, so replaying intents is free. */
export interface XpAwardIntent {
  event_type: XpEventType
  source_ref?: string | null
  xp: number
  idempotency_key: string
}

// ── Weekly-review channel results (Phase A Session 3, D5/L15) ─────────────

export interface WeeklyReviewCompleteResult {
  completed: boolean
  /** true when this call inserted the event; false when the week was
   *  already complete (idempotent repeat). Absent on rejection. */
  awarded?: boolean
  /** Set when completed is false — the Sunday-guard rejection message. */
  error?: string
}

export interface WeeklyReviewStatus {
  completed: boolean
}

// ── Profile-page read model (Phase B Session 4, L20) ──────────────────────

export interface XpSummary {
  totalXp: number
  level: number
  intoLevel: number
  neededForNext: number
  /** Ledger-derived journaling streak (streak:{date} keys — L19/D24). */
  currentStreak: number
  longestStreak: number
  freezesBanked: number
}
