// @vitest-environment jsdom
//
// Multi-account micro-slice — the Compare tab's account-growth honesty rule:
// under ANY single-account scope the 'Net P&L (% of account size)' verdict
// row renders the house em-dash with the approved note (its denominator is
// the APP-WIDE account size — scoped P&L over an app-wide base would
// fabricate a per-account growth number); under 'all' it computes exactly as
// today (regression pin). Self-expiring by design: revisited when Stage 3
// lands per-account balances. The 'Account growth $' row is a display alias
// of the (already scoped) period net P&L — honest under every scope,
// untouched.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { makeTrade } from '@/test/fixtures/trade'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))

import CompareView from '../CompareView'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { accountStrings } from '@/components/accounts/strings'
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

beforeEach(() => {
  vi.clearAllMocks()
  installMockLocalStorage()
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
})

// One closed trade per period (the empty guard needs both sides non-zero).
// net 98 over a 9800 account size -> exactly '1.0%' from the pct formatter
// ((v*100).toFixed(1)) — unique to the growth row's A/B cells in this render.
function renderCompare() {
  render(
    <AccountScopeProvider>
      <ScopeProbe />
      <CompareView
        trades={[
          makeTrade({ id: 1, date: '2026-06-09' }),
          makeTrade({ id: 2, date: '2026-06-02' }),
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

const NOTE = accountStrings.compare.scopedGrowthNote

describe('CompareView — account-growth row honesty under scope', () => {
  it("'all': the % row computes as today (98 net over 9800 -> 1.0%) and the note is absent", async () => {
    renderCompare()
    expect(screen.getByText('Net P&L (% of account size)')).toBeTruthy()
    // netPnlPctOfAccount(98, 9800) = 0.01 -> '1.0%', for BOTH periods' cells.
    await waitFor(() => expect(screen.getAllByText('1.0%').length).toBeGreaterThanOrEqual(2))
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('a single-account scope: em-dash (metric NOT displayed) + the approved note', async () => {
    renderCompare()
    await waitFor(() => expect(screen.getAllByText('1.0%').length).toBeGreaterThanOrEqual(2))

    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() => expect(screen.queryAllByText('1.0%')).toHaveLength(0))
    expect(screen.getByText(NOTE)).toBeTruthy()
    // The row label survives — only its value is withheld.
    expect(screen.getByText('Net P&L (% of account size)')).toBeTruthy()
  })
})
