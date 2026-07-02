// @vitest-environment jsdom
//
// Multi-account (sim-unlock audit, fix beat 1) — the Journal page follows
// the switcher: the day-summary fetch AND the day-trades fetch both carry
// the scope and re-fire on a flip; the setup picker stays ARGLESS
// (names-only, the c50155c ruling).

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { JournalDay } from '@shared/journal-types'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    journalGet: vi.fn(),
    tradesList: vi.fn(),
    playbooksList: vi.fn(),
    journalSave: vi.fn(),
    sessionSentimentSave: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))

import Journal from '../Journal'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

const EMPTY_DAY: JournalDay = {
  date: '2026-07-02',
  entry: null,
  summary: null,
  rules: [],
  sentiment: null,
}

function ScopeProbe() {
  const { setScope } = useAccountScope()
  return (
    <button type="button" onClick={() => setScope({ accountId: 'ACCT-B' })}>
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

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

beforeEach(() => {
  vi.clearAllMocks()
  installMockLocalStorage()
  m.journalGet.mockResolvedValue(EMPTY_DAY)
  m.tradesList.mockResolvedValue([])
  m.playbooksList.mockResolvedValue([])
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
})

describe('Journal — scope-aware fetching', () => {
  it("both day fetches carry 'all' at boot, re-fire scoped on a flip; the setup picker stays argless", async () => {
    render(
      <MemoryRouter>
        <AccountScopeProvider>
          <ScopeProbe />
          <Journal />
        </AccountScopeProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(m.journalGet).toHaveBeenCalled())
    expect(m.journalGet).toHaveBeenCalledWith(expect.any(String), 'all')
    expect(m.tradesList).toHaveBeenCalledWith(
      expect.objectContaining({ date: expect.any(String), accountScope: 'all' }),
    )

    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() =>
      expect(m.journalGet).toHaveBeenLastCalledWith(expect.any(String), {
        accountId: 'ACCT-B',
      }),
    )
    expect(m.tradesList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        date: expect.any(String),
        accountScope: { accountId: 'ACCT-B' },
      }),
    )
    // Names-only, ruled ARGLESS — every call empty-argumented.
    expect(m.playbooksList.mock.calls.every((c) => c.length === 0)).toBe(true)
  })
})
