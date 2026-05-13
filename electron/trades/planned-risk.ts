import { openDatabase } from '../db/database'
import { getTrade } from './list'
import type {
  TradeListRow,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
} from '@shared/trades-types'

// Clean negative or non-finite values back to null so a bad payload can't
// land in the column. Zero is also treated as null because R-division would
// be undefined.
function clean(input: number | null | undefined): number | null {
  if (input == null) return null
  const n = Number(input)
  if (!Number.isFinite(n) || n <= 0) return null
  // Round to cents to keep the stored representation tidy.
  return Math.round(n * 100) / 100
}

export function savePlannedRisk(input: UpdatePlannedRiskInput): TradeListRow | null {
  const db = openDatabase()
  db.prepare('UPDATE trades SET planned_risk = ? WHERE id = ?').run(
    clean(input.planned_risk),
    input.trade_id,
  )
  return getTrade(input.trade_id)
}

export function savePlannedStopLossPrice(
  input: UpdatePlannedStopLossInput,
): TradeListRow | null {
  const db = openDatabase()
  db.prepare('UPDATE trades SET planned_stop_loss_price = ? WHERE id = ?').run(
    clean(input.planned_stop_loss_price),
    input.trade_id,
  )
  return getTrade(input.trade_id)
}
