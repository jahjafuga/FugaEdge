import { openDatabase } from '../db/database'
import { getJournalDay } from './get'
import type { JournalDay, SaveJournalInput } from '@shared/journal-types'

// One row per date. Upsert via INSERT OR REPLACE — preserves no created_at /
// updated_at metadata yet (none in the schema), so just overwrites cleanly.
export function saveJournalDay(input: SaveJournalInput): JournalDay {
  const db = openDatabase()
  const premarket = (input.premarket_notes ?? '').trim()
  const postsession = (input.postsession_notes ?? '').trim()
  const emotion = input.emotion_rating == null ? null : Number(input.emotion_rating)
  const followed = JSON.stringify(input.rules_followed ?? [])
  const violations = JSON.stringify(input.rule_violations ?? [])

  // If the entry is wholly empty, remove any existing row to keep the table
  // tidy and make the UI's "no entry yet" state honest.
  const empty =
    !premarket && !postsession && emotion == null &&
    (input.rules_followed ?? []).length === 0 &&
    (input.rule_violations ?? []).length === 0

  if (empty) {
    // Don't drop the row if it still carries day_tags — those live on the same
    // journal row and a clean journal entry shouldn't clobber per-day tags.
    const existing = db
      .prepare('SELECT day_tags FROM journal WHERE date = ?')
      .get(input.date) as { day_tags: string } | undefined
    const hasTags =
      !!existing && existing.day_tags && existing.day_tags !== '[]' && existing.day_tags !== ''
    if (hasTags) {
      db.prepare(`
        UPDATE journal SET
          premarket_notes = '',
          postsession_notes = '',
          emotion_rating = NULL,
          rules_followed = '',
          rule_violations = ''
        WHERE date = ?
      `).run(input.date)
    } else {
      db.prepare('DELETE FROM journal WHERE date = ?').run(input.date)
    }
  } else {
    db.prepare(`
      INSERT INTO journal (date, premarket_notes, postsession_notes, emotion_rating, rules_followed, rule_violations)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        premarket_notes   = excluded.premarket_notes,
        postsession_notes = excluded.postsession_notes,
        emotion_rating    = excluded.emotion_rating,
        rules_followed    = excluded.rules_followed,
        rule_violations   = excluded.rule_violations
    `).run(input.date, premarket, postsession, emotion, followed, violations)
  }

  return getJournalDay(input.date)
}
