// @vitest-environment jsdom
//
// Multi-account Beat 4 — the account-scope provider: reads the persisted
// 'account_scope' settings key at boot (missing / unknown / deleted id ->
// 'all'), and setScope persists via settingsSave while updating context.

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Account } from '@shared/accounts-types'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))

import { AccountScopeProvider, useAccountScope } from '../accountScope'
import { ipc } from '@/lib/ipc'
// Real notifier (NOT mocked) — the provider must subscribe to the same
// module-level pub/sub that TradingAccountsCard fires on an account save.
import { notifyRegistryChanged } from '@/lib/registryChanged'

const m = vi.mocked(ipc)

function acct(over: Partial<Account>): Account {
  return {
    id: 'A',
    name: 'Main account',
    broker: null,
    account_type: 'margin',
    color: null,
    status: 'active',
    is_default: true,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const ACCOUNTS = [acct({ id: 'A' }), acct({ id: 'B', name: 'Ocean One', is_default: false })]

function Probe() {
  const { scope, setScope } = useAccountScope()
  return (
    <div>
      <span data-testid="scope">{scope === 'all' ? 'all' : scope.accountId}</span>
      <button type="button" onClick={() => setScope({ accountId: 'B' })}>
        pick-b
      </button>
    </div>
  )
}

function renderProbe() {
  render(
    <AccountScopeProvider>
      <Probe />
    </AccountScopeProvider>,
  )
}

// Consumer that renders every account's colour from the shared context — the
// SAME source the trades table reads (Trades.tsx useAccountScope().accounts ->
// accountIndicator's accounts.find(id).color). If the provider refreshes on an
// account save, this reflects it without a remount.
function ColourProbe() {
  const { accounts } = useAccountScope()
  return (
    <ul>
      {accounts.map((a) => (
        <li key={a.id} data-testid={`acct-${a.id}`}>
          {a.color ?? 'none'}
        </li>
      ))}
    </ul>
  )
}

function renderColourProbe() {
  render(
    <AccountScopeProvider>
      <ColourProbe />
    </AccountScopeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  m.accountsList.mockResolvedValue(ACCOUNTS)
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
})

describe('AccountScopeProvider', () => {
  it("boots to 'all' when the stored id no longer exists (deleted account fallback)", async () => {
    m.settingsGet.mockResolvedValue(
      makeSettingsPayload({ account_scope: 'GONE-ULID' }),
    )
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('scope').textContent).toBe('all'))
  })

  it('boots to the stored account when it still exists', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'B' }))
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('scope').textContent).toBe('B'))
  })

  it('setScope updates context AND persists via settingsSave({ account_scope })', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('scope').textContent).toBe('all'))
    fireEvent.click(screen.getByText('pick-b'))
    expect(screen.getByTestId('scope').textContent).toBe('B')
    await waitFor(() =>
      expect(m.settingsSave).toHaveBeenCalledWith({ account_scope: 'B' }),
    )
  })
})

// Dave's symptom: an account colour saved in Settings did not reach the trades
// table until restart, because the provider loaded the account list once and
// never refetched. TradingAccountsCard already fires notifyRegistryChanged() on
// every account mutation; the provider must subscribe and reload so the shared
// context (and every consumer, incl. the trades table) re-resolves colours
// without a remount. Covers CHANGE / ADD / REMOVE ("adding, changing, removing").
describe('AccountScopeProvider — refetches the account list on registryChanged', () => {
  beforeEach(() => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  })

  it('CHANGE: a saved colour updates the context without a remount', async () => {
    m.accountsList.mockReset()
    m.accountsList
      .mockResolvedValueOnce([acct({ id: 'A', color: '#111111' })]) // boot load
      .mockResolvedValue([acct({ id: 'A', color: '#22ff22' })]) // after the signal
    renderColourProbe()

    await waitFor(() => expect(screen.getByTestId('acct-A').textContent).toBe('#111111'))

    // an account colour was saved elsewhere -> the registry announces
    await act(async () => {
      notifyRegistryChanged()
    })

    await waitFor(() => expect(screen.getByTestId('acct-A').textContent).toBe('#22ff22'))
  })

  it('ADD: a newly created account appears after the signal', async () => {
    m.accountsList.mockReset()
    m.accountsList
      .mockResolvedValueOnce([acct({ id: 'A', color: '#111111' })])
      .mockResolvedValue([
        acct({ id: 'A', color: '#111111' }),
        acct({ id: 'B', name: 'Swing', color: '#4f9cf9', is_default: false }),
      ])
    renderColourProbe()

    await waitFor(() => expect(screen.getByTestId('acct-A').textContent).toBe('#111111'))
    expect(screen.queryByTestId('acct-B')).toBeNull()

    await act(async () => {
      notifyRegistryChanged()
    })

    await waitFor(() => expect(screen.getByTestId('acct-B').textContent).toBe('#4f9cf9'))
  })

  it('REMOVE: a deleted account drops after the signal', async () => {
    m.accountsList.mockReset()
    m.accountsList
      .mockResolvedValueOnce([
        acct({ id: 'A', color: '#111111' }),
        acct({ id: 'B', name: 'Swing', color: '#4f9cf9', is_default: false }),
      ])
      .mockResolvedValue([acct({ id: 'A', color: '#111111' })])
    renderColourProbe()

    await waitFor(() => expect(screen.getByTestId('acct-B').textContent).toBe('#4f9cf9'))

    await act(async () => {
      notifyRegistryChanged()
    })

    await waitFor(() => expect(screen.queryByTestId('acct-B')).toBeNull())
  })
})
