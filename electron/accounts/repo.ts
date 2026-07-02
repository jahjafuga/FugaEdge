// Multi-account Beat 1 — trading-accounts repo (the badges-repo shape:
// openDatabase + prepared statements, ULID ids, ISO-8601 UTC timestamps).
// "Trading accounts" in user-facing copy; `accounts` is the code namespace —
// distinct from the top-right profile AccountMenu (rename lands Beat 3).
//
// Invariants owned here (DB enforces, repo translates to friendly errors):
//   - names are unique (idx_accounts_name)
//   - exactly one default (idx_accounts_single_default, partial UNIQUE);
//     the FIRST account ever created becomes the default automatically
//   - the default can be neither archived nor deleted (swap first)
//   - an account with trades assigned cannot be hard-deleted (real FK on
//     trades.account_id, foreign_keys = ON) — archive it instead
//
// ensureDefaultAccountId() is the insertTrip fallback (LOCKED: every new
// trade carries an account from Beat 1 onward): returns the default, creating
// 'Main account' when the registry is empty — so a fresh install's very first
// import can never stamp NULL. Reads are shim-defensive ((row ?? …) rather
// than row!) so commit()-path tests driving fake connections stay valid.

import { openDatabase } from '../db/database'
import { newUlid } from '@/core/ids/ulid'
import {
  ACCOUNT_TYPES,
  type Account,
  type AccountStatus,
  type AccountType,
  type CreateAccountInput,
  type UpdateAccountInput,
} from '@shared/accounts-types'

/** The auto-provisioned default's name (backfill + first-import fallback). */
export const DEFAULT_ACCOUNT_NAME = 'Main account'

const ACCOUNT_COLUMNS =
  'id, name, broker, account_type, color, status, is_default, created_at'

interface AccountRow {
  id: string
  name: string
  broker: string | null
  account_type: string
  color: string | null
  status: string
  is_default: number
  created_at: string
}

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    broker: r.broker ?? null,
    account_type: r.account_type as AccountType,
    color: r.color ?? null,
    status: r.status as AccountStatus,
    is_default: r.is_default === 1,
    created_at: r.created_at,
  }
}

function isUniqueNameViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed: accounts\.name/.test(e.message)
}

function isForeignKeyViolation(e: unknown): boolean {
  return e instanceof Error && /FOREIGN KEY constraint failed/.test(e.message)
}

function requireValidType(type: string): void {
  if (!(ACCOUNT_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Unknown account type "${type}"`)
  }
}

function getAccountRow(id: string): AccountRow | undefined {
  const db = openDatabase()
  return db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?`)
    .get(id) as AccountRow | undefined
}

function requireAccountRow(id: string): AccountRow {
  const row = getAccountRow(id)
  if (!row) throw new Error('Account not found')
  return row
}

/** All accounts — default first, then creation order. Includes archived rows;
 *  callers filter (the switcher shows active only, Settings shows all). */
export function listAccounts(): Account[] {
  const db = openDatabase()
  const rows = db
    .prepare(
      `SELECT ${ACCOUNT_COLUMNS} FROM accounts ORDER BY is_default DESC, created_at ASC`,
    )
    .all() as AccountRow[]
  return rows.map(rowToAccount)
}

export function createAccount(input: CreateAccountInput): Account {
  const db = openDatabase()
  const name = (input.name ?? '').trim()
  if (!name) throw new Error('Account name is required')
  requireValidType(input.account_type)

  const id = newUlid()
  const insert = db.prepare(`
    INSERT INTO accounts (id, name, broker, account_type, color, status, is_default, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const tx = db.transaction(() => {
    // First account ever created becomes the default automatically — the
    // count and the insert ride one transaction so two racing creates can't
    // both see an empty table (the partial index would reject the second
    // default anyway; this keeps the happy path violation-free).
    const count =
      (db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number } | undefined)
        ?.n ?? 0
    insert.run(
      id,
      name,
      (input.broker ?? '').trim() || null,
      input.account_type,
      (input.color ?? '').trim() || null,
      'active',
      count === 0 ? 1 : 0,
      new Date().toISOString(),
    )
  })
  try {
    tx()
  } catch (e) {
    if (isUniqueNameViolation(e)) {
      throw new Error(`An account named "${name}" already exists`)
    }
    throw e
  }
  const row = getAccountRow(id)
  return row
    ? rowToAccount(row)
    : {
        // Shim-defensive echo (fake connections may not round-trip the row).
        id,
        name,
        broker: (input.broker ?? '').trim() || null,
        account_type: input.account_type,
        color: (input.color ?? '').trim() || null,
        status: 'active',
        is_default: false,
        created_at: new Date().toISOString(),
      }
}

/** Patch name/broker/type/color. is_default is NOT patchable here — the
 *  single-default swap goes through setDefaultAccount's transaction. */
export function updateAccount(id: string, patch: UpdateAccountInput): Account {
  const db = openDatabase()
  const row = requireAccountRow(id)

  const name = patch.name !== undefined ? patch.name.trim() : row.name
  if (!name) throw new Error('Account name is required')
  const accountType = patch.account_type !== undefined ? patch.account_type : row.account_type
  requireValidType(accountType)
  const broker = patch.broker !== undefined ? (patch.broker ?? '').trim() || null : row.broker
  const color = patch.color !== undefined ? (patch.color ?? '').trim() || null : row.color

  try {
    db.prepare(
      'UPDATE accounts SET name = ?, broker = ?, account_type = ?, color = ? WHERE id = ?',
    ).run(name, broker, accountType, color, id)
  } catch (e) {
    if (isUniqueNameViolation(e)) {
      throw new Error(`An account named "${name}" already exists`)
    }
    throw e
  }
  return rowToAccount(requireAccountRow(id))
}

/** Swap the default in ONE transaction: clear the old, set the new. The
 *  partial UNIQUE index idx_accounts_single_default backstops the invariant. */
export function setDefaultAccount(id: string): Account {
  const db = openDatabase()
  const row = requireAccountRow(id)
  if (row.status !== 'active') {
    throw new Error('Cannot set an archived account as default')
  }
  const tx = db.transaction(() => {
    db.prepare('UPDATE accounts SET is_default = 0 WHERE is_default = 1').run()
    db.prepare('UPDATE accounts SET is_default = 1 WHERE id = ?').run(id)
  })
  tx()
  return rowToAccount(requireAccountRow(id))
}

export function setAccountStatus(id: string, status: AccountStatus): Account {
  if (status !== 'active' && status !== 'archived') {
    throw new Error(`Unknown account status "${status}"`)
  }
  const db = openDatabase()
  const row = requireAccountRow(id)
  if (status === 'archived' && row.is_default === 1) {
    throw new Error('Cannot archive the default account — set another default first')
  }
  db.prepare('UPDATE accounts SET status = ? WHERE id = ?').run(status, id)
  return rowToAccount(requireAccountRow(id))
}

/** Hard delete. Rejected for the default; rejected (via the real FK on
 *  trades.account_id) when any trade — live or soft-deleted — references it. */
export function deleteAccount(id: string): void {
  const db = openDatabase()
  const row = requireAccountRow(id)
  if (row.is_default === 1) {
    throw new Error('Cannot delete the default account — set another default first')
  }
  try {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  } catch (e) {
    if (isForeignKeyViolation(e)) {
      throw new Error('This account has trades assigned — archive it instead')
    }
    throw e
  }
}

export function getDefaultAccountId(): string | null {
  const db = openDatabase()
  const row = db.prepare('SELECT id FROM accounts WHERE is_default = 1').get() as
    | { id: string }
    | undefined
  return row?.id ?? null
}

/** The insertTrip fallback (LOCKED law: every new trade carries an account).
 *  Returns the default account's id, provisioning one when needed:
 *   - registry empty → create 'Main account' (margin; first-create rule makes
 *     it the default)
 *   - rows exist but none default (unreachable via repo paths; defensive) →
 *     promote the earliest-created ACTIVE account, logged. */
export function ensureDefaultAccountId(): string {
  const existing = getDefaultAccountId()
  if (existing) return existing

  const db = openDatabase()
  const count =
    (db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number } | undefined)?.n ??
    0
  if (count === 0) {
    return createAccount({ name: DEFAULT_ACCOUNT_NAME, account_type: 'margin' }).id
  }

  const earliest = db
    .prepare("SELECT id FROM accounts WHERE status = 'active' ORDER BY created_at ASC LIMIT 1")
    .get() as { id: string } | undefined
  if (earliest) {
    console.warn(
      '[FE accounts] no default account found with a non-empty registry — promoting the earliest active account',
    )
    db.prepare('UPDATE accounts SET is_default = 1 WHERE id = ?').run(earliest.id)
    return earliest.id
  }
  // Doubly-defensive tail: rows exist but every one is archived. Provision a
  // fresh default rather than stamping NULL onto a new trade.
  return createAccount({ name: DEFAULT_ACCOUNT_NAME, account_type: 'margin' }).id
}
