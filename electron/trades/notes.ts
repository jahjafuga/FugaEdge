import { openDatabase } from '../db/database'
import { getTrade } from './list'
import type { TradeListRow, UpdateNoteInput } from '@shared/trades-types'

// One note per trade. The trade_notes table allows multiple rows, but we
// treat it as a single record by wiping and rewriting in a transaction.
// (The legacy `tags` and `emotion_rating` columns are left in the schema
// for back-compat but no longer written — Playbook + Mistakes + Confidence
// have replaced them at the trade level. Emotion rating remains on the
// Journal page as a per-session metric.)
export function saveNote(input: UpdateNoteInput): TradeListRow | null {
  const db = openDatabase()
  const text = input.text ?? ''

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM trade_notes WHERE trade_id = ?').run(input.trade_id)
    if (text.trim()) {
      db.prepare(`
        INSERT INTO trade_notes (trade_id, note_text)
        VALUES (?, ?)
      `).run(input.trade_id, text)
    }
  })
  tx()

  return getTrade(input.trade_id)
}
