import { openDatabase } from '../db/database'
import type { SaveTodaySessionInput, SessionMeta } from '@shared/session-types'

interface SessionMetaDb {
  date: string
  sentiment: number | null
  notes: string
  no_trade_day: number
  no_trade_reason: string
}

function rowToMeta(r: SessionMetaDb): SessionMeta {
  return {
    date: r.date,
    sentiment: r.sentiment,
    notes: r.notes,
    no_trade_day: !!r.no_trade_day,
    no_trade_reason: r.no_trade_reason,
  }
}

// Clamp + sanitize sentiment to the 1..5 range or null. Anything outside
// the range (or NaN) is treated as null so a bad payload can't poison the
// column.
function cleanSentiment(raw: number | null | undefined): number | null {
  if (raw == null) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const i = Math.round(n)
  if (i < 1 || i > 5) return null
  return i
}

const SELECT_ALL = `
  SELECT date, sentiment, notes, no_trade_day, no_trade_reason
  FROM session_meta
`

export function getSessionMeta(date: string): SessionMeta | null {
  const db = openDatabase()
  const row = db
    .prepare(`${SELECT_ALL} WHERE date = ?`)
    .get(date) as SessionMetaDb | undefined
  return row ? rowToMeta(row) : null
}

// All session_meta rows — used by the Insights engine to build a
// date→sentiment map. Sorted by date desc.
export function listAllSessions(): SessionMeta[] {
  const db = openDatabase()
  const rows = db
    .prepare(`${SELECT_ALL} ORDER BY date DESC`)
    .all() as SessionMetaDb[]
  return rows.map(rowToMeta)
}

// Upsert the sentiment column only — notes / no_trade_* are preserved on
// update so the per-day journal write paths don't clobber each other.
export function saveSentiment(date: string, sentiment: number | null): SessionMeta {
  const db = openDatabase()
  const value = cleanSentiment(sentiment)
  db.prepare(`
    INSERT INTO session_meta (date, sentiment, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET
      sentiment  = excluded.sentiment,
      updated_at = excluded.updated_at
  `).run(date, value)
  return getSessionMeta(date) ?? {
    date,
    sentiment: value,
    notes: '',
    no_trade_day: false,
    no_trade_reason: '',
  }
}

// Combined save for the Today's Session card. Sentiment + no-trade-day +
// reason in one write. When `no_trade_day` is false we clear the reason
// so a flipped-off day doesn't keep stale copy hanging around.
export function saveTodaySession(input: SaveTodaySessionInput): SessionMeta {
  const db = openDatabase()
  const sentiment = cleanSentiment(input.sentiment)
  const noTradeDay = input.no_trade_day ? 1 : 0
  const reason = input.no_trade_day ? (input.no_trade_reason ?? '').trim() : ''
  db.prepare(`
    INSERT INTO session_meta (date, sentiment, no_trade_day, no_trade_reason, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET
      sentiment       = excluded.sentiment,
      no_trade_day    = excluded.no_trade_day,
      no_trade_reason = excluded.no_trade_reason,
      updated_at      = excluded.updated_at
  `).run(input.date, sentiment, noTradeDay, reason)
  return getSessionMeta(input.date) ?? {
    date: input.date,
    sentiment,
    notes: '',
    no_trade_day: !!noTradeDay,
    no_trade_reason: reason,
  }
}
