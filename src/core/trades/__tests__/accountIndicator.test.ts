import { describe, it, expect } from 'vitest'
import type { Account } from '@shared/accounts-types'
import { accountIndicatorFor, accountOwner } from '../accountIndicator'

// Multi-account (Trades slice) — the per-row account indicator's visibility
// logic: shown ONLY under scope 'all' (a single-account list is homogeneous),
// resolved from the renderer's accounts registry; unknown ids render nothing.
// The trade-detail header uses accountOwner directly (every scope).

function acct(over: Partial<Account>): Account {
  return {
    id: 'A',
    name: 'Main account',
    broker: null,
    account_type: 'margin',
    color: '#d4af37',
    status: 'active',
    is_default: true,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const ACCOUNTS = [acct({ id: 'A' }), acct({ id: 'B', name: 'Ocean One', color: '#4f9cf9' })]

describe('accountOwner', () => {
  it('resolves name + color from the registry', () => {
    expect(accountOwner(ACCOUNTS, 'B')).toEqual({ name: 'Ocean One', color: '#4f9cf9' })
  })

  it('null for an unknown id (deleted account / stale row)', () => {
    expect(accountOwner(ACCOUNTS, 'GONE')).toBeNull()
  })
})

describe('accountIndicatorFor', () => {
  it("scope 'all' -> the owning account's name + color", () => {
    expect(accountIndicatorFor('all', ACCOUNTS, 'B')).toEqual({
      name: 'Ocean One',
      color: '#4f9cf9',
    })
  })

  it('single-account scope -> null (indicator hidden; the list is homogeneous)', () => {
    expect(accountIndicatorFor({ accountId: 'B' }, ACCOUNTS, 'B')).toBeNull()
  })

  it("scope 'all' + unknown id -> null (never a fabricated label)", () => {
    expect(accountIndicatorFor('all', ACCOUNTS, 'GONE')).toBeNull()
  })
})
