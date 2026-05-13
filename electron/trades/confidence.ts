import { openDatabase } from '../db/database'
import { getTrade } from './list'
import type { TradeListRow, UpdateConfidenceInput } from '@shared/trades-types'

// Clamp to 1..5 integer, or null. Anything outside the range is dropped to
// null so a typo in the renderer can't corrupt the column.
function clean(input: number | null | undefined): number | null {
  if (input == null) return null
  const n = Math.round(Number(input))
  if (!Number.isFinite(n) || n < 1 || n > 5) return null
  return n
}

export function saveConfidence(input: UpdateConfidenceInput): TradeListRow | null {
  const db = openDatabase()
  db.prepare('UPDATE trades SET confidence = ? WHERE id = ?').run(
    clean(input.confidence),
    input.trade_id,
  )
  return getTrade(input.trade_id)
}
