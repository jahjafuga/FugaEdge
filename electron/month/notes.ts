import { openDatabase } from '../db/database'
import type { SaveMonthNotesInput, MonthNotesResult } from '@shared/calendar-types'

// The month's reflection, in its own table. The weekNotes.ts shape, on a month
// id -- same trim, same delete-when-emptied contract, same upsert.
//
// THE GUARD IS THE POINT. week_notes takes a YYYY-MM-DD and this takes a bare
// YYYY-MM: an id that slipped through in the wrong shape would key a row no
// reader would ever find again, and unlike a wrong DATE a wrong MONTH is not
// obviously wrong to look at. It refuses before any statement runs.
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function assertMonthId(monthId: string): void {
  if (!MONTH_RE.test(monthId)) {
    throw new Error(`Invalid month_id: ${monthId}`)
  }
}

export function getMonthNotes(monthId: string): string {
  assertMonthId(monthId)
  const db = openDatabase()
  const row = db.prepare('SELECT text FROM month_notes WHERE month_id = ?').get(monthId) as
    | { text: string }
    | undefined
  return row?.text ?? ''
}

export function saveMonthNotes(input: SaveMonthNotesInput): MonthNotesResult {
  assertMonthId(input.month_id)
  const text = (input.text ?? '').trim()
  const db = openDatabase()
  if (text === '') {
    db.prepare('DELETE FROM month_notes WHERE month_id = ?').run(input.month_id)
    return { month_id: input.month_id, text: '' }
  }
  db.prepare(`
    INSERT INTO month_notes (month_id, text, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(month_id) DO UPDATE SET
      text = excluded.text,
      updated_at = excluded.updated_at
  `).run(input.month_id, text)
  return { month_id: input.month_id, text }
}
