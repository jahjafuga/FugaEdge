// @vitest-environment jsdom
//
// Beat 4 build B — THE COMPARE UN-PARK. The growth row's em-dash era ends:
// the denominator is CONTRIBUTED CAPITAL (starting + deposits -
// withdrawals, per account — never the current balance, which would be
// self-referential), derived renderer-side from the shipped cash balance
// channel. Single scope computes over the scoped account's contributed;
// 'all' composes the walled sum over anchored non-sim accounts with
// coverage honesty. No anchor / non-positive contributed -> the em-dash
// stays with an honest subLabel — never Infinity, never NaN. The rendered
// % wears the shipped masked-money marker (a visible P&L beside a visible
// % reconstructs the masked balance with one division).
//
// HISTORY: this file previously pinned the c42c2d6 self-expiring behavior
// (single scope -> em-dash + scopedGrowthNote; 'all' -> % of the app-wide
// account size). Its condition arrived — Stage 3 landed per-account
// balances — so BOTH pins INVERT here and the note retires with them.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { makeTrade } from '@/test/fixtures/trade'
import type { Account } from '@shared/accounts-types'
import type { AccountBalance } from '@shared/cash-types'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
    cashBalanceGet: vi.fn(),
  },
}))

import CompareView from '../CompareView'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

function ScopeProbe({ id }: { id: string }) {
  const { setScope } = useAccountScope()
  return (
    <button type="button" onClick={() => setScope({ accountId: id })}>
      probe-pick-{id}
    </button>
  )
}

// jsdom ships no ResizeObserver; recharts' ResponsiveContainer requires one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

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

function acct(over: Partial<Account>): Account {
  return {
    id: 'MAIN',
    name: 'Main account',
    broker: null,
    account_type: 'margin',
    color: null,
    status: 'active',
    is_default: true,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const ACCOUNTS: Account[] = [
  acct({ id: 'MAIN' }),
  acct({ id: 'OCEAN', name: 'Ocean One', is_default: false }), // unanchored
  acct({ id: 'ARCH', name: 'Old Roth', account_type: 'cash', status: 'archived', is_default: false }),
  acct({ id: 'SIM', name: 'Practice', account_type: 'sim', is_default: false }),
]

function bal(id: string, starting: number, deposits: number, withdrawals: number): AccountBalance {
  return {
    account_id: id,
    anchor_date: '2026-05-01',
    starting,
    deposits,
    withdrawals,
    net_pnl: 0,
    balance: starting + deposits - withdrawals,
  }
}

// MAIN contributed = 1000 + 500 - 200 = 1,300; ARCH = 5,000; OCEAN
// unanchored; SIM poisoned huge (must never enter any sum).
const BALANCES: Record<string, AccountBalance | null> = {
  MAIN: bal('MAIN', 1000, 500, 200),
  OCEAN: null,
  ARCH: bal('ARCH', 5000, 0, 0),
  SIM: bal('SIM', 999_999, 0, 0),
}

beforeEach(() => {
  vi.clearAllMocks()
  installMockLocalStorage()
  document.documentElement.classList.remove('streamer')
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue(ACCOUNTS)
  m.cashBalanceGet.mockImplementation(async (id: string) => BALANCES[id] ?? null)
})

// One closed trade per period, net 130 each — the exact divisions pinned:
// 130 / 1,300 = 10.0% (single MAIN); 130 / 6,300 = 2.1% ('all').
function renderCompare(probeId?: string) {
  render(
    <AccountScopeProvider>
      {probeId && <ScopeProbe id={probeId} />}
      <CompareView
        trades={[
          makeTrade({ id: 1, date: '2026-06-09', net_pnl: 130 }),
          makeTrade({ id: 2, date: '2026-06-02', net_pnl: 130 }),
        ]}
        sentimentByDate={new Map()}
        rangeA={{ from: '2026-06-08', to: '2026-06-14' }}
        rangeB={{ from: '2026-06-01', to: '2026-06-07' }}
        onRangeChange={vi.fn()}
        accountSize={9800}
      />
    </AccountScopeProvider>,
  )
}

const ROW_LABEL = 'Net P&L (% of contributed)'

describe('CompareView — the growth row over contributed capital', () => {
  it('single anchored scope: 130 over 1,300 contributed -> 10.0% with the contributed subLabel (the old em-dash pin INVERTED)', async () => {
    renderCompare('MAIN')
    expect(screen.getByText(ROW_LABEL)).toBeTruthy()
    // Settle the provider's async persisted-scope boot ('all') FIRST — the
    // house scope-refetch discipline — then flip.
    await waitFor(() => expect(screen.getByText(/across 2 of 3 accounts/i)).toBeTruthy())
    fireEvent.click(screen.getByText('probe-pick-MAIN'))
    await waitFor(() => expect(m.cashBalanceGet).toHaveBeenCalledWith('MAIN'))
    await waitFor(() => expect(screen.getByText(/over contributed capital/i)).toBeTruthy())
    await waitFor(() => expect(screen.getAllByText('10.0%').length).toBeGreaterThanOrEqual(2))
  })

  it('an UNANCHORED single scope: the em-dash stays with the honest subLabel', async () => {
    renderCompare('OCEAN')
    await waitFor(() => expect(screen.getByText(/across 2 of 3 accounts/i)).toBeTruthy())
    fireEvent.click(screen.getByText('probe-pick-OCEAN'))
    await waitFor(() => expect(m.cashBalanceGet).toHaveBeenCalledWith('OCEAN'))
    await waitFor(() =>
      expect(screen.getByText(/set a starting balance to track growth/i)).toBeTruthy(),
    )
    expect(screen.queryAllByText('10.0%')).toHaveLength(0)
  })

  it('contributed <= 0 (withdrawals exceed): em-dash, never Infinity or NaN', async () => {
    BALANCES.MAIN = bal('MAIN', 100, 0, 400) // contributed -300
    renderCompare('MAIN')
    await waitFor(() => expect(m.accountsList).toHaveBeenCalled())
    fireEvent.click(screen.getByText('probe-pick-MAIN'))
    await waitFor(() => expect(m.cashBalanceGet).toHaveBeenCalledWith('MAIN'))
    await waitFor(() =>
      expect(screen.getByText(/needs positive contributed capital/i)).toBeTruthy(),
    )
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull()
    BALANCES.MAIN = bal('MAIN', 1000, 500, 200)
  })

  it("'all': the walled composed sum — 130 over 6,300 across 2 of 3 accounts; sim never enters (the old app-wide pin INVERTED)", async () => {
    renderCompare()
    // 130 / 6300 = 0.0206 -> '2.1%' for both periods' cells. The poisoned
    // SIM contributed (999,999) would crush the % toward 0.0 if it leaked.
    await waitFor(() => expect(screen.getAllByText('2.1%').length).toBeGreaterThanOrEqual(2))
    expect(screen.getByText(/across 2 of 3 accounts/i)).toBeTruthy()
    expect(m.cashBalanceGet).not.toHaveBeenCalledWith('SIM')
  })

  it('the growth cells carry the shipped masked-money marker; default-off renders the % plainly', async () => {
    renderCompare()
    await waitFor(() => expect(screen.getAllByText('2.1%').length).toBeGreaterThanOrEqual(2))
    const pct = screen.getAllByText('2.1%')[0]
    expect(pct.closest('.masked-money')).toBeTruthy()
    // Default-off law: no streamer class — the text is the real number.
    expect(document.documentElement.classList.contains('streamer')).toBe(false)
  })
})
