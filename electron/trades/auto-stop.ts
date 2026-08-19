// v0.2.7 Feature 3 Commit 2 — the Electron binding for the auto-stop engine.
//
// This file is the ONLY place the engine meets sqlite. The rules — which rows are
// eligible, what value they get, what must never be touched — all live in the pure
// module (src/core/trades/autoStop.ts). Everything here is plumbing: read the
// candidate rows, hand the plan a transaction, hand the run a real backup.
//
// ARCHITECTURE #1: no decision is made below. If you find yourself adding a
// condition to the SQL, it belongs in a planner instead.

import { openDatabase } from '../db/database'
import { electronBackupStorage } from '../db/backup'
import { getSettings } from '../settings/repo'
import { AUTO_STOP_LABEL, backupBeforeWrite } from '@/core/import/backup'
import {
  runAutoStop,
  type AutoStopOp,
  type AutoStopResult,
  type AutoStopTrade,
  type StopUpdate,
} from '@/core/trades/autoStop'
import type { RoundTripExecution } from '@shared/import-types'

interface CandidateRow {
  id: number
  side: string
  planned_stop_loss_price: number | null
  stop_source: string | null
  executions_json: string | null
  avg_buy_price: number
  avg_sell_price: number
}

function parseExecutions(raw: string | null): RoundTripExecution[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RoundTripExecution[]) : []
  } catch {
    return []
  }
}

/** Every live trade, in the minimal shape the planners read. Deliberately
 *  UNFILTERED beyond the soft-delete predicate: eligibility is the engine's
 *  decision, and splitting it across a WHERE clause is how the two drift apart. */
export function listAutoStopCandidates(): AutoStopTrade[] {
  const db = openDatabase()
  const rows = db
    .prepare(
      `SELECT id, side, planned_stop_loss_price, stop_source,
              executions_json, avg_buy_price, avg_sell_price
         FROM trades
        WHERE deleted_at IS NULL`,
    )
    .all() as CandidateRow[]
  return rows.map((r) => ({
    id: r.id,
    side: r.side === 'short' ? 'short' : 'long',
    planned_stop_loss_price: r.planned_stop_loss_price,
    stop_source: (r.stop_source as 'manual' | 'auto' | null) ?? null,
    executions: parseExecutions(r.executions_json),
    avg_buy_price: r.avg_buy_price,
    avg_sell_price: r.avg_sell_price,
  }))
}

/** Apply a whole plan in ONE transaction: either every row moves or none does.
 *  A half-applied plan would leave stops and their provenance disagreeing, which
 *  is the one state the CHECK constraint cannot catch. */
export function writeStops(updates: readonly StopUpdate[]): number {
  const db = openDatabase()
  const stmt = db.prepare(
    'UPDATE trades SET planned_stop_loss_price = ?, stop_source = ? WHERE id = ?',
  )
  const tx = db.transaction((list: readonly StopUpdate[]) => {
    let changed = 0
    for (const u of list) {
      // The value is written UNROUNDED on purpose. savePlannedStopLossPrice
      // rounds to cents because a human types cents; a derived value has no such
      // excuse, and rounding it would bake the error into every R it feeds.
      changed += stmt.run(u.stop, u.source, u.id).changes
    }
    return changed
  })
  return tx(updates)
}

/** Run one operation against the real database, with the real settings and a real
 *  pre-operation snapshot. The snapshot writes under its own label so a run of
 *  this cannot age out the backups taken before imports. */
export function runAutoStopOperation(op: AutoStopOp): Promise<AutoStopResult> {
  const { values } = getSettings()
  return runAutoStop(
    op,
    { enabled: values.autofill_stop_enabled, pct: values.autofill_stop_pct },
    {
      listTrades: listAutoStopCandidates,
      writeStops: (updates) => writeStops(updates),
      backup: () => backupBeforeWrite(electronBackupStorage, AUTO_STOP_LABEL),
    },
  )
}
