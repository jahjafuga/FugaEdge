// @vitest-environment jsdom
//
// Multi-account Beat 3 — the import "Trading account" picker card (replaces
// the old Real/Paper radios). Logic assertions only: active-only options with
// friendly type labels, controlled value, onChange, the sim block note, and
// the manage-in-Settings hint. Presentation is eyes-gated.

import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import type { Account } from '@shared/accounts-types'
import AccountPickerCard from '../AccountPickerCard'

function acct(over: Partial<Account>): Account {
  return {
    id: 'A',
    name: 'DAS Main',
    broker: null,
    account_type: 'margin',
    color: null,
    status: 'active',
    is_default: false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const ACCOUNTS: Account[] = [
  acct({ id: 'A', name: 'DAS Main', is_default: true }),
  acct({ id: 'B', name: 'Ocean One', broker: 'Ocean One' }),
  acct({ id: 'S', name: 'Practice', account_type: 'sim' }),
  acct({ id: 'X', name: 'Old', status: 'archived' }),
]

function renderCard(value: string, onChange = vi.fn()) {
  render(
    <MemoryRouter>
      <AccountPickerCard accounts={ACCOUNTS} value={value} onChange={onChange} />
    </MemoryRouter>,
  )
  return onChange
}

describe('AccountPickerCard', () => {
  it('lists ACTIVE accounts only, labelled name + friendly type, with the value selected', () => {
    renderCard('A')
    const select = screen.getByRole('combobox', { name: /trading account/i })
    const options = within(select).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'DAS Main — Margin',
      'Ocean One — Margin',
      'Practice — Sim (practice)',
    ])
    expect((select as HTMLSelectElement).value).toBe('A')
  })

  it('fires onChange with the chosen account id', () => {
    const onChange = renderCard('A')
    fireEvent.change(screen.getByRole('combobox', { name: /trading account/i }), {
      target: { value: 'B' },
    })
    expect(onChange).toHaveBeenCalledWith('B')
  })

  it('shows the sim block note ONLY when the selected account is sim-typed', () => {
    renderCard('S')
    expect(screen.getByText(/sim-account imports unlock/i)).toBeTruthy()
  })

  it('hides the sim note for non-sim selections and always shows the manage hint', () => {
    renderCard('A')
    expect(screen.queryByText(/sim-account imports unlock/i)).toBeNull()
    const hint = screen.getByRole('link', { name: /manage accounts in settings/i })
    expect(hint.getAttribute('href')).toBe('/settings')
  })
})
