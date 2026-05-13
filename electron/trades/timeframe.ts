import { openDatabase } from '../db/database'
import { getTrade } from './list'
import type {
  EntryTimeframe,
  TradeListRow,
  UpdateTimeframeInput,
} from '@shared/trades-types'

function clean(tf: EntryTimeframe | null | undefined): EntryTimeframe | null {
  if (tf === '10s' || tf === '1m' || tf === '5m') return tf
  return null
}

export function saveTimeframe(input: UpdateTimeframeInput): TradeListRow | null {
  const db = openDatabase()
  db.prepare('UPDATE trades SET entry_timeframe = ? WHERE id = ?').run(
    clean(input.timeframe),
    input.trade_id,
  )
  return getTrade(input.trade_id)
}
