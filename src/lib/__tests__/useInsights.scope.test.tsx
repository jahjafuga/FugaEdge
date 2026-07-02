// @vitest-environment jsdom
//
// Multi-account (Insights slice, Option A — narrow) — the useInsights ASSEMBLY
// scopes at input time: the trades fetch carries the active scope through the
// seam (absent/initial -> 'all'; the non-sim wall itself is the channel's and
// is pinned in electron/trades/__tests__/list-scope.test.ts). The OTHER two
// fetches are untouched BY DESIGN and pinned so: sessionListAll (day-metadata
// sentiment) and dashboardGet -> discipline_streak (GLOBAL identity ruling).
// Window-within-scope is pinned structurally: the client-side last-N window
// filters the SCOPED fetch's rows — never a global window filtered after.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    tradesList: vi.fn(),
    sessionListAll: vi.fn(),
    dashboardGet: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))

import { useInsights } from '../useInsights'
import { AccountScopeProvider, useAccountScope } from '../accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

// Recent = inside every last-N window; ancient = outside all of them.
const RECENT = '2026-07-01'
const ANCIENT = '2020-01-01'

function Host() {
  const { windowedTrades, loading } = useInsights()
  const { setScope } = useAccountScope()
  return (
    <div>
      <span data-testid="windowed">
        {loading ? 'loading' : windowedTrades.map((t) => t.symbol).join(',')}
      </span>
      <button type="button" onClick={() => setScope({ accountId: 'B' })}>
        probe-pick-b
      </button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  m.sessionListAll.mockResolvedValue([])
  m.dashboardGet.mockResolvedValue({ discipline_streak: 3 } as never)
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
})

describe('useInsights — scoped input assembly', () => {
  it("initial fetch carries 'all' through the seam; the two global fetches stay untouched", async () => {
    m.tradesList.mockResolvedValue([])
    render(
      <AccountScopeProvider>
        <Host />
      </AccountScopeProvider>,
    )
    await waitFor(() => expect(m.tradesList).toHaveBeenCalled())
    expect(m.tradesList).toHaveBeenCalledWith({ accountScope: 'all' })
    // Untouched by design (pinned): day-metadata sentiment, argless…
    expect(m.sessionListAll).toHaveBeenCalledWith()
    // …and the GLOBAL discipline-streak read — range only, NO scope arg.
    expect(m.dashboardGet).toHaveBeenCalledWith('all')
  })

  it('a scope flip re-fetches scoped, and the window filters WITHIN the scoped rows', async () => {
    // 'all' serves one recent combined row; account B serves its own recent
    // row + an ancient one that the 90d window must drop.
    m.tradesList.mockImplementation(async (opts?: { accountScope?: unknown }) => {
      const scoped =
        opts?.accountScope != null &&
        typeof opts.accountScope === 'object'
      if (scoped) {
        return [
          makeTrade({ id: 21, symbol: 'BBB-RECENT', date: RECENT, account_id: 'B' } as Partial<TradeListRow>),
          makeTrade({ id: 22, symbol: 'BBB-ANCIENT', date: ANCIENT, account_id: 'B' } as Partial<TradeListRow>),
        ]
      }
      return [makeTrade({ id: 11, symbol: 'ALL-RECENT', date: RECENT } as Partial<TradeListRow>)]
    })

    render(
      <AccountScopeProvider>
        <Host />
      </AccountScopeProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('windowed').textContent).toBe('ALL-RECENT'),
    )

    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() =>
      expect(m.tradesList).toHaveBeenLastCalledWith({
        accountScope: { accountId: 'B' },
      }),
    )
    // The window ran over the SCOPED fetch: B's recent row in, B's ancient row
    // dropped, and nothing from the 'all' fetch lingers.
    await waitFor(() =>
      expect(screen.getByTestId('windowed').textContent).toBe('BBB-RECENT'),
    )
  })
})
