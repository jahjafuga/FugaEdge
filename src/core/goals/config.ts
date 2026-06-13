// v0.2.5 Phase B Session 5 — pure goal-config catalog, parsing, and
// validation (L25/L29/L33; spec §G, D19, D25). No electron, no DB.
//
// PROCESS METRICS ARE LEDGER COUNTS ONLY (L25): each metric maps to one
// xp_events event_type; progress is a COUNT of events with created_at >=
// goal.created_at. P&L-blind by construction — there is nothing here a
// dollar could even plug into. The config `window` field is RESERVED in
// the shape but not shipped in v1 (no deadlines, no auto-fail; D25).

import type { XpEventType } from '@shared/xp-types'
import type { GoalKind } from '@shared/identity-types'

export const PROCESS_METRICS = [
  'journaled_days',
  'weekly_reviews',
  'annotated_trades',
  'disciplined_entries',
] as const

export type ProcessMetric = (typeof PROCESS_METRICS)[number]

export const METRIC_EVENT_TYPE: Record<ProcessMetric, XpEventType> = {
  journaled_days: 'daily_streak_bonus',
  weekly_reviews: 'weekly_review_completed',
  annotated_trades: 'trade_fully_annotated',
  disciplined_entries: 'disciplined_entry',
}

export interface ProcessGoalConfig {
  metric: ProcessMetric
  target: number
  /** RESERVED (D25) — accepted in stored shapes, never written by v1 UI. */
  window?: string
}

export interface EquityGoalConfig {
  start_date: string // YYYY-MM-DD
  start_amount: number
  target_amount: number
}

export type ParsedGoalConfig =
  | { kind: 'process'; config: ProcessGoalConfig }
  | { kind: 'equity'; config: EquityGoalConfig }

// L33 (amended by founder ruling, 2026-06-13) — the create modal's preset
// chips. BOTH kinds now: four PROCESS presets plus two EQUITY presets. The
// earlier "process-only" stance is overturned — most users run equity
// challenges, and challenge badges already flow to equity per L27 (D19
// walls only XP, never the badge). Titles + meta live in the UI strings
// module; these are the pure config constants.
//
// Equity presets carry EITHER an absolute target (targetAmount) OR a delta
// added to the user's own starting amount (targetDelta) — mutually
// exclusive. The validators are UNCHANGED: the modal resolves a preset to
// concrete start/target amounts (start is ALWAYS user-entered) before
// validateCreateGoal ever sees it.
export interface ProcessPreset {
  id: string
  kind: 'process'
  metric: ProcessMetric
  target: number
}

export interface EquityPreset {
  id: string
  kind: 'equity'
  /** Absolute target ($). Mutually exclusive with targetDelta. */
  targetAmount?: number
  /** Relative target — resolved as start_amount + delta as the user types
   *  their starting amount. Mutually exclusive with targetAmount. */
  targetDelta?: number
}

export type GoalPreset = ProcessPreset | EquityPreset

export const GOAL_PRESETS: ReadonlyArray<GoalPreset> = [
  { id: 'journal-30', kind: 'process', metric: 'journaled_days', target: 30 },
  { id: 'annotation-century', kind: 'process', metric: 'annotated_trades', target: 100 },
  { id: 'discipline-week', kind: 'process', metric: 'disciplined_entries', target: 20 },
  { id: 'review-ritual', kind: 'process', metric: 'weekly_reviews', target: 4 },
  { id: 'equity-grow-base', kind: 'equity', targetDelta: 1000 },
  { id: 'equity-million', kind: 'equity', targetAmount: 1_000_000 },
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isProcessMetric(v: unknown): v is ProcessMetric {
  return typeof v === 'string' && (PROCESS_METRICS as readonly string[]).includes(v)
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

function validProcess(raw: Record<string, unknown>): ProcessGoalConfig | null {
  if (!isProcessMetric(raw.metric)) return null
  const target = raw.target
  if (typeof target !== 'number' || !Number.isInteger(target) || target < 1) {
    return null
  }
  return { metric: raw.metric, target }
}

function validEquity(raw: Record<string, unknown>): EquityGoalConfig | null {
  const { start_date, start_amount, target_amount } = raw
  if (typeof start_date !== 'string' || !DATE_RE.test(start_date)) return null
  if (typeof start_amount !== 'number' || !Number.isFinite(start_amount)) return null
  if (typeof target_amount !== 'number' || !Number.isFinite(target_amount)) return null
  if (target_amount <= start_amount) return null // v1: growth targets only
  return { start_date, start_amount, target_amount }
}

export type ValidateResult =
  | { ok: true; config_json: string }
  | { ok: false; error: string }

/** Create-side validation: returns the canonical config_json to persist. */
export function validateCreateGoal(input: {
  title: string
  kind: GoalKind
  config: unknown
}): ValidateResult {
  if (!input.title.trim()) return { ok: false, error: 'Title is required.' }
  const raw = asRecord(input.config)
  if (!raw) return { ok: false, error: 'Malformed goal config.' }

  if (input.kind === 'process') {
    const config = validProcess(raw)
    if (!config) {
      return { ok: false, error: 'Pick a metric and a whole-number target of at least 1.' }
    }
    return { ok: true, config_json: JSON.stringify(config) }
  }
  const config = validEquity(raw)
  if (!config) {
    return {
      ok: false,
      error: 'Equity goals need a start date and a target above the starting amount.',
    }
  }
  return { ok: true, config_json: JSON.stringify(config) }
}

/** Read-side parse: defensive null on malformed/invalid stored JSON — a
 *  corrupt row renders as "—" rather than crashing the page. */
export function parseGoalConfig(
  kind: GoalKind,
  configJson: string,
): ParsedGoalConfig | null {
  let raw: unknown
  try {
    raw = JSON.parse(configJson)
  } catch {
    return null
  }
  const rec = asRecord(raw)
  if (!rec) return null
  if (kind === 'process') {
    const config = validProcess(rec)
    return config ? { kind: 'process', config } : null
  }
  const config = validEquity(rec)
  return config ? { kind: 'equity', config } : null
}
