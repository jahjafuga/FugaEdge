// Stage 3 beat 1 — the cash_events repo: per-account starting/deposit/
// withdrawal rows and FIRST-CLASS TRANSFERS (a linked pair of plain legs
// sharing a transfer_id — zero special cases in the balance math; atomic at
// creation, deletable only as a pair). Validation lives here by house style
// (the DDL carries no CHECKs): amounts ('starting' >= 0, others > 0), the
// trades.date YYYY-MM-DD convention, account existence (the belt on top of
// the REAL foreign key — foreign_keys = ON per connection), the friendly
// single-starting guard (the belt on top of the partial-unique index), and
// the same-realm transfer rule (both sim or both non-sim, never across).

import { openDatabase } from '../db/database'
import { newUlid } from '@/core/ids/ulid'
import {
  CASH_EVENT_KINDS,
  type CashEvent,
  type CashEventKind,
  type CreateCashEventInput,
  type CreateTransferInput,
  type TransferResult,
} from '@shared/cash-types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertAmount(kind: CashEventKind, amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount cannot be negative')
  }
  if (kind !== 'starting' && amount <= 0) {
    throw new Error('Amount must be greater than zero')
  }
}

function assertDate(date: string): void {
  if (!DATE_RE.test(date)) {
    throw new Error('Date must be YYYY-MM-DD (the trading-day convention)')
  }
}

function accountType(db: ReturnType<typeof openDatabase>, id: string): string {
  const row = db
    .prepare('SELECT account_type FROM accounts WHERE id = ?')
    .get(id) as { account_type: string } | undefined
  if (!row) throw new Error(`Account not found`)
  return row.account_type
}

function insertEvent(
  db: ReturnType<typeof openDatabase>,
  input: CreateCashEventInput,
  transferId: string | null,
): CashEvent {
  const ev: CashEvent = {
    id: newUlid(),
    account_id: input.account_id,
    kind: input.kind,
    amount: input.amount,
    date: input.date,
    transfer_id: transferId,
    created_at: new Date().toISOString(),
  }
  db.prepare(
    `INSERT INTO cash_events (id, account_id, kind, amount, date, transfer_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(ev.id, ev.account_id, ev.kind, ev.amount, ev.date, ev.transfer_id, ev.created_at)
  return ev
}

export function createCashEvent(input: CreateCashEventInput): CashEvent {
  const db = openDatabase()
  if (!(CASH_EVENT_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`Unknown cash event kind '${input.kind}'`)
  }
  assertAmount(input.kind, input.amount)
  assertDate(input.date)
  accountType(db, input.account_id) // existence belt (the FK is the wall)
  if (input.kind === 'starting') {
    const existing = db
      .prepare(
        "SELECT id FROM cash_events WHERE account_id = ? AND kind = 'starting'",
      )
      .get(input.account_id)
    if (existing) {
      throw new Error(
        'This account already has a starting balance — edit or delete it instead',
      )
    }
  }
  return insertEvent(db, input, null)
}

export function createTransfer(input: CreateTransferInput): TransferResult {
  const db = openDatabase()
  if (input.from_account_id === input.to_account_id) {
    throw new Error('A transfer requires two different accounts')
  }
  assertAmount('deposit', input.amount) // transfers move a positive amount
  assertDate(input.date)
  const fromType = accountType(db, input.from_account_id)
  const toType = accountType(db, input.to_account_id)
  if ((fromType === 'sim') !== (toType === 'sim')) {
    throw new Error(
      'Transfers cannot cross between practice and real accounts',
    )
  }
  const transferId = newUlid()
  let fromEvent!: CashEvent
  let toEvent!: CashEvent
  const tx = db.transaction(() => {
    fromEvent = insertEvent(
      db,
      { account_id: input.from_account_id, kind: 'withdrawal', amount: input.amount, date: input.date },
      transferId,
    )
    toEvent = insertEvent(
      db,
      { account_id: input.to_account_id, kind: 'deposit', amount: input.amount, date: input.date },
      transferId,
    )
  })
  tx()
  return { transfer_id: transferId, from_event: fromEvent, to_event: toEvent }
}

/** Delete a plain (non-transfer) event. Transfer legs are REFUSED — total
 *  capital must stay unchanged, so the pair goes together via
 *  deleteTransfer. */
export function deleteCashEvent(id: string): void {
  const db = openDatabase()
  const row = db
    .prepare('SELECT transfer_id FROM cash_events WHERE id = ?')
    .get(id) as { transfer_id: string | null } | undefined
  if (row?.transfer_id) {
    throw new Error(
      'This entry is one leg of a transfer — delete the transfer instead',
    )
  }
  db.prepare('DELETE FROM cash_events WHERE id = ?').run(id)
}

/** Delete BOTH legs of a transfer atomically. */
export function deleteTransfer(transferId: string): void {
  const db = openDatabase()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM cash_events WHERE transfer_id = ?').run(transferId)
  })
  tx()
}

/** Events for one account (or every account), newest date first — beat 2's
 *  manager list. */
export function listCashEvents(accountId?: string): CashEvent[] {
  const db = openDatabase()
  if (accountId) {
    return db
      .prepare(
        'SELECT * FROM cash_events WHERE account_id = ? ORDER BY date DESC, id DESC',
      )
      .all(accountId) as CashEvent[]
  }
  return db
    .prepare('SELECT * FROM cash_events ORDER BY date DESC, id DESC')
    .all() as CashEvent[]
}
