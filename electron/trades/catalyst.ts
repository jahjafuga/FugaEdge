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

// Phase 2 beat 2 — bulk set catalyst_type on many trades. UNLIKE saveCatalyst, this
// sets catalyst_type ONLY (no days_since_catalyst), so each selected trade keeps its
// own days-since. Mirrors softDeleteTrades / setPlaybookOnTradesBulk's shape: one
// transaction, a single `WHERE id IN (...)`; MAX_BULK (500, UI-enforced) stays under
// the bind limit so no chunking. No junction, no invariant, no FK validation —
// catalyst is a free-form string column. cleanType matches the single-save cleaning.
export function setCatalystOnTradesBulk(
  tradeIds: number[],
  catalystType: string | null,
): void {
  const db = openDatabase()
  if (tradeIds.length === 0) return
  const clean = cleanType(catalystType)
  const ph = tradeIds.map(() => '?').join(',')
  const tx = db.transaction(() => {
    db.prepare(`UPDATE trades SET catalyst_type = ? WHERE id IN (${ph})`).run(
      clean,
      ...tradeIds,
    )
  })
  tx()
}
