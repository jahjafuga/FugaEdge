// @vitest-environment jsdom
//
// Multi-account (Trades slice) — the Trades page consumes the account scope:
// the list fetch carries it (re-fetch on change, no reload), and the per-row
// account indicator callback is live ONLY under 'all' (hidden for a
// single-account scope). Heavy children are stubbed; the table stub surfaces
// the accountFor prop so the visibility logic is asserted through the real
// page wiring.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import type { Account } from '@shared/accounts-types'
import { makeTrade } from '@/test/fixtures/trade'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    tradesList: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))
vi.mock('@/components/trades/TradesTable', () => ({
  default: (p: {
    trades: TradeListRow[]
    accountFor?: (t: TradeListRow) => { name: string; color: string | null } | null
  }) => (
    <div data-testid="table-stub">
      {p.trades.map((t) => {
        const owner = p.accountFor?.(t) ?? null
        return (
          <div key={t.id} data-testid={`row-${t.id}`}>
            {t.symbol}
            {owner ? ` [${owner.name}]` : ''}
          </div>
        )
      })}
    </div>
  ),
}))
vi.mock('@/components/trades/TradesFilters', () => ({ default: () => null }))
vi.mock('@/components/trades/QuickFilters', () => ({ default: () => null }))
vi.mock('@/components/trades/TradesViewToggle', () => ({ default: () => null }))
vi.mock('@/components/trades/TradeChartCard', () => ({ default: () => null }))
vi.mock('@/components/trades/TradeChartTile', () => ({ default: () => null }))
vi.mock('@/components/data-health/MigrationCollisionsBanner', () => ({ default: () => null }))

import Trades from '../Trades'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
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

const ACCOUNTS = [acct({ id: 'A' }), acct({ id: 'B', name: 'Ocean One', is_default: false, color: '#4f9cf9' })]

function ScopeProbe() {
  const { setScope } = useAccountScope()
  return (
    <button type="button" onClick={() => setScope({ accountId: 'B' })}>
      probe-pick-b
    </button>
  )
}

function installMockLocalStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  installMockLocalStorage()
  m.tradesList.mockResolvedValue([
    makeTrade({ id: 1, account_id: 'A' } as Partial<TradeListRow>),
    makeTrade({ id: 2, symbol: 'GNS', account_id: 'B' } as Partial<TradeListRow>),
  ])
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue(ACCOUNTS)
})

describe('Trades — scope-aware fetching + row indicator', () => {
  it("fetches with 'all', shows per-row account labels, then re-fetches scoped and hides them", async () => {
    render(
      <MemoryRouter>
        <AccountScopeProvider>
          <ScopeProbe />
          <Trades />
        </AccountScopeProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(m.tradesList).toHaveBeenCalled())
    expect(m.tradesList).toHaveBeenCalledWith({ accountScope: 'all' })

    // Under 'all': each row carries its owning-account label.
    await waitFor(() =>
      expect(screen.getByTestId('row-2').textContent).toContain('[Ocean One]'),
    )
    expect(screen.getByTestId('row-1').textContent).toContain('[Main account]')

    // Flip to a single account: re-fetch with the scope; indicator hidden.
    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() =>
      expect(m.tradesList).toHaveBeenLastCalledWith({ accountScope: { accountId: 'B' } }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('row-2').textContent).not.toContain('[Ocean One]'),
    )
  })
})
