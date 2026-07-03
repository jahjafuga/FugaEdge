// @vitest-environment jsdom
//
// Stage 3 beat 3 — the hero account panel: the Profile hero's right side
// follows the switcher (broker, details, the COMPUTED LEDGER balance)
// while identity content (XP/level) stays GLOBAL and still. Includes the
// sanctioned ride-along pin: the handle renders with EXACTLY ONE '@'
// (ProfileHero.tsx:84 doubled a stored '@'). Layout and copy eyes-gated.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Account } from '@shared/accounts-types'
import type { AccountBalance } from '@shared/cash-types'
import type { Profile } from '@shared/identity-types'
import type { XpSummary } from '@shared/xp-types'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    accountsList: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(async () => ({})),
    cashBalanceGet: vi.fn(),
    cashBalanceCombined: vi.fn(),
  },
}))

import ProfileHero from '../ProfileHero'
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

const ACCOUNTS: Account[] = [
  acct({ id: 'MAIN' }),
  acct({ id: 'OCEAN', name: 'Ocean One', broker: 'DAS', is_default: false }),
  acct({ id: 'SIM', name: 'Practice', account_type: 'sim', is_default: false }),
]

const BALANCES: Record<string, AccountBalance | null> = {
  MAIN: {
    account_id: 'MAIN',
    anchor_date: '2026-05-01',
    starting: 1000,
    deposits: 0,
    withdrawals: 0,
    net_pnl: 37.82,
    balance: 1037.82,
  },
  OCEAN: {
    account_id: 'OCEAN',
    anchor_date: '2026-07-03',
    starting: 5000,
    deposits: 0,
    withdrawals: 0,
    net_pnl: 0,
    balance: 5000,
  },
  SIM: {
    account_id: 'SIM',
    anchor_date: '2026-07-03',
    starting: 100,
    deposits: 0,
    withdrawals: 0,
    net_pnl: 0,
    balance: 100,
  },
}

// The stored handle ALREADY carries '@' — the pre-fix render doubled it.
const PROFILE = {
  display_name: 'Lao',
  handle: '@jahjafuga',
  trading_style: null,
  member_since: '2026-01',
  bio: null,
  avatar_path: null,
  featured_badges: [],
} as unknown as Profile

const SUMMARY = {
  totalXp: 4321,
  level: 7,
  intoLevel: 21,
  neededForNext: 179,
} as unknown as XpSummary

function Probe({ id }: { id: string }) {
  const { setScope } = useAccountScope()
  return (
    <button type="button" onClick={() => setScope({ accountId: id })}>
      probe-pick-{id}
    </button>
  )
}

function renderHero(probeId?: string) {
  return render(
    <AccountScopeProvider>
      {probeId && <Probe id={probeId} />}
      <ProfileHero profile={PROFILE} summary={SUMMARY} emblem={null} onAvatarUpdated={() => {}} />
    </AccountScopeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  m.accountsList.mockResolvedValue(ACCOUNTS)
  m.cashBalanceGet.mockImplementation(async (id: string) => BALANCES[id] ?? null)
  m.cashBalanceCombined.mockResolvedValue({ total: 6037.82, missing_anchor: [] })
})

describe('ProfileHero — the account panel follows the switcher', () => {
  it("'all' shows the walled roll-up + the across-N subline", async () => {
    renderHero()
    await waitFor(() => expect(screen.getByTestId('hero-account-panel')).toBeTruthy())
    const panel = screen.getByTestId('hero-account-panel')
    expect(panel.textContent).toContain('$6,037.82')
    expect(panel.textContent).toMatch(/across 2 accounts/i)
  })

  it('a single scope shows dot/name/broker/type label/balance', async () => {
    renderHero('OCEAN')
    await waitFor(() => expect(screen.getByTestId('hero-account-panel')).toBeTruthy())
    fireEvent.click(screen.getByText('probe-pick-OCEAN'))
    await waitFor(() => expect(m.cashBalanceGet).toHaveBeenCalledWith('OCEAN'))
    const panel = screen.getByTestId('hero-account-panel')
    await waitFor(() => expect(panel.textContent).toContain('$5,000.00'))
    expect(panel.textContent).toContain('Ocean One')
    expect(panel.textContent).toContain('DAS')
    expect(panel.textContent).toMatch(/margin/i)
  })

  it('a sim scope shows the practice ledger, practice-marked', async () => {
    renderHero('SIM')
    await waitFor(() => expect(screen.getByTestId('hero-account-panel')).toBeTruthy())
    fireEvent.click(screen.getByText('probe-pick-SIM'))
    const panel = screen.getByTestId('hero-account-panel')
    await waitFor(() => expect(panel.textContent).toContain('$100.00'))
    expect(panel.textContent).toMatch(/sim \(practice\)/i)
  })

  it("the handle renders with EXACTLY ONE '@' (the ride-along)", async () => {
    const { container } = renderHero()
    await waitFor(() => expect(screen.getByText('@jahjafuga')).toBeTruthy())
    expect(container.textContent).not.toContain('@@')
  })

  it('identity content NEVER moves on a scope flip (the LVL chip is scope-independent)', async () => {
    renderHero('SIM')
    await waitFor(() => expect(screen.getByTestId('hero-account-panel')).toBeTruthy())
    const lvlBefore = screen.getByText(/lvl/i).textContent
    fireEvent.click(screen.getByText('probe-pick-SIM'))
    await waitFor(() =>
      expect(screen.getByTestId('hero-account-panel').textContent).toContain('$100.00'),
    )
    expect(screen.getByText(/lvl/i).textContent).toBe(lvlBefore)
  })
})
