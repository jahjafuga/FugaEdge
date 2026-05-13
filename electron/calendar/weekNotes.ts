import { openDatabase } from '../db/database'
import type { SaveWeekNotesInput, WeekNotesResult } from '@shared/calendar-types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function saveWeekNotes(input: SaveWeekNotesInput): WeekNotesResult {
  if (!DATE_RE.test(input.week_start)) {
    throw new Error(`Invalid week_start: ${input.week_start}`)
  }
  const text = (input.text ?? '').trim()
  const db = openDatabase()
  if (text === '') {
    db.prepare('DELETE FROM week_notes WHERE week_start = ?').run(input.week_start)
    return { week_start: input.week_start, text: '' }
  }
  db.prepare(`
    INSERT INTO week_notes (week_start, text, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(week_start) DO UPDATE SET
      text = excluded.text,
      updated_at = excluded.updated_at
  `).run(input.week_start, text)
  return { week_start: input.week_start, text }
}
