import { openDatabase } from '../db/database'
import { getTrade } from './list'
import type { TradeListRow, UpdateMistakesInput } from '@shared/trades-types'

export function saveMistakes(input: UpdateMistakesInput): TradeListRow | null {
  const db = openDatabase()
  // Normalize: trim, drop blanks, dedupe — keeps the stored JSON tidy.
  const clean = Array.from(
    new Set((input.mistakes ?? []).map((m) => String(m).trim()).filter(Boolean)),
  )
  db.prepare('UPDATE trades SET mistakes_json = ? WHERE id = ?').run(
    JSON.stringify(clean),
    input.trade_id,
  )
  return getTrade(input.trade_id)
}
