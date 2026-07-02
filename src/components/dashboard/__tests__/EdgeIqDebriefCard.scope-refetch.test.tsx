// @vitest-environment jsdom
//
// Multi-account (Technicals slice, beat 2) — THE MILESTONE CARD: the
// EdgeIqDebriefCard consumes the switcher ONCE and moves all three of its
// data sources together (today's Edge Score, the 30-day fallback score, and
// the day-detail metrics) — killing the mixed-scope hazard for good. Real
// hooks run here (only ipc + dayRepo are mocked) so the flip also proves the
// NEW useTodayEdgeScore scope tag: stale prior-scope rows are never rendered
// — the card shows its loading skeleton until the scoped fetch lands.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DayDetail } from '@shared/day-types'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    listTradesWithTechnicals: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))
vi.mock('@/data/dayRepo', () => ({ dayRepo: { getDayDetail: vi.fn() } }))

import EdgeIqDebriefCard from '../EdgeIqDebriefCard'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'
import { dayRepo } from '@/data/dayRepo'

const m = vi.mocked(ipc)
const mDay = vi.mocked(dayRepo.getDayDetail)

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
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
  // 'all' fetches resolve empty (the 0-trade day); scope-B fetches never
  // resolve — the stale-tag window the guard must cover.
  m.listTradesWithTechnicals.mockImplementation(
    async (opts?: { accountScope?: unknown }) => {
      const scoped =
        opts?.accountScope != null && typeof opts.accountScope === 'object'
      if (scoped) return new Promise<never[]>(() => {})
      return []
    },
  )
  mDay.mockResolvedValue({ metrics: {} } as unknown as DayDetail)
})

describe('EdgeIqDebriefCard — the milestone: all three sources move together', () => {
  it("boots with 'all' on all three fetches, re-fires all three on a flip, and never renders stale-scope rows", async () => {
    const { container } = render(
      <MemoryRouter>
        <AccountScopeProvider>
          <ScopeProbe />
          <EdgeIqDebriefCard />
        </AccountScopeProvider>
      </MemoryRouter>,
    )
    // Boot: both score fetches + the day fetch carry 'all'.
    await waitFor(() => expect(m.listTradesWithTechnicals).toHaveBeenCalledTimes(2))
    for (const call of m.listTradesWithTechnicals.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ accountScope: 'all' }))
    }
    expect(mDay).toHaveBeenCalledWith(expect.any(String), { accountScope: 'all' })
    // The 'all' fetches landed -> the loading skeleton is gone.
    await waitFor(() => expect(container.querySelector('.skeleton')).toBeNull())

    fireEvent.click(screen.getByText('probe-pick-b'))
    // All three re-fire with the new scope.
    await waitFor(() => {
      const scopedCalls = m.listTradesWithTechnicals.mock.calls.filter(
        (c) =>
          JSON.stringify(c[0]?.accountScope) ===
          JSON.stringify({ accountId: 'ACCT-B' }),
      )
      expect(scopedCalls.length).toBe(2)
    })
    expect(mDay).toHaveBeenLastCalledWith(expect.any(String), {
      accountScope: { accountId: 'ACCT-B' },
    })
    // The today tag: scope-B rows haven't landed, so the card must be LOADING
    // — never the prior scope's rendered state.
    await waitFor(() => expect(container.querySelector('.skeleton')).not.toBeNull())
  })
})
