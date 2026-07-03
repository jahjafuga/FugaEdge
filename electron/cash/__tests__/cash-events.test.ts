// Stage 3 beat 1 — the cash_events repo: per-account events from day one,
// TRANSFERS first-class (a linked pair, atomic, same-realm only), validation
// at the repo (the DDL carries no CHECKs by house style). Routing-shim style
// (the c50155c/4a545f3 mirror): the fake db routes the guard reads; the
// writes are captured and asserted by SQL + binds.

import { describe, expect, it, beforeEach, vi } from 'vitest'

let runs: { sql: string; args: unknown[] }[] = []
let gets: { sql: string; args: unknown[] }[] = []

// Routed state: which accounts exist (with their realm) and which already
// hold a 'starting' row.
let accounts: Record<string, { account_type: string }> = {}
let hasStarting: Set<string> = new Set()

const mockDb = {
  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        runs.push({ sql, args })
        return { changes: sql.includes('transfer_id = ?') ? 2 : 1 }
      },
      get: (...args: unknown[]) => {
        gets.push({ sql, args })
        if (/SELECT account_type FROM accounts WHERE id = \?/.test(sql)) {
          return accounts[args[0] as string]
        }
        if (/FROM cash_events WHERE account_id = \? AND kind = 'starting'/.test(sql)) {
          return hasStarting.has(args[0] as string) ? { id: 'existing' } : undefined
        }
        if (/SELECT transfer_id FROM cash_events WHERE id = \?/.test(sql)) {
          return (args[0] as string).startsWith('LEG-')
            ? { transfer_id: 'T-1' }
            : { transfer_id: null }
        }
        return undefined
      },
      all: () => [],
    }
  },
  transaction:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import {
  createCashEvent,
  createTransfer,
  deleteCashEvent,
  deleteTransfer,
} from '../repo'

beforeEach(() => {
  runs = []
  gets = []
  accounts = {
    'ACCT-A': { account_type: 'margin' },
    'ACCT-B': { account_type: 'cash' },
    'ACCT-S1': { account_type: 'sim' },
    'ACCT-S2': { account_type: 'sim' },
  }
  hasStarting = new Set()
})

const insertOf = (i = 0) => runs.filter((r) => /INSERT INTO cash_events/i.test(r.sql))[i]

describe('createCashEvent — kinds, validation, the single-starting guard', () => {
  it("creates a 'starting' row: ULID id, account bind, amount + date bound", () => {
    const ev = createCashEvent({
      account_id: 'ACCT-A',
      kind: 'starting',
      amount: 25000,
      date: '2026-01-02',
    })
    expect(ev.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    const ins = insertOf()
    expect(ins.args).toContain('ACCT-A')
    expect(ins.args).toContain(25000)
    expect(ins.args).toContain('2026-01-02')
    expect(ev.kind).toBe('starting')
  })

  it("'starting' accepts zero; 'deposit'/'withdrawal' must be > 0; negatives always rejected", () => {
    expect(() =>
      createCashEvent({ account_id: 'ACCT-A', kind: 'starting', amount: 0, date: '2026-01-02' }),
    ).not.toThrow()
    expect(() =>
      createCashEvent({ account_id: 'ACCT-A', kind: 'deposit', amount: 0, date: '2026-01-02' }),
    ).toThrow(/greater than zero/i)
    expect(() =>
      createCashEvent({ account_id: 'ACCT-A', kind: 'withdrawal', amount: 0, date: '2026-01-02' }),
    ).toThrow(/greater than zero/i)
    expect(() =>
      createCashEvent({ account_id: 'ACCT-A', kind: 'starting', amount: -5, date: '2026-01-02' }),
    ).toThrow(/negative/i)
  })

  it('a SECOND starting row for the same account is rejected with a friendly error; a different account succeeds', () => {
    hasStarting = new Set(['ACCT-A'])
    expect(() =>
      createCashEvent({ account_id: 'ACCT-A', kind: 'starting', amount: 100, date: '2026-01-02' }),
    ).toThrow(/already has a starting balance/i)
    expect(() =>
      createCashEvent({ account_id: 'ACCT-B', kind: 'starting', amount: 100, date: '2026-01-02' }),
    ).not.toThrow()
  })

  it('an unknown account is rejected (the repo belt on top of the real FK)', () => {
    expect(() =>
      createCashEvent({ account_id: 'GONE', kind: 'deposit', amount: 10, date: '2026-01-02' }),
    ).toThrow(/not found/i)
  })

  it('a malformed date is rejected (the trades.date YYYY-MM-DD convention)', () => {
    expect(() =>
      createCashEvent({ account_id: 'ACCT-A', kind: 'deposit', amount: 10, date: '01/02/2026' }),
    ).toThrow(/date/i)
  })
})

describe('createTransfer — the atomic linked pair', () => {
  it('one call -> exactly TWO inserts sharing a transfer_id: withdrawal from, deposit to, same amount + date', () => {
    const t = createTransfer({
      from_account_id: 'ACCT-A',
      to_account_id: 'ACCT-B',
      amount: 500,
      date: '2026-06-01',
    })
    const inserts = runs.filter((r) => /INSERT INTO cash_events/i.test(r.sql))
    expect(inserts).toHaveLength(2)
    expect(t.transfer_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    for (const ins of inserts) {
      expect(ins.args).toContain(t.transfer_id)
      expect(ins.args).toContain(500)
      expect(ins.args).toContain('2026-06-01')
    }
    expect(t.from_event.kind).toBe('withdrawal')
    expect(t.from_event.account_id).toBe('ACCT-A')
    expect(t.to_event.kind).toBe('deposit')
    expect(t.to_event.account_id).toBe('ACCT-B')
  })

  it('the real<->sim cross-realm transfer is REJECTED; sim<->sim is allowed', () => {
    expect(() =>
      createTransfer({
        from_account_id: 'ACCT-A',
        to_account_id: 'ACCT-S1',
        amount: 100,
        date: '2026-06-01',
      }),
    ).toThrow(/practice/i)
    expect(() =>
      createTransfer({
        from_account_id: 'ACCT-S1',
        to_account_id: 'ACCT-S2',
        amount: 100,
        date: '2026-06-01',
      }),
    ).not.toThrow()
  })

  it('a self-transfer is rejected', () => {
    expect(() =>
      createTransfer({
        from_account_id: 'ACCT-A',
        to_account_id: 'ACCT-A',
        amount: 100,
        date: '2026-06-01',
      }),
    ).toThrow(/different account/i)
  })

  it('deleteTransfer removes BOTH legs atomically by transfer_id', () => {
    deleteTransfer('T-99')
    const del = runs.find((r) => /DELETE FROM cash_events WHERE transfer_id = \?/i.test(r.sql))!
    expect(del).toBeTruthy()
    expect(del.args).toEqual(['T-99'])
  })

  it('deleting a single transfer LEG by event id is REFUSED', () => {
    expect(() => deleteCashEvent('LEG-1')).toThrow(/transfer/i)
    // A plain (non-transfer) event deletes normally.
    deleteCashEvent('EV-1')
    expect(runs.some((r) => /DELETE FROM cash_events WHERE id = \?/i.test(r.sql))).toBe(true)
  })
})
