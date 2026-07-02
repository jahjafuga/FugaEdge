// @vitest-environment jsdom
//
// Multi-account Beat 4 — the TopBar account switcher. Logic assertions:
// trigger reflects the selection ("All accounts" default), actives listed
// with type labels, archived accounts SELECTABLE under a dimmed "Archived"
// divider group, sim entries carry their "(practice)" label, and selecting
// persists through the provider (settingsSave). Presentation is eyes-gated.

import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
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

import AccountSwitcher from '../AccountSwitcher'
import { AccountScopeProvider } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

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

const ACCOUNTS: Account[] = [
  acct({ id: 'A', name: 'Main account' }),
  acct({ id: 'S', name: 'Practice', account_type: 'sim', is_default: false, color: '#a78bfa' }),
  acct({ id: 'X', name: 'Schwab Roth', account_type: 'roth_ira', status: 'archived', is_default: false }),
]

async function renderSwitcher() {
  render(
    <AccountScopeProvider>
      <AccountSwitcher />
    </AccountScopeProvider>,
  )
  return await screen.findByRole('button', { name: /account scope/i })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue(ACCOUNTS)
})

describe('AccountSwitcher', () => {
  it('the trigger reads "All accounts" by default and opens the menu', async () => {
    const trigger = await renderSwitcher()
    expect(trigger.textContent).toContain('All accounts')
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('lists All accounts + actives (with type labels), archived under the "Archived" divider', async () => {
    const trigger = await renderSwitcher()
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /all accounts/i })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: /main account/i })).toBeTruthy()
    // Sim entry carries its practice label.
    expect(within(menu).getByRole('menuitem', { name: /practice/i }).textContent).toContain(
      'Sim (practice)',
    )
    // Archived divider + the archived account UNDER it, still selectable.
    expect(within(menu).getByText('Archived')).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: /schwab roth/i })).toBeTruthy()
  })

  it('selecting an account persists the scope and updates the trigger', async () => {
    const trigger = await renderSwitcher()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: /main account/i }))
    await waitFor(() =>
      expect(m.settingsSave).toHaveBeenCalledWith({ account_scope: 'A' }),
    )
    expect((await screen.findByRole('button', { name: /account scope/i })).textContent).toContain(
      'Main account',
    )
    expect(screen.queryByRole('menu')).toBeNull() // closed after pick
  })

  it('an ARCHIVED account is selectable (persists its id)', async () => {
    const trigger = await renderSwitcher()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: /schwab roth/i }))
    await waitFor(() =>
      expect(m.settingsSave).toHaveBeenCalledWith({ account_scope: 'X' }),
    )
  })
})
