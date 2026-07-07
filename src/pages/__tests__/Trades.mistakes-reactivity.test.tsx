// @vitest-environment jsdom
//
// Symptom B (page wiring) — the Trades page must thread a mistakes-change
// callback down to TradesTable and, when the picker fires it with the server's
// updated row, patch that row in `trades` by id — WITHOUT re-fetching the list
// (exactly the optimistic idiom the sibling note/confidence/catalyst handlers
// use). Here TradesTable is stubbed to capture the threaded callback + surface
// each row's mistakes, so the assertion is on Trades.tsx's own wiring + patch
// (the real-chain end-to-end lives in TradeMistakePicker.reactivity.test).

import { render, screen, waitFor, act } from '@testing-library/react'
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

// Capture the callback Trades threads down. vi.hoisted so the mock factory can
// reference the holder safely (it's initialised before the factory runs).
const holder = vi.hoisted(() => ({
  onMistakesChange: undefined as ((updated: TradeListRow) => void) | undefined,
}))
vi.mock('@/components/trades/TradesTable', () => ({
  default: (p: {
    trades: TradeListRow[]
    onMistakesChange?: (updated: TradeListRow) => void
  }) => {
    holder.onMistakesChange = p.onMistakesChange
    return (
      <div data-testid="table-stub">
        {p.trades.map((t) => (
          <div key={t.id} data-testid={`row-${t.id}`}>
            {t.symbol}:{t.mistakes.join(',') || 'none'}
          </div>
        ))}
      </div>
    )
  },
}))
vi.mock('@/components/trades/TradesFilters', () => ({ default: () => null }))
vi.mock('@/components/trades/QuickFilters', () => ({ default: () => null }))
vi.mock('@/components/trades/TradesViewToggle', () => ({ default: () => null }))
vi.mock('@/components/trades/TradeChartCard', () => ({ default: () => null }))
vi.mock('@/components/trades/TradeChartTile', () => ({ default: () => null }))
vi.mock('@/components/data-health/MigrationCollisionsBanner', () => ({ default: () => null }))

import Trades from '../Trades'
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
const ACCOUNTS = [acct({ id: 'A' })]

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
  holder.onMistakesChange = undefined
  installMockLocalStorage()
  m.tradesList.mockResolvedValue([makeTrade({ id: 1, symbol: 'AAA', mistakes: [] })])
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue(ACCOUNTS)
})

describe('Trades — mistakes-change wiring', () => {
  it('threads onMistakesChange to TradesTable and patches the row by id with no list re-fetch', async () => {
    render(
      <MemoryRouter>
        <AccountScopeProvider>
          <Trades />
        </AccountScopeProvider>
      </MemoryRouter>,
    )

    // Initial load: row 1 has no mistakes.
    await waitFor(() => expect(screen.getByTestId('row-1').textContent).toBe('AAA:none'))

    // The page must actually SUPPLY the callback (optional prop — a dropped
    // thread would be a silent undefined).
    expect(typeof holder.onMistakesChange).toBe('function')

    // Firing it with the server's updated row patches that row in place.
    act(() => {
      holder.onMistakesChange!(makeTrade({ id: 1, symbol: 'AAA', mistakes: ['FOMO entry'] }))
    })
    expect(screen.getByTestId('row-1').textContent).toBe('AAA:FOMO entry')

    // Optimistic patch — no second tradesList call (mirrors the sibling handlers).
    expect(m.tradesList).toHaveBeenCalledTimes(1)
  })
})
