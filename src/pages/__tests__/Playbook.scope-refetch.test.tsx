// @vitest-environment jsdom
//
// Multi-account (Playbook slice) — the Playbook page consumes the account
// scope: the list fetch carries it and a switcher flip re-fetches (the
// Intelligence.scope-refetch mirror). Definitions render identically under
// every scope; only the stats numbers move — that half is eyes-gated.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    playbooksList: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))

import Playbook from '../Playbook'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

function ScopeProbe() {
  const { setScope } = useAccountScope()
  return (
    <button type="button" onClick={() => setScope({ accountId: 'ACCT-B' })}>
      probe-pick-b
    </button>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  m.playbooksList.mockResolvedValue([])
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
})

describe('Playbook — scope-aware stats fetching', () => {
  it("fetches with 'all' at boot and re-fetches with the new scope on a switcher flip", async () => {
    render(
      <MemoryRouter>
        <AccountScopeProvider>
          <ScopeProbe />
          <Playbook />
        </AccountScopeProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(m.playbooksList).toHaveBeenCalled())
    expect(m.playbooksList).toHaveBeenCalledWith({ accountScope: 'all' })

    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() =>
      expect(m.playbooksList).toHaveBeenLastCalledWith({
        accountScope: { accountId: 'ACCT-B' },
      }),
    )
  })
})
