// @vitest-environment jsdom
//
// Stage 3 beat 2 — the Settings 'Balances' card: per-account computed
// balances through the money helpers (NULL -> em-dash + affordance, never
// 0), add/delete event flows with memo, the two confirms (un-anchor +
// transfer pair), the same-realm transfer form, pre-anchor + no-anchor
// honesty, and the archived divider + practice marker. IPC boundary mocked;
// layout and copy are eyes-gated.

import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Account } from '@shared/accounts-types'
import type { AccountBalance, CashEvent } from '@shared/cash-types'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    accountsList: vi.fn(),
    cashEventsList: vi.fn(),
    cashEventCreate: vi.fn(),
    cashEventDelete: vi.fn(),
    cashTransferCreate: vi.fn(),
    cashTransferDelete: vi.fn(),
    cashBalanceGet: vi.fn(),
  },
}))

import BalancesCard from '../BalancesCard'
import { ipc } from '@/lib/ipc'
import { notifyRegistryChanged } from '@/lib/registryChanged'

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
  acct({ id: 'MAIN', name: 'Main account' }),
  acct({ id: 'OCEAN', name: 'Ocean One', is_default: false }),
  acct({ id: 'ARCH', name: 'Old Roth', account_type: 'roth_ira', status: 'archived', is_default: false }),
  acct({ id: 'SIM', name: 'Practice', account_type: 'sim', is_default: false }),
]

const BALANCES: Record<string, AccountBalance | null> = {
  MAIN: {
    account_id: 'MAIN',
    anchor_date: '2026-01-01',
    starting: 1000,
    deposits: 200,
    withdrawals: 50,
    net_pnl: -112.18,
    balance: 1037.82,
  },
  OCEAN: null,
  ARCH: {
    account_id: 'ARCH',
    anchor_date: '2026-02-01',
    starting: 500,
    deposits: 0,
    withdrawals: 0,
    net_pnl: 0,
    balance: 500,
  },
  SIM: {
    account_id: 'SIM',
    anchor_date: '2026-03-01',
    starting: 100,
    deposits: 0,
    withdrawals: 0,
    net_pnl: 0,
    balance: 100,
  },
}

const EVENTS: CashEvent[] = [
  {
    id: 'EV-START',
    account_id: 'MAIN',
    kind: 'starting',
    amount: 1000,
    date: '2026-01-01',
    note: 'initial',
    transfer_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'EV-DEP',
    account_id: 'MAIN',
    kind: 'deposit',
    amount: 200,
    date: '2026-05-01',
    note: 'lunch money',
    transfer_id: null,
    created_at: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'EV-LEG',
    account_id: 'MAIN',
    kind: 'withdrawal',
    amount: 50,
    date: '2026-06-01',
    note: 'rebalance',
    transfer_id: 'T-1',
    created_at: '2026-06-01T00:00:00.000Z',
  },
]

function section(id: string) {
  return screen.getByTestId(`balances-account-${id}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  m.accountsList.mockResolvedValue(ACCOUNTS)
  m.cashEventsList.mockResolvedValue(EVENTS)
  m.cashBalanceGet.mockImplementation(async (id: string) => BALANCES[id] ?? null)
  m.cashEventCreate.mockResolvedValue(EVENTS[1])
  m.cashEventDelete.mockResolvedValue(undefined as never)
  m.cashTransferCreate.mockResolvedValue({
    transfer_id: 'T-9',
    from_event: EVENTS[2],
    to_event: EVENTS[1],
  } as never)
  m.cashTransferDelete.mockResolvedValue(undefined as never)
})

async function renderCard() {
  render(<BalancesCard />)
  await waitFor(() => expect(screen.getByTestId('balance-MAIN')).toBeTruthy())
}

describe('BalancesCard — balances render honestly through the helpers', () => {
  it('an anchored account shows money(balance); a no-starting account shows the em-dash + affordance, never 0', async () => {
    await renderCard()
    expect(screen.getByTestId('balance-MAIN').textContent).toContain('$1,037.82')
    const ocean = section('OCEAN')
    expect(within(ocean).getByTestId('balance-OCEAN').textContent).toContain('—')
    expect(within(ocean).getByTestId('balance-OCEAN').textContent).not.toContain('0')
    expect(within(ocean).getByRole('button', { name: /set starting balance/i })).toBeTruthy()
  })

  it('archived accounts render under the dimmed divider; sim accounts carry the practice marker', async () => {
    await renderCard()
    expect(screen.getByText('Archived')).toBeTruthy()
    expect(within(section('ARCH')).getByText(/old roth/i)).toBeTruthy()
    expect(within(section('SIM')).getByText(/sim \(practice\)/i)).toBeTruthy()
  })
})

describe('BalancesCard — event flows', () => {
  it('the add-entry flow calls cashEventCreate with kind/amount/date/note and refetches', async () => {
    await renderCard()
    const main = section('MAIN')
    fireEvent.click(within(main).getByRole('button', { name: /add entry/i }))
    fireEvent.change(within(main).getByLabelText(/amount/i), { target: { value: '500' } })
    fireEvent.change(within(main).getByLabelText(/date/i), { target: { value: '2026-07-03' } })
    fireEvent.change(within(main).getByLabelText(/memo/i), { target: { value: 'bonus' } })
    const callsBefore = m.cashBalanceGet.mock.calls.length
    fireEvent.click(within(main).getByRole('button', { name: /save entry/i }))
    await waitFor(() =>
      expect(m.cashEventCreate).toHaveBeenCalledWith({
        account_id: 'MAIN',
        kind: 'deposit',
        amount: 500,
        date: '2026-07-03',
        note: 'bonus',
      }),
    )
    await waitFor(() => expect(m.cashBalanceGet.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it("deleting a 'starting' row demands the un-anchor confirm first", async () => {
    await renderCard()
    fireEvent.click(
      within(screen.getByTestId('cash-event-EV-START')).getByRole('button', { name: /delete/i }),
    )
    expect(m.cashEventDelete).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toMatch(/starting balance/i)
    fireEvent.click(within(dialog).getByRole('button', { name: /delete starting balance/i }))
    await waitFor(() => expect(m.cashEventDelete).toHaveBeenCalledWith('EV-START'))
  })

  it('a transfer-leg row routes deletion to the PAIR confirm -> cashTransferDelete(transfer_id)', async () => {
    await renderCard()
    fireEvent.click(
      within(screen.getByTestId('cash-event-EV-LEG')).getByRole('button', { name: /delete/i }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toMatch(/transfer/i)
    fireEvent.click(within(dialog).getByRole('button', { name: /delete transfer/i }))
    await waitFor(() => expect(m.cashTransferDelete).toHaveBeenCalledWith('T-1'))
    expect(m.cashEventDelete).not.toHaveBeenCalled()
  })

  it('a plain event deletes directly (no confirm)', async () => {
    await renderCard()
    fireEvent.click(
      within(screen.getByTestId('cash-event-EV-DEP')).getByRole('button', { name: /delete/i }),
    )
    await waitFor(() => expect(m.cashEventDelete).toHaveBeenCalledWith('EV-DEP'))
  })
})

describe('BalancesCard — honesty inlines', () => {
  it('a date before the anchor shows the pre-anchor warning (entry still allowed)', async () => {
    await renderCard()
    const main = section('MAIN')
    fireEvent.click(within(main).getByRole('button', { name: /add entry/i }))
    fireEvent.change(within(main).getByLabelText(/date/i), { target: { value: '2025-12-25' } })
    expect(within(main).getByText(/before this account's starting date/i)).toBeTruthy()
  })

  it('a deposit form on a no-starting account shows the no-anchor note', async () => {
    await renderCard()
    const ocean = section('OCEAN')
    fireEvent.click(within(ocean).getByRole('button', { name: /add entry/i }))
    expect(within(ocean).getByText(/no starting balance/i)).toBeTruthy()
  })
})

describe('BalancesCard — the sibling notify (beat 2.5)', () => {
  it('a registry notify re-runs the load: a newly-present account renders WITHOUT remount', async () => {
    await renderCard()
    const listCalls = m.accountsList.mock.calls.length
    const NEW = acct({ id: 'FRESH', name: 'Fresh One', is_default: false })
    m.accountsList.mockResolvedValue([...ACCOUNTS, NEW])
    notifyRegistryChanged()
    await waitFor(() => expect(m.accountsList.mock.calls.length).toBeGreaterThan(listCalls))
    await waitFor(() => expect(screen.getByTestId('balances-account-FRESH')).toBeTruthy())
    expect(m.cashBalanceGet).toHaveBeenCalledWith('FRESH')
  })

  it('unmounting the subscriber stops delivery (cleanup pin)', async () => {
    const { unmount } = render(<BalancesCard />)
    await waitFor(() => expect(screen.getByTestId('balance-MAIN')).toBeTruthy())
    unmount()
    const listCalls = m.accountsList.mock.calls.length
    notifyRegistryChanged()
    // Delivery stopped: no further load fires for the unmounted card.
    await new Promise((r) => setTimeout(r, 30))
    expect(m.accountsList.mock.calls.length).toBe(listCalls)
  })
})

describe('BalancesCard — the transfer form', () => {
  it('the counterparty list excludes self and cross-realm accounts; submit sends ONE note', async () => {
    await renderCard()
    const from = screen.getByLabelText(/from account/i) as HTMLSelectElement
    fireEvent.change(from, { target: { value: 'MAIN' } })
    const to = screen.getByLabelText(/to account/i) as HTMLSelectElement
    const toIds = Array.from(to.options).map((o) => o.value).filter(Boolean)
    expect(toIds).not.toContain('MAIN') // no self
    expect(toIds).not.toContain('SIM') // no cross-realm
    expect(toIds).toContain('OCEAN')
    fireEvent.change(to, { target: { value: 'OCEAN' } })
    fireEvent.change(screen.getByLabelText(/transfer amount/i), { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText(/transfer date/i), { target: { value: '2026-07-03' } })
    fireEvent.change(screen.getByLabelText(/transfer memo/i), { target: { value: 'move' } })
    fireEvent.click(screen.getByRole('button', { name: /^transfer$/i }))
    await waitFor(() =>
      expect(m.cashTransferCreate).toHaveBeenCalledWith({
        from_account_id: 'MAIN',
        to_account_id: 'OCEAN',
        amount: 300,
        date: '2026-07-03',
        note: 'move',
      }),
    )
  })

  it("a sim 'from' offers only sim counterparties (the same-realm filter, both directions)", async () => {
    await renderCard()
    fireEvent.change(screen.getByLabelText(/from account/i), { target: { value: 'SIM' } })
    const to = screen.getByLabelText(/to account/i) as HTMLSelectElement
    const toIds = Array.from(to.options).map((o) => o.value).filter(Boolean)
    expect(toIds).toEqual([]) // the only sim account is the from — empty reads sanely
  })
})
