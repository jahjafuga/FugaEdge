// @vitest-environment jsdom
//
// Multi-account Beat 3 — the Settings "Trading accounts" card. Logic
// assertions (house harness: mocked ipc, fireEvent): list render with the
// default star, create -> accountsCreate + fresh-list replace, friendly guard
// errors (IPC wrapper prefix stripped), archive-the-default rejection, delete
// behind ONE confirm, set-default on star click, and the sim note under the
// type select. Presentation is eyes-gated.

import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Account } from '@shared/accounts-types'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    accountsList: vi.fn(),
    accountsCreate: vi.fn(),
    accountsUpdate: vi.fn(),
    accountsSetDefault: vi.fn(),
    accountsSetStatus: vi.fn(),
    accountsDelete: vi.fn(),
  },
}))

import TradingAccountsCard from '../TradingAccountsCard'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

function acct(over: Partial<Account>): Account {
  return {
    id: 'A',
    name: 'Main account',
    broker: null,
    account_type: 'margin',
    color: null,
    status: 'active',
    is_default: false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const BASE: Account[] = [
  acct({ id: 'A', name: 'Main account', is_default: true }),
  acct({ id: 'B', name: 'Ocean One', broker: 'Ocean One Financial', color: '#4f9cf9' }),
  acct({ id: 'X', name: 'Old prop', account_type: 'prop', status: 'archived' }),
]

// The Electron IPC boundary wraps main-side throws — the card must strip the
// wrapper and show the repo's friendly message.
function wrapped(message: string): Error {
  return new Error(`Error invoking remote method 'accounts:create': Error: ${message}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  m.accountsList.mockResolvedValue(BASE)
})

async function renderCard() {
  render(<TradingAccountsCard />)
  await screen.findByText('Ocean One') // list loaded
}

describe('TradingAccountsCard — list', () => {
  it('renders every account (archived dimmed with Unarchive) and stars the default', async () => {
    await renderCard()
    expect(screen.getByText('Main account')).toBeTruthy()
    expect(screen.getByText('Old prop')).toBeTruthy()
    expect(screen.getByRole('button', { name: /default account/i })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^set as default/i })).toHaveLength(1) // B only (archived rows get Unarchive instead)
    expect(screen.getByRole('button', { name: /unarchive/i })).toBeTruthy()
  })
})

describe('TradingAccountsCard — create', () => {
  it('creates with name/type and replaces the list from the returned fresh list', async () => {
    const created = [...BASE, acct({ id: 'C', name: 'Schwab Roth', account_type: 'roth_ira' })]
    m.accountsCreate.mockResolvedValue(created)
    await renderCard()
    fireEvent.change(screen.getByLabelText(/account name/i), { target: { value: 'Schwab Roth' } })
    fireEvent.change(screen.getByLabelText(/account type/i), { target: { value: 'roth_ira' } })
    fireEvent.click(screen.getByRole('button', { name: /add account/i }))
    await waitFor(() => expect(m.accountsCreate).toHaveBeenCalledTimes(1))
    const arg = m.accountsCreate.mock.calls[0][0]
    expect(arg.name).toBe('Schwab Roth')
    expect(arg.account_type).toBe('roth_ira')
    expect(await screen.findByText('Schwab Roth')).toBeTruthy()
  })

  it('surfaces the duplicate-name guard as friendly inline text (wrapper stripped)', async () => {
    m.accountsCreate.mockRejectedValue(wrapped('An account named "Ocean One" already exists'))
    await renderCard()
    fireEvent.change(screen.getByLabelText(/account name/i), { target: { value: 'Ocean One' } })
    fireEvent.click(screen.getByRole('button', { name: /add account/i }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('An account named "Ocean One" already exists')
    expect(alert.textContent).not.toContain('invoking remote method')
  })

  // Sim-unlock audit fix beat 3 — the note pin INVERTED to the practice
  // copy (the block retired; the note is informational live behavior).
  it('shows the practice note when the create type select is set to sim', async () => {
    await renderCard()
    fireEvent.change(screen.getByLabelText(/account type/i), { target: { value: 'sim' } })
    expect(screen.getByText(/practice account/i)).toBeTruthy()
  })
})

describe('TradingAccountsCard — row actions', () => {
  it('star click calls accountsSetDefault and the fresh list re-renders the star', async () => {
    const swapped = [
      acct({ id: 'B', name: 'Ocean One', is_default: true }),
      acct({ id: 'A', name: 'Main account' }),
      BASE[2],
    ]
    m.accountsSetDefault.mockResolvedValue(swapped)
    await renderCard()
    fireEvent.click(screen.getByRole('button', { name: /^set as default/i }))
    await waitFor(() => expect(m.accountsSetDefault).toHaveBeenCalledWith('B'))
  })

  it('archiving the default surfaces the friendly rejection', async () => {
    m.accountsSetStatus.mockRejectedValue(
      wrapped('Cannot archive the default account — set another default first'),
    )
    await renderCard()
    const mainRow = screen.getByText('Main account').closest('li')!
    fireEvent.click(within(mainRow).getByRole('button', { name: /archive/i }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Cannot archive the default account')
  })

  it('delete asks ONE confirm, then calls accountsDelete; the trades-FK guard shows friendly text', async () => {
    m.accountsDelete.mockRejectedValue(
      wrapped('This account has trades assigned — archive it instead'),
    )
    await renderCard()
    const row = screen.getByText('Ocean One').closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: /delete/i }))
    // ConfirmModal opens — confirm it.
    fireEvent.click(await screen.findByRole('button', { name: /delete account/i }))
    await waitFor(() => expect(m.accountsDelete).toHaveBeenCalledWith('B'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('archive it instead')
  })

  it('rename via the row edit form calls accountsUpdate with the patch', async () => {
    m.accountsUpdate.mockResolvedValue(
      [acct({ id: 'A', name: 'DAS Main', is_default: true }), BASE[1], BASE[2]],
    )
    await renderCard()
    const mainRow = screen.getByText('Main account').closest('li')!
    fireEvent.click(within(mainRow).getByRole('button', { name: /edit/i }))
    const nameInput = await screen.findByLabelText(/edit name/i)
    fireEvent.change(nameInput, { target: { value: 'DAS Main' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() =>
      expect(m.accountsUpdate).toHaveBeenCalledWith('A', expect.objectContaining({ name: 'DAS Main' })),
    )
    expect(await screen.findByText('DAS Main')).toBeTruthy()
  })
})
