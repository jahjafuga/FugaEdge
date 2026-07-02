// @vitest-environment jsdom
//
// Multi-account — the Intelligence page inside the scope provider: a switcher
// flip re-fires the insights assembly (the four insights-fed cards re-tell
// the scoped story) AND, since Technicals beat 1, the Edge Score fetch — the
// Insights slice's expected-stillness pin RETIRED by that beat's ruling
// (ScoreCard/RadarCard joined the switcher; the fetch now carries the scope).

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

describe('Intelligence — scope-aware insights AND Edge Score (beat-1 inversion)', () => {
  it('the insights fetch and the Edge Score fetch both follow the switcher', async () => {
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
    await waitFor(() =>
      expect(m.listTradesWithTechnicals).toHaveBeenCalledWith(
        expect.objectContaining({ accountScope: 'all' }),
      ),
    )

    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() =>
      expect(m.tradesList).toHaveBeenLastCalledWith({
        accountScope: { accountId: 'ACCT-B' },
      }),
    )
    // THE INVERSION (Technicals beat 1) — the Edge Score fetch re-fires with
    // the new scope; the Insights slice's stillness pin is retired.
    await waitFor(() =>
      expect(m.listTradesWithTechnicals).toHaveBeenLastCalledWith(
        expect.objectContaining({ accountScope: { accountId: 'ACCT-B' } }),
      ),
    )
  })
})
