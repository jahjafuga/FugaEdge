// @vitest-environment jsdom
//
// Beat 4 build A1 — the bounded high-value adoption: MaxLossBanner, the
// P&L tiles (StatStrip via the dollar-Fmt identity seam; EdgeStatStrip's
// dollar figures), BalanceCard, and HeroAccountPanel. DEFAULT-OFF is the
// standing guarantee: with no 'streamer' class the dollars render their
// normal text (asserted here on every surface), so the suite's existing
// dollar assertions never notice the feature. Non-dollar figures (win-rate
// %, counts, the R:R ratio) must NOT carry the marker.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Account } from '@shared/accounts-types'
import type { AccountBalance } from '@shared/cash-types'
import type { KpiStripData } from '@/core/insights/kpiStrip'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    accountsList: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(async () => ({})),
    cashBalanceGet: vi.fn(),
    cashBalanceCombined: vi.fn(),
    cashEventsList: vi.fn(async () => []),
  },
}))

import MaxLossBanner from '@/components/dashboard/MaxLossBanner'
import StatStrip, { moneyOrDash, signedOrDash, pctOrDash } from '@/components/ui/StatStrip'
import EdgeStatStrip from '@/components/intelligence/EdgeStatStrip'
import BalanceCard from '@/components/dashboard/BalanceCard'
import HeroAccountPanel from '@/components/profile/HeroAccountPanel'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

function acct(over: Partial<Account>): Account {
  return {
    id: 'MAIN',
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

const BAL: AccountBalance = {
  account_id: 'MAIN',
  anchor_date: '2026-05-01',
  starting: 1000,
  deposits: 500,
  withdrawals: 200,
  net_pnl: 37.82,
  balance: 1337.82,
}

beforeEach(() => {
  vi.clearAllMocks()
  document.documentElement.classList.remove('streamer')
  m.accountsList.mockResolvedValue([acct({})])
  m.cashBalanceGet.mockResolvedValue(BAL)
  m.cashBalanceCombined.mockResolvedValue({ total: 1337.82, missing_anchor: [] })
  m.cashEventsList.mockResolvedValue([
    {
      id: 'S',
      account_id: 'MAIN',
      kind: 'starting',
      amount: 1000,
      date: '2026-05-01',
      note: null,
      transfer_id: null,
      created_at: '',
    },
  ] as never)
})

function Probe() {
  const { setScope } = useAccountScope()
  return (
    <button type="button" onClick={() => setScope({ accountId: 'MAIN' })}>
      probe-pick
    </button>
  )
}

describe('MaxLossBanner — both dollars carry the mask hook, text intact (default-off)', () => {
  it('marks signed(todayPnl) and money(maxDailyLoss)', () => {
    const { container } = render(
      <MaxLossBanner todayPnl={-600} maxDailyLoss={500} date="2026-07-03" />,
    )
    const masked = container.querySelectorAll('.masked-money')
    expect(masked.length).toBe(2)
    expect(screen.getByText('-$600.00')).toBeTruthy() // default-off: visible text
    expect(screen.getByText('$500.00')).toBeTruthy()
  })
})

describe('StatStrip — the dollar-Fmt identity seam', () => {
  it('dollar tiles (moneyOrDash/signedOrDash) carry the hook; percent tiles do NOT', async () => {
    const { container } = render(
      <StatStrip
        items={[
          { label: 'Net P&L', value: 123.45, format: signedOrDash, tone: 'auto' },
          { label: 'Total fees', value: 9.5, format: moneyOrDash, tone: 'red' },
          { label: 'Win rate', value: 0.62, format: pctOrDash, tone: 'auto' },
        ]}
      />,
    )
    expect(container.querySelectorAll('.masked-money').length).toBe(2)
    // The percent tile carries NO masked node — asserted structurally via
    // its label's card (AnimatedNumber's jsdom settling is not awaited;
    // the seam is the DOM marker, not the animated text).
    const pctCard = screen.getByText('Win rate').closest('div')!.parentElement!
    expect(pctCard.querySelector('.masked-money')).toBeNull()
    const pnlCard = screen.getByText('Net P&L').closest('div')!.parentElement!
    expect(pnlCard.querySelector('.masked-money')).toBeTruthy()
  })
})

describe('EdgeStatStrip — dollar figures mask; the R:R ratio stays', () => {
  it('marks the best-of $ heroes and the avg-win/loss detail, never the ratio', () => {
    const data = {
      bestSymbol: { symbol: 'ODYS', netPnl: 120, trades: 4, winRate: 0.75 },
      bestWeekday: null,
      bestSetup: null,
      bestSession: null,
      payoffRatio: { ratio: 1.42, avgWin: 50, avgLoss: -35 },
      expectancy: { dollars: 12.5, trades: 10 },
    } as unknown as KpiStripData
    const { container } = render(<EdgeStatStrip data={data} loading={false} />)
    // bestSymbol figure + payoff detail + expectancy figure = 3 masked nodes.
    expect(container.querySelectorAll('.masked-money').length).toBe(3)
    expect(screen.getByText('1.42×').closest('.masked-money')).toBeNull()
    expect(screen.getByText('+$120.00')).toBeTruthy() // default-off text intact
  })
})

describe('BalanceCard — headline (via MoneyFigure), breakdown, and flow strip carry the hook', () => {
  it('single scope: the headline and the flow strip are masked-marked, text intact', async () => {
    render(
      <AccountScopeProvider>
        <Probe />
        <BalanceCard />
      </AccountScopeProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('balance-total')).toBeTruthy())
    fireEvent.click(screen.getByText('probe-pick'))
    await waitFor(() =>
      expect(screen.getByTestId('balance-total').textContent).toContain('$1,337.82'),
    )
    expect(
      screen.getByTestId('balance-total').querySelector('.masked-money'),
    ).toBeTruthy()
    const strip = await screen.findByTestId('flow-strip')
    expect(strip.querySelectorAll('.masked-money').length).toBeGreaterThan(0)
    expect(strip.textContent).toContain('$1,000.00') // default-off
  })
})

describe('HeroAccountPanel — the panel dollars carry the hook (default-off text intact)', () => {
  it("'all': the roll-up figure is masked-marked and still readable", async () => {
    render(
      <AccountScopeProvider>
        <HeroAccountPanel />
      </AccountScopeProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('hero-account-panel')).toBeTruthy())
    const panel = screen.getByTestId('hero-account-panel')
    await waitFor(() => expect(panel.textContent).toContain('$1,337.82'))
    expect(panel.querySelector('.masked-money')).toBeTruthy()
  })
})
