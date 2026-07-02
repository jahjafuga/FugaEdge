// @vitest-environment jsdom
//
// Multi-account micro-slice — Today's Session joins the switcher (ruled: a
// Dashboard card ignoring the scope while the page obeys is the two-calendars
// inconsistency class). The hook's two account-relevant fetches (today's
// trades + the month calendar union) carry the scope and re-fire on change;
// the day-metadata calls (sessionGet / sessionListAll / journalGet) stay
// account-blind by design. No memoization exists on these paths.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    tradesList: vi.fn(),
    sessionGet: vi.fn(),
    sessionListAll: vi.fn(),
    journalGet: vi.fn(),
    calendarGet: vi.fn(),
    sessionNoTradeSave: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))

import { useTodaySession } from '../useTodaySession'
import { AccountScopeProvider, useAccountScope } from '../accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

function Host() {
  const { status } = useTodaySession()
  const { setScope } = useAccountScope()
  return (
    <div>
      <span data-testid="status">{status.status}</span>
      <button type="button" onClick={() => setScope({ accountId: 'ACCT-B' })}>
        probe-pick-b
      </button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  m.tradesList.mockResolvedValue([])
  m.sessionGet.mockResolvedValue(null)
  m.sessionListAll.mockResolvedValue([])
  m.journalGet.mockResolvedValue(null as never)
  m.calendarGet.mockResolvedValue({ days: [] } as never)
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
})

describe("useTodaySession — scope threading (absent/initial -> 'all')", () => {
  it('both account-relevant fetches carry the scope and re-fire on a flip', async () => {
    render(
      <AccountScopeProvider>
        <Host />
      </AccountScopeProvider>,
    )
    await waitFor(() => expect(m.tradesList).toHaveBeenCalled())
    expect(m.tradesList).toHaveBeenCalledWith({
      date: expect.any(String),
      accountScope: 'all',
    })
    const firstCal = m.calendarGet.mock.calls[0]
    expect(firstCal[2]).toBe('all')

    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() => {
      expect(m.tradesList).toHaveBeenLastCalledWith({
        date: expect.any(String),
        accountScope: { accountId: 'ACCT-B' },
      })
    })
    const lastCal = m.calendarGet.mock.calls[m.calendarGet.mock.calls.length - 1]
    expect(lastCal[2]).toEqual({ accountId: 'ACCT-B' })
  })
})
