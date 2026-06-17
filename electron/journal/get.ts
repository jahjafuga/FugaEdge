import { openDatabase } from '../db/database'
import { SCRATCH_EPSILON } from '@shared/trade-classification'
import { sqlIsWin, sqlIsLoss } from '@/core/classify/outcome'
import type {
  JournalDay,
  JournalDaySummary,
  JournalEntry,
} from '@shared/journal-types'

interface JournalRow {
  date: string
  premarket_notes: string
  postsession_notes: string
  emotion_rating: number | null
  rules_followed: string
  rule_violations: string
  premarket_recording_duration: number | null
  postsession_recording_duration: number | null
}

interface DaySummaryRow {
  trade_count: number
  net_pnl: number
  gross_pnl: number
  total_fees: number
  winners: number
  losers: number
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  // Stored as JSON; fall back to comma-split if a hand-edited DB has CSV.
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed)
      if (Array.isArray(arr)) return arr.map((s) => String(s)).filter(Boolean)
    } catch {
      // fall through
    }
  }
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
}

function readRules(db: ReturnType<typeof openDatabase>): string[] {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'journal_rules'")
    .get() as { value: string } | undefined
  return parseStringArray(row?.value)
}

function readEntry(
  db: ReturnType<typeof openDatabase>,
  date: string,
): JournalEntry | null {
  const row = db
    .prepare(`
      SELECT date, premarket_notes, postsession_notes, emotion_rating,
             rules_followed, rule_violations,
             premarket_recording_duration, postsession_recording_duration
      FROM journal WHERE date = ?
    `)
    .get(date) as JournalRow | undefined
  if (!row) return null
  return {
    premarket_notes: row.premarket_notes ?? '',
    postsession_notes: row.postsession_notes ?? '',
    emotion_rating: row.emotion_rating ?? null,
    rules_followed: parseStringArray(row.rules_followed),
    rule_violations: parseStringArray(row.rule_violations),
    // NULL (no recording / pre-feature row) surfaces as undefined. Identity
    // passthrough now the type field matches the column name (snake_case).
    premarket_recording_duration: row.premarket_recording_duration ?? undefined,
    postsession_recording_duration: row.postsession_recording_duration ?? undefined,
  }
}

function readDaySummary(
  db: ReturnType<typeof openDatabase>,
  date: string,
): JournalDaySummary | null {
  const row = db
    .prepare(`
      SELECT
        COUNT(*)                                      AS trade_count,
        COALESCE(SUM(net_pnl), 0)                     AS net_pnl,
        COALESCE(SUM(gross_pnl), 0)                   AS gross_pnl,
        COALESCE(SUM(total_fees), 0)                  AS total_fees,
        SUM(CASE WHEN ${sqlIsWin()} THEN 1 ELSE 0 END)  AS winners,
        SUM(CASE WHEN ${sqlIsLoss()} THEN 1 ELSE 0 END)  AS losers
      FROM trades WHERE date = ? AND deleted_at IS NULL
    `)
    // Win/loss CASE `?` precede `date = ?`, so the epsilons bind first
    // (losers: negated epsilon, sqlIsLoss is `< ?`).
    .get(SCRATCH_EPSILON, -SCRATCH_EPSILON, date) as DaySummaryRow | undefined
  if (!row || row.trade_count === 0) return null
  return {
    trade_count: row.trade_count,
    net_pnl: row.net_pnl,
    gross_pnl: row.gross_pnl,
    total_fees: row.total_fees,
    winners: row.winners ?? 0,
    losers: row.losers ?? 0,
  }
}

function readSentiment(
  db: ReturnType<typeof openDatabase>,
  date: string,
): number | null {
  const row = db
    .prepare('SELECT sentiment FROM session_meta WHERE date = ?')
    .get(date) as { sentiment: number | null } | undefined
  return row?.sentiment ?? null
}

export function getJournalDay(date: string): JournalDay {
  const db = openDatabase()
  return {
    date,
    entry: readEntry(db, date),
    summary: readDaySummary(db, date),
    rules: readRules(db),
    sentiment: readSentiment(db, date),
  }
}
