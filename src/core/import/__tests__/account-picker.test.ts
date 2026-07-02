import { describe, it, expect } from 'vitest'
import type { Account } from '@shared/accounts-types'
import { activeAccounts, defaultAccountId, isSimSelected } from '../account-picker'

// Multi-account Beat 3 — pure helpers behind the import account picker.
// The blocked state is TYPE-derived (account_type === 'sim'), replacing the
// old Real/Paper toggle; the default account preselects.

function acct(over: Partial<Account>): Account {
  return {
    id: 'A',
    name: 'Main account',
    broker: null,
    account_type: 'margin',
    color: null,
    status: 'active',
    is_default: false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('activeAccounts', () => {
  it('keeps only status === active, order preserved', () => {
    const list = [
      acct({ id: 'A', is_default: true }),
      acct({ id: 'B', status: 'archived' }),
      acct({ id: 'C' }),
    ]
    expect(activeAccounts(list).map((a) => a.id)).toEqual(['A', 'C'])
  })
})

describe('defaultAccountId', () => {
  it('picks the default account when it is active', () => {
    const list = [acct({ id: 'A' }), acct({ id: 'B', is_default: true })]
    expect(defaultAccountId(list)).toBe('B')
  })

  it('falls back to the first ACTIVE account when no active default exists', () => {
    const list = [acct({ id: 'A', status: 'archived' }), acct({ id: 'B' }), acct({ id: 'C' })]
    expect(defaultAccountId(list)).toBe('B')
  })

  it('null when nothing is active (or the list is empty)', () => {
    expect(defaultAccountId([])).toBeNull()
    expect(defaultAccountId([acct({ id: 'A', status: 'archived' })])).toBeNull()
  })
})

describe('isSimSelected', () => {
  it('true only when the SELECTED account is sim-typed', () => {
    const list = [
      acct({ id: 'A', account_type: 'margin', is_default: true }),
      acct({ id: 'S', account_type: 'sim' }),
    ]
    expect(isSimSelected(list, 'S')).toBe(true)
    expect(isSimSelected(list, 'A')).toBe(false)
    expect(isSimSelected(list, null)).toBe(false)
    expect(isSimSelected(list, 'missing')).toBe(false)
  })
})
