// @vitest-environment jsdom
//
// Multi-account (Insights slice, Option A — narrow) — the Intelligence page
// inside the scope provider: a switcher flip re-fires the insights assembly
// (the four insights-fed cards re-tell the scoped story), while the
// technicals-backed Edge Score fetch does NOT react — the EXPECTED STILLNESS
// of the ruled boundary (ScoreCard/RadarCard + WorkedLeakedSummary join the
// Technicals slice, which also enumerates electron/day).

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    tradesList: vi.fn(),
    sessionListAll: vi.fn(),
    dashboardGet: vi.fn(),
    listTradesWithTechnicals: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))
vi.mock('@/components/intelligence/HeroCards', () => ({ default: () => null }))
vi.mock('@/components/intelligence/TradingCoachCard', () => ({ default: () => null }))
vi.mock('@/components/intelligence/ScoreCard', () => ({ default: () => null }))
vi.mock('@/components/intelligence/RadarCard', () => ({ default: () => null }))
vi.mock('@/components/intelligence/WorkedLeakedSummary', () => ({ default: () => null }))
vi.mock('@/components/intelligence/EdgeStatStrip', () => ({ default: () => null }))
vi.mock('@/components/intelligence/TraderDnaCard', () => ({ default: () => null }))

import Intelligence from '../Intelligence'
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
  m.tradesList.mockResolvedValue([])
  m.sessionListAll.mockResolvedValue([])
  m.dashboardGet.mockResolvedValue({ discipline_streak: 0 } as never)
  m.listTradesWithTechnicals.mockResolvedValue([])
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
})

describe('Intelligence — scope-aware insights, boundary-still technicals', () => {
  it("the insights fetch follows the switcher; the Edge Score fetch does not (ruled boundary)", async () => {
    render(
      <MemoryRouter>
        <AccountScopeProvider>
          <ScopeProbe />
          <Intelligence />
        </AccountScopeProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(m.tradesList).toHaveBeenCalled())
    expect(m.tradesList).toHaveBeenCalledWith({ accountScope: 'all' })
    await waitFor(() => expect(m.listTradesWithTechnicals).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() =>
      expect(m.tradesList).toHaveBeenLastCalledWith({
        accountScope: { accountId: 'ACCT-B' },
      }),
    )
    // EXPECTED STILLNESS — the technicals fetch fired once and only once.
    expect(m.listTradesWithTechnicals).toHaveBeenCalledTimes(1)
  })
})
