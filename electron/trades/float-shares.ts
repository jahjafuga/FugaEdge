import { openDatabase } from '../db/database'
import { getTrade } from './list'
import type {
  TradeListRow,
  UpdateFloatInput,
} from '@shared/trades-types'

// Normalise float input. Negative or non-finite → null. Sub-integer values
// rounded down (float shares are whole-share counts).
function clean(input: number | null | undefined): number | null {
  if (input == null) return null
  const n = Number(input)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

export function saveFloat(input: UpdateFloatInput): TradeListRow | null {
  const db = openDatabase()
  db.prepare('UPDATE trades SET float_shares = ? WHERE id = ?').run(
    clean(input.float_shares),
    input.trade_id,
  )
  return getTrade(input.trade_id)
}
