import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Account } from '@shared/accounts-types'

// Multi-account Beat 1 — accounts repo. better-sqlite3 doesn't load under
// vitest, so a STATEFUL in-memory accounts table stands in behind the
// openDatabase mock (the settings-repo capturing-shim pattern), and it
// ENFORCES the two DB-level invariants the real schema carries so the repo's
// error translation is exercised against realistic throws:
//   - UNIQUE index on accounts(name)            → "UNIQUE constraint failed: accounts.name"
//   - partial UNIQUE index on is_default = 1    → "UNIQUE constraint failed: index 'idx_accounts_single_default'"
//   - trades.account_id REFERENCES accounts(id) → DELETE throws "FOREIGN KEY constraint failed"
//     (simulated via a per-account trade-reference count the tests seed).
const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as {
      id: string
      name: string
      broker: string | null
      account_type: string
      color: string | null
      status: string
      is_default: number
      created_at: string
    }[],
    tradeRefs: new Map<string, number>(),
    txnCount: 0,
  },
}))

function sqliteError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => ({
      get: (...args: unknown[]) => {
        if (/SELECT COUNT\(\*\) AS n FROM accounts/i.test(sql)) {
          return { n: state.rows.length }
        }
        if (/SELECT id FROM accounts WHERE is_default = 1/i.test(sql)) {
          const row = state.rows.find((r) => r.is_default === 1)
          return row ? { id: row.id } : undefined
        }
        if (/SELECT id FROM accounts WHERE status = 'active' ORDER BY created_at ASC/i.test(sql)) {
          const actives = state.rows
            .filter((r) => r.status === 'active')
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
          return actives[0] ? { id: actives[0].id } : undefined
        }
        if (/FROM accounts WHERE id = \?/i.test(sql)) {
          return state.rows.find((r) => r.id === args[0])
        }
        return undefined
      },
      all: () => {
        if (/FROM accounts ORDER BY is_default DESC, created_at ASC/i.test(sql)) {
          return [...state.rows].sort(
            (a, b) => b.is_default - a.is_default || a.created_at.localeCompare(b.created_at),
          )
        }
        return []
      },
      run: (...args: unknown[]) => {
        if (/INSERT INTO accounts/i.test(sql)) {
          const [id, name, broker, account_type, color, status, is_default, created_at] =
            args as [string, string, string | null, string, string | null, string, number, string]
          if (state.rows.some((r) => r.name === name)) {
            throw sqliteError('UNIQUE constraint failed: accounts.name', 'SQLITE_CONSTRAINT_UNIQUE')
          }
          if (is_default === 1 && state.rows.some((r) => r.is_default === 1)) {
            throw sqliteError(
              "UNIQUE constraint failed: index 'idx_accounts_single_default'",
              'SQLITE_CONSTRAINT_UNIQUE',
            )
          }
          state.rows.push({ id, name, broker, account_type, color, status, is_default, created_at })
          return { changes: 1, lastInsertRowid: 0 }
        }
        if (/UPDATE accounts SET name = \?, broker = \?, account_type = \?, color = \? WHERE id = \?/i.test(sql)) {
          const [name, broker, account_type, color, id] =
            args as [string, string | null, string, string | null, string]
          if (state.rows.some((r) => r.name === name && r.id !== id)) {
            throw sqliteError('UNIQUE constraint failed: accounts.name', 'SQLITE_CONSTRAINT_UNIQUE')
          }
          const row = state.rows.find((r) => r.id === id)
          if (!row) return { changes: 0, lastInsertRowid: 0 }
          Object.assign(row, { name, broker, account_type, color })
          return { changes: 1, lastInsertRowid: 0 }
        }
        if (/UPDATE accounts SET is_default = 0 WHERE is_default = 1/i.test(sql)) {
          let changes = 0
          for (const r of state.rows) {
            if (r.is_default === 1) {
              r.is_default = 0
              changes++
            }
          }
          return { changes, lastInsertRowid: 0 }
        }
        if (/UPDATE accounts SET is_default = 1 WHERE id = \?/i.test(sql)) {
          const id = args[0] as string
          if (state.rows.some((r) => r.is_default === 1 && r.id !== id)) {
            throw sqliteError(
              "UNIQUE constraint failed: index 'idx_accounts_single_default'",
              'SQLITE_CONSTRAINT_UNIQUE',
            )
          }
          const row = state.rows.find((r) => r.id === id)
          if (!row) return { changes: 0, lastInsertRowid: 0 }
          row.is_default = 1
          return { changes: 1, lastInsertRowid: 0 }
        }
        if (/UPDATE accounts SET status = \? WHERE id = \?/i.test(sql)) {
          const [status, id] = args as [string, string]
          const row = state.rows.find((r) => r.id === id)
          if (!row) return { changes: 0, lastInsertRowid: 0 }
          row.status = status
          return { changes: 1, lastInsertRowid: 0 }
        }
        if (/DELETE FROM accounts WHERE id = \?/i.test(sql)) {
          const id = args[0] as string
          if ((state.tradeRefs.get(id) ?? 0) > 0) {
            throw sqliteError('FOREIGN KEY constraint failed', 'SQLITE_CONSTRAINT_FOREIGNKEY')
          }
          const before = state.rows.length
          state.rows = state.rows.filter((r) => r.id !== id)
          return { changes: before - state.rows.length, lastInsertRowid: 0 }
        }
        return { changes: 0, lastInsertRowid: 0 }
      },
    }),
    transaction: (fn: (...a: unknown[]) => unknown) => {
      return (...a: unknown[]) => {
        state.txnCount++
        return fn(...a)
      }
    },
  }),
}))

// SUT imported after the mock.
import {
  createAccount,
  deleteAccount,
  ensureDefaultAccountId,
  getDefaultAccountId,
  listAccounts,
  setAccountStatus,
  setDefaultAccount,
  updateAccount,
} from '../repo'

beforeEach(() => {
  state.rows = []
  state.tradeRefs = new Map()
  state.txnCount = 0
})

describe('createAccount', () => {
  it('creates with a trimmed name and returns the row', () => {
    const a = createAccount({ name: '  Ocean One  ', account_type: 'margin' })
    expect(a.name).toBe('Ocean One')
    expect(a.account_type).toBe('margin')
    expect(a.status).toBe('active')
    expect(typeof a.id).toBe('string')
    expect(a.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('rejects an empty / whitespace-only name', () => {
    expect(() => createAccount({ name: '   ', account_type: 'margin' })).toThrow(
      'Account name is required',
    )
  })

  it('rejects an unknown account type', () => {
    expect(() =>
      createAccount({ name: 'X', account_type: 'crypto' as never }),
    ).toThrow('Unknown account type "crypto"')
  })

  it('FIRST account created becomes the default automatically; the second does not', () => {
    const first = createAccount({ name: 'First', account_type: 'margin' })
    const second = createAccount({ name: 'Second', account_type: 'cash' })
    expect(first.is_default).toBe(true)
    expect(second.is_default).toBe(false)
  })

  it('duplicate name → friendly error (unique-index violation translated)', () => {
    createAccount({ name: 'Ocean One', account_type: 'margin' })
    expect(() => createAccount({ name: 'Ocean One', account_type: 'cash' })).toThrow(
      'An account named "Ocean One" already exists',
    )
  })
})

describe('listAccounts', () => {
  it('orders is_default DESC then created_at ASC, and INCLUDES archived rows', () => {
    createAccount({ name: 'A', account_type: 'margin' }) // becomes default
    const b = createAccount({ name: 'B', account_type: 'cash' })
    const c = createAccount({ name: 'C', account_type: 'prop' })
    setAccountStatus(b.id, 'archived')
    setDefaultAccount(c.id)
    const list = listAccounts()
    expect(list.map((r: Account) => r.name)).toEqual(['C', 'A', 'B'])
    expect(list.find((r: Account) => r.name === 'B')!.status).toBe('archived')
  })
})

describe('updateAccount', () => {
  it('applies a patch and returns the updated row', () => {
    const a = createAccount({ name: 'A', account_type: 'margin' })
    const updated = updateAccount(a.id, { name: 'A2', broker: 'Schwab', color: '#aabbcc' })
    expect(updated.name).toBe('A2')
    expect(updated.broker).toBe('Schwab')
    expect(updated.color).toBe('#aabbcc')
    expect(updated.account_type).toBe('margin') // untouched fields survive
  })

  it('re-applies the guards: empty name, unknown type, duplicate name', () => {
    const a = createAccount({ name: 'A', account_type: 'margin' })
    createAccount({ name: 'B', account_type: 'cash' })
    expect(() => updateAccount(a.id, { name: '  ' })).toThrow('Account name is required')
    expect(() => updateAccount(a.id, { account_type: 'lotto' as never })).toThrow(
      'Unknown account type "lotto"',
    )
    expect(() => updateAccount(a.id, { name: 'B' })).toThrow(
      'An account named "B" already exists',
    )
  })

  it('unknown id → Account not found; is_default is untouched by update', () => {
    expect(() => updateAccount('nope', { name: 'X' })).toThrow('Account not found')
    const a = createAccount({ name: 'A', account_type: 'margin' })
    const updated = updateAccount(a.id, { name: 'A2' })
    expect(updated.is_default).toBe(true) // still the default after an update
  })
})

describe('setDefaultAccount', () => {
  it('swaps the default in one transaction (old cleared, new set)', () => {
    const a = createAccount({ name: 'A', account_type: 'margin' })
    const b = createAccount({ name: 'B', account_type: 'cash' })
    const txnsBefore = state.txnCount
    setDefaultAccount(b.id)
    expect(state.txnCount).toBeGreaterThan(txnsBefore) // ran inside a transaction
    const list = listAccounts()
    expect(list.find((r: Account) => r.id === a.id)!.is_default).toBe(false)
    expect(list.find((r: Account) => r.id === b.id)!.is_default).toBe(true)
  })

  it('rejects an archived target and an unknown id', () => {
    createAccount({ name: 'A', account_type: 'margin' })
    const b = createAccount({ name: 'B', account_type: 'cash' })
    setAccountStatus(b.id, 'archived')
    expect(() => setDefaultAccount(b.id)).toThrow(
      'Cannot set an archived account as default',
    )
    expect(() => setDefaultAccount('nope')).toThrow('Account not found')
  })
})

describe('setAccountStatus', () => {
  it('archives and unarchives a non-default account', () => {
    createAccount({ name: 'A', account_type: 'margin' })
    const b = createAccount({ name: 'B', account_type: 'cash' })
    expect(setAccountStatus(b.id, 'archived').status).toBe('archived')
    expect(setAccountStatus(b.id, 'active').status).toBe('active')
  })

  it('REJECTS archiving the default account', () => {
    const a = createAccount({ name: 'A', account_type: 'margin' })
    expect(() => setAccountStatus(a.id, 'archived')).toThrow(
      'Cannot archive the default account — set another default first',
    )
  })

  it('rejects an unknown status value and an unknown id', () => {
    const a = createAccount({ name: 'A', account_type: 'margin' })
    expect(() => setAccountStatus(a.id, 'paused' as never)).toThrow(
      'Unknown account status "paused"',
    )
    expect(() => setAccountStatus('nope', 'archived')).toThrow('Account not found')
  })
})

describe('deleteAccount', () => {
  it('rejects deleting the default account', () => {
    const a = createAccount({ name: 'A', account_type: 'margin' })
    expect(() => deleteAccount(a.id)).toThrow(
      'Cannot delete the default account — set another default first',
    )
  })

  it('translates the FK throw into a friendly error when trades reference it', () => {
    createAccount({ name: 'A', account_type: 'margin' })
    const b = createAccount({ name: 'B', account_type: 'cash' })
    state.tradeRefs.set(b.id, 3)
    expect(() => deleteAccount(b.id)).toThrow(
      'This account has trades assigned — archive it instead',
    )
    expect(listAccounts()).toHaveLength(2) // nothing deleted
  })

  it('deletes a clean non-default account; unknown id → Account not found', () => {
    createAccount({ name: 'A', account_type: 'margin' })
    const b = createAccount({ name: 'B', account_type: 'cash' })
    deleteAccount(b.id)
    expect(listAccounts().map((r: Account) => r.name)).toEqual(['A'])
    expect(() => deleteAccount('nope')).toThrow('Account not found')
  })
})

describe('getDefaultAccountId / ensureDefaultAccountId', () => {
  it('getDefaultAccountId: null when no accounts exist, the id once one does', () => {
    expect(getDefaultAccountId()).toBeNull()
    const a = createAccount({ name: 'A', account_type: 'margin' })
    expect(getDefaultAccountId()).toBe(a.id)
  })

  it('ensureDefaultAccountId returns the existing default without creating anything', () => {
    const a = createAccount({ name: 'A', account_type: 'margin' })
    expect(ensureDefaultAccountId()).toBe(a.id)
    expect(listAccounts()).toHaveLength(1)
  })

  it("ensureDefaultAccountId creates 'Main account' (margin, default) when the table is empty", () => {
    const id = ensureDefaultAccountId()
    const list = listAccounts()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(id)
    expect(list[0].name).toBe('Main account')
    expect(list[0].account_type).toBe('margin')
    expect(list[0].is_default).toBe(true)
  })

  it('ensureDefaultAccountId promotes the earliest active account when rows exist but none is default (defensive)', () => {
    const a = createAccount({ name: 'A', account_type: 'margin' })
    const b = createAccount({ name: 'B', account_type: 'cash' })
    // Manufacture the impossible state directly in the fake: no default at all.
    for (const r of state.rows) r.is_default = 0
    const id = ensureDefaultAccountId()
    expect(id).toBe(a.id)
    expect(listAccounts().find((r: Account) => r.id === b.id)!.is_default).toBe(false)
    expect(listAccounts().find((r: Account) => r.id === a.id)!.is_default).toBe(true)
  })
})
