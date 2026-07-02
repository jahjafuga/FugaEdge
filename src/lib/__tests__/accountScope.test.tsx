// @vitest-environment jsdom
//
// Multi-account Beat 4 — the account-scope provider: reads the persisted
// 'account_scope' settings key at boot (missing / unknown / deleted id ->
// 'all'), and setScope persists via settingsSave while updating context.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
