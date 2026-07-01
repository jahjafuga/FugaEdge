// @vitest-environment jsdom
//
// The top-right account menu. Mirrors PlaybookPicker's open/click-outside and
// adds Escape + ARIA. ipc.profileGet is mocked; the dropdown is wrapped in a
// MemoryRouter so the <Link> items resolve. Covers: trigger, open/close, the
// three route links, item-click close, Escape close, click-outside close, and
// the header name/handle (+ the "Add your name" fallback).

import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Profile } from '@shared/identity-types'
import type { XpSummary } from '@shared/xp-types'

vi.mock('@/lib/ipc', () => ({ ipc: { profileGet: vi.fn(), xpSummaryGet: vi.fn() } }))

import AccountMenu from '../AccountMenu'
import { ipc } from '@/lib/ipc'

const profileGet = vi.mocked(ipc.profileGet)
const xpSummaryGet = vi.mocked(ipc.xpSummaryGet)

function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    id: '01HXAVATAR',
    display_name: 'Jah Fuga',
    handle: 'jahfuga',
    avatar_data: null,
    trading_style: null,
    markets: null,
    bio: null,
    featured_badges: [],
    member_since: null,
    created_at: null,
    updated_at: null,
    ...over,
  }
}

function makeSummary(over: Partial<XpSummary> = {}): XpSummary {
  return {
    totalXp: 1234,
    level: 5,
    intoLevel: 200,
    neededForNext: 300,
    currentStreak: 3,
    longestStreak: 7,
    freezesBanked: 1,
    ...over,
  }
}

beforeEach(() => {
  profileGet.mockReset()
  profileGet.mockResolvedValue(makeProfile())
  xpSummaryGet.mockReset()
  xpSummaryGet.mockResolvedValue(makeSummary())
})

const trigger = () => screen.findByRole('button', { name: /account menu/i })

describe('AccountMenu', () => {
  it('renders the trigger, closed initially', async () => {
    render(<MemoryRouter><AccountMenu /></MemoryRouter>)
    const btn = await trigger()
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.getAttribute('aria-haspopup')).toBe('menu')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens with Profile / Settings / Import links pointing at the right routes', async () => {
    render(<MemoryRouter><AccountMenu /></MemoryRouter>)
    fireEvent.click(await trigger())
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /profile/i }).getAttribute('href')).toBe('/profile')
    expect(within(menu).getByRole('menuitem', { name: /settings/i }).getAttribute('href')).toBe('/settings')
    expect(within(menu).getByRole('menuitem', { name: /import/i }).getAttribute('href')).toBe('/import')
  })

  it('closes when a menu item is clicked', async () => {
    render(<MemoryRouter><AccountMenu /></MemoryRouter>)
    fireEvent.click(await trigger())
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /profile/i }))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape', async () => {
    render(<MemoryRouter><AccountMenu /></MemoryRouter>)
    fireEvent.click(await trigger())
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on click outside', async () => {
    render(
      <MemoryRouter>
        <div>
          <AccountMenu />
          <button type="button">outside</button>
        </div>
      </MemoryRouter>,
    )
    fireEvent.click(await trigger())
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('shows the loaded name + @handle in the header', async () => {
    render(<MemoryRouter><AccountMenu /></MemoryRouter>)
    fireEvent.click(await trigger())
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('Jah Fuga')).toBeTruthy()
    expect(within(menu).getByText('@jahfuga')).toBeTruthy()
  })

  it('falls back to "Add your name" when display_name is null', async () => {
    profileGet.mockResolvedValue(makeProfile({ display_name: null, handle: null }))
    render(<MemoryRouter><AccountMenu /></MemoryRouter>)
    fireEvent.click(await trigger())
    expect(within(screen.getByRole('menu')).getByText(/add your name/i)).toBeTruthy()
  })
})
