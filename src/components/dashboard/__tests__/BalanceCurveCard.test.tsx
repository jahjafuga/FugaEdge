// @vitest-environment jsdom
//
// Stage 3 beat 3 — the balance-over-time curve card, a SIBLING of the
// Cumulative P&L curve (its own file; the P&L card untouched). Fetches the
// series channel with the scope, refetches on flip, honest empty state on
// an empty series. Chart styling is eyes-gated (the line is GOLD — balance
// is not P&L).

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// recharts measures its container — stub ResizeObserver (the house
// precedent from the CompareView tests).
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO

vi.mock('@/lib/ipc', () => ({
  ipc: {
    accountsList: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(async () => ({})),
    cashBalanceSeries: vi.fn(),
  },
}))

import BalanceCurveCard from '../BalanceCurveCard'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

function Probe() {
  const { setScope } = useAccountScope()
  return (
    <button type="button" onClick={() => setScope({ accountId: 'ACCT-B' })}>
      probe-pick-b
    </button>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  m.accountsList.mockResolvedValue([])
  m.cashBalanceSeries.mockResolvedValue([
    { date: '2026-05-01', balance: 1000 },
    { date: '2026-07-03', balance: 1037.82 },
  ])
})

describe('BalanceCurveCard — the scope-following series', () => {
  it("fetches the series with 'all' at boot and renders the chart", async () => {
    render(
      <AccountScopeProvider>
        <BalanceCurveCard />
      </AccountScopeProvider>,
    )
    await waitFor(() => expect(m.cashBalanceSeries).toHaveBeenCalledWith('all'))
    await waitFor(() => expect(screen.getByTestId('balance-curve')).toBeTruthy())
  })

  it('a scope flip refetches with the new scope', async () => {
    render(
      <AccountScopeProvider>
        <Probe />
        <BalanceCurveCard />
      </AccountScopeProvider>,
    )
    await waitFor(() => expect(m.cashBalanceSeries).toHaveBeenCalledWith('all'))
    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() =>
      expect(m.cashBalanceSeries).toHaveBeenLastCalledWith({ accountId: 'ACCT-B' }),
    )
  })

  it('an empty series renders the honest empty state (no chart)', async () => {
    m.cashBalanceSeries.mockResolvedValue([])
    render(
      <AccountScopeProvider>
        <BalanceCurveCard />
      </AccountScopeProvider>,
    )
    await waitFor(() => expect(screen.getByText(/no balance history/i)).toBeTruthy())
    expect(screen.queryByTestId('balance-curve')).toBeNull()
  })
})
