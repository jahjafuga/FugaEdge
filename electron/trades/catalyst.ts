import { openDatabase } from '../db/database'
import { getTrade } from './list'
import type { TradeListRow, UpdateCatalystInput } from '@shared/trades-types'

// Clean the days_since value. Negative, non-finite, or non-integer values
// fall back to null so a stray payload can't poison the column.
function cleanDays(input: number | null | undefined): number | null {
  if (input == null) return null
  const n = Number(input)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

// Empty string and whitespace-only strings collapse to null so the column
// stays sparse instead of holding "" sentinels.
function cleanType(input: string | null | undefined): string | null {
  if (input == null) return null
  const t = String(input).trim()
  return t === '' ? null : t
}

export function saveCatalyst(input: UpdateCatalystInput): TradeListRow | null {
  const db = openDatabase()
  db.prepare(
    'UPDATE trades SET catalyst_type = ?, days_since_catalyst = ? WHERE id = ?',
  ).run(cleanType(input.catalyst_type), cleanDays(input.days_since_catalyst), input.trade_id)
  return getTrade(input.trade_id)
}
