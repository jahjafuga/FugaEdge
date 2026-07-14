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
  // rules_followed / rule_violations are rule ID strings (post-Beat-2; were
  // names). This write is shape-agnostic — it serializes whatever string[] the
  // renderer sends, so no transform is needed here.
  const followed = JSON.stringify(input.rules_followed ?? [])
  const violations = JSON.stringify(input.rule_violations ?? [])
  // Recording lengths (seconds) — coerce to a non-negative integer or null.
  // NULL = no recording; the transcript text itself lives in the notes columns.
  const premarketDuration = toDurationOrNull(input.premarket_recording_duration)
  const postsessionDuration = toDurationOrNull(input.postsession_recording_duration)

  // If the entry is wholly empty, remove any existing row to keep the table
  // tidy and make the UI's "no entry yet" state honest.
  const empty =
    !premarket && !postsession && emotion == null &&
    (input.rules_followed ?? []).length === 0 &&
    (input.rule_violations ?? []).length === 0

  if (empty) {
    // Don't drop the row if it still carries data this save does NOT own.
    // day_tags (DAY_TAGS_SAVE) and rule_breaks (DAY_RULE_BREAKS_SAVE) live on the
    // same journal row but are written by their own IPC paths and are absent from
    // SaveJournalInput — so `empty` above cannot see them, and the row must be
    // read back to find out. Dropping it would destroy them with no trace.
    //
    // 3b-1 — the guard also asks the JUNCTION, and it HAS to.
    //
    // journal_rule_break.date REFERENCES journal(date) ON DELETE CASCADE. So the DELETE
    // below does not fail on a day that still has rule-break links — it SILENTLY TAKES
    // THEM WITH IT. That is 0149c75's bug exactly, one table over, and with no error to
    // notice it by.
    //
    // It cannot bite today only because the dual-write keeps the column populated, so the
    // column check happens to save the junction. That is an ACCIDENT, not a guarantee: the
    // moment 3b-2 freezes the column, every day looks column-empty, and clearing a note
    // would cascade away the day's rule-breaks. Re-pointing the guard in the beat that
    // removes its own safety net is how you ship the bug; it is re-pointed HERE, while the
    // column is still around to prove the two agree.
    const existing = db
      .prepare(`
        SELECT day_tags, rule_breaks,
               EXISTS (SELECT 1 FROM journal_rule_break WHERE journal_rule_break.date = journal.date) AS has_links
        FROM journal WHERE date = ?
      `)
      .get(input.date) as
      | { day_tags: string; rule_breaks: string; has_links: number }
      | undefined
    // has_links is SQLite's EXISTS — the INTEGER 0 or 1, never a boolean. Compared
    // strictly, so a 0 can never sneak through as "present" and preserve every empty
    // row forever (which would quietly repeal the tidy-up contract below).
    const keep =
      !!existing &&
      (nonEmptyJsonArray(existing.day_tags) ||
        nonEmptyJsonArray(existing.rule_breaks) ||
        existing.has_links === 1)
    if (keep) {
      db.prepare(`
        UPDATE journal SET
          premarket_notes = '',
          postsession_notes = '',
          emotion_rating = NULL,
          rules_followed = '',
          rule_violations = '',
          premarket_recording_duration = NULL,
          postsession_recording_duration = NULL
        WHERE date = ?
      `).run(input.date)
    } else {
      db.prepare('DELETE FROM journal WHERE date = ?').run(input.date)
    }
  } else {
    db.prepare(`
      INSERT INTO journal (date, premarket_notes, postsession_notes, emotion_rating, rules_followed, rule_violations, premarket_recording_duration, postsession_recording_duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        premarket_notes   = excluded.premarket_notes,
        postsession_notes = excluded.postsession_notes,
        emotion_rating    = excluded.emotion_rating,
        rules_followed    = excluded.rules_followed,
        rule_violations   = excluded.rule_violations,
        premarket_recording_duration   = excluded.premarket_recording_duration,
        postsession_recording_duration = excluded.postsession_recording_duration
    `).run(input.date, premarket, postsession, emotion, followed, violations, premarketDuration, postsessionDuration)
  }

  return getJournalDay(input.date)
}

/** Does a stored JSON-array column actually carry anything? The original day_tags
 *  predicate, verbatim (NOT NULL, not '', not '[]') — now shared with rule_breaks
 *  so the two can never diverge on what "still has data" means. */
function nonEmptyJsonArray(v: string | null | undefined): boolean {
  return v != null && v !== '' && v !== '[]'
}

/** Coerce a recording-duration input to a non-negative integer of seconds, or
 *  null. Guards undefined / NaN / Infinity / negatives so the INTEGER column
 *  never stores garbage (the same "don't persist garbage" discipline as the
 *  FMP service's toNullableNumber). */
function toDurationOrNull(v: number | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  const n = Math.round(v)
  return n < 0 ? null : n
}
