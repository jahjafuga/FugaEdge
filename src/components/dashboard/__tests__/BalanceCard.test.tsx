// @vitest-environment jsdom
//
// Stage 3 beat 3 — the Dashboard balance card (the balance HOME). Scope-
// following per the house idiom ([scope] refetch, cancelled-flag guard):
// single scope renders that account's balance through money(); 'all'
// renders the walled roll-up + the coverage-honest across-N(-of-M) subline
// + the per-account breakdown (sim ABSENT, archived DIMMED, unanchored
// em-dash). NULL -> em-dash + the set-starting hint, never 0. Layout and
// copy are eyes-gated.

import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Account } from '@shared/accounts-types'
import type { AccountBalance } from '@shared/cash-types'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    accountsList: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(async () => ({})),
    cashBalanceGet: vi.fn(),
    cashBalanceCombined: vi.fn(),
  },
}))

import BalanceCard from '../BalanceCard'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

function acct(over: Partial<Account>): Account {
  return {
    id: 'MAIN',
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

const ACCOUNTS: Account[] = [
  acct({ id: 'MAIN' }),
  acct({ id: 'OCEAN', name: 'Ocean One', is_default: false }),
  acct({ id: 'ARCH', name: 'Old Roth', account_type: 'roth_ira', status: 'archived', is_default: false }),
  acct({ id: 'SIM', name: 'Practice', account_type: 'sim', is_default: false }),
]

const BALANCES: Record<string, AccountBalance | null> = {
  MAIN: {
    account_id: 'MAIN',
    anchor_date: '2026-05-01',
    starting: 1000,
    deposits: 0,
    withdrawals: 0,
    net_pnl: 37.82,
    balance: 1037.82,
  },
  OCEAN: null,
  ARCH: {
    account_id: 'ARCH',
    anchor_date: '2026-02-01',
    starting: 5000,
    deposits: 0,
    withdrawals: 0,
    net_pnl: 0,
    balance: 5000,
  },
  SIM: {
    account_id: 'SIM',
    anchor_date: '2026-03-01',
    starting: 100,
    deposits: 0,
    withdrawals: 0,
    net_pnl: 0,
    balance: 100,
  },
}

function Probe({ id }: { id: string }) {
  const { setScope } = useAccountScope()
  return (
    <button type="button" onClick={() => setScope({ accountId: id })}>
      probe-pick-{id}
    </button>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  m.accountsList.mockResolvedValue(ACCOUNTS)
  m.cashBalanceGet.mockImplementation(async (id: string) => BALANCES[id] ?? null)
  m.cashBalanceCombined.mockResolvedValue({
    total: 6037.82,
    missing_anchor: ['OCEAN'],
  })
})

describe('BalanceCard — the all-scope roll-up', () => {
  it('renders the walled total, the across-N-of-M coverage subline, and the breakdown (sim absent, archived dimmed, unanchored em-dash)', async () => {
    render(
      <AccountScopeProvider>
        <BalanceCard />
      </AccountScopeProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('balance-total')).toBeTruthy())
    expect(screen.getByTestId('balance-total').textContent).toContain('$6,037.82')
    // Coverage-honest: 2 anchored of 3 non-sim accounts (OCEAN unanchored).
    expect(screen.getByText(/across 2 of 3 accounts/i)).toBeTruthy()
    // Breakdown: MAIN + ARCH + OCEAN rows; SIM structurally absent.
    expect(within(screen.getByTestId('balance-row-MAIN')).getByText('$1,037.82')).toBeTruthy()
    const arch = screen.getByTestId('balance-row-ARCH')
    expect(arch.className).toMatch(/opacity/)
    expect(within(screen.getByTestId('balance-row-OCEAN')).getByText('—')).toBeTruthy()
    expect(screen.queryByTestId('balance-row-SIM')).toBeNull()
  })
})

describe('BalanceCard — single scope', () => {
  it('flip -> refetches with the new scope and renders that account through money()', async () => {
    render(
      <AccountScopeProvider>
        <Probe id="MAIN" />
        <BalanceCard />
      </AccountScopeProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('balance-total')).toBeTruthy())
    fireEvent.click(screen.getByText('probe-pick-MAIN'))
    await waitFor(() => expect(m.cashBalanceGet).toHaveBeenCalledWith('MAIN'))
    await waitFor(() =>
      expect(screen.getByTestId('balance-total').textContent).toContain('$1,037.82'),
    )
  })

  it('NULL balance -> the em-dash + the set-starting hint, NEVER 0', async () => {
    render(
      <AccountScopeProvider>
        <Probe id="OCEAN" />
        <BalanceCard />
      </AccountScopeProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('balance-total')).toBeTruthy())
    fireEvent.click(screen.getByText('probe-pick-OCEAN'))
    await waitFor(() =>
      expect(screen.getByTestId('balance-total').textContent).toContain('—'),
    )
    expect(screen.getByTestId('balance-total').textContent).not.toContain('0')
    expect(screen.getByText(/set starting balance in settings/i)).toBeTruthy()
  })
})
