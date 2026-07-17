import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from '@/pages/Settings'
import { ipc } from '@/lib/ipc'
import { makeSettingsPayload } from '@/test/fixtures/settings'

// New (non-lock) test for the remodel: the active rail category persists to
// fuga.settings.activeCategory and is restored on remount.
vi.mock('@/lib/ipc', () => ({
  ipc: {
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    testMassiveKey: vi.fn(),
    testFmpKey: vi.fn(),
    mistakeDefsGet: vi.fn(),
    catalystDefsGet: vi.fn(),
    tradesList: vi.fn(),
    // Beat 3 — TradingAccountsCard mounts inside Settings and lists on mount.
    accountsList: vi.fn(async () => []),
    // Stage 3 beat 2 — BalancesCard mounts inside Settings and fetches on mount.
    cashEventsList: vi.fn(async () => []),
    cashBalanceGet: vi.fn(async () => null),
    // Beat 2 — the Rule Breaks editor reads rule-break usage on mount (READ-ONLY).
    ruleBreakUsage: vi.fn(async () => ({})),
    journalRuleUsage: vi.fn(async () => ({})),
    countryOnBackfillProgress: vi.fn(() => () => {}),
    floatOnBackfillProgress: vi.fn(() => () => {}),
    profileOnBackfillProgress: vi.fn(() => () => {}),
    warmupOnBackfillProgress: vi.fn(() => () => {}),
    dailyChangeOnBackfillProgress: vi.fn(() => () => {}),
  },
}))
const m = vi.mocked(ipc)

// This vitest jsdom env ships no working localStorage — install an in-memory one
// so the activeCategory read/write is observable (the component guards it, but
// the test needs to read the value back).
function installMockLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  installMockLocalStorage()
  m.settingsGet.mockResolvedValue(makeSettingsPayload())
  m.mistakeDefsGet.mockResolvedValue([] as never)
  m.catalystDefsGet.mockResolvedValue([] as never)
  m.tradesList.mockResolvedValue([] as never)
  m.countryOnBackfillProgress.mockReturnValue(() => {})
  m.floatOnBackfillProgress.mockReturnValue(() => {})
  m.profileOnBackfillProgress.mockReturnValue(() => {})
  m.warmupOnBackfillProgress.mockReturnValue(() => {})
  m.dailyChangeOnBackfillProgress.mockReturnValue(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Settings — active category persistence', () => {
  it('writes fuga.settings.activeCategory on select and restores it on remount', async () => {
    const { unmount } = render(<Settings />)

    // Wait for the page past its loading gate (the rail then renders).
    const journalBtn = await screen.findByRole('button', { name: 'Journal' })
    expect(journalBtn.getAttribute('aria-current')).toBeNull() // not active by default

    fireEvent.click(journalBtn)
    expect(localStorage.getItem('fuga.settings.activeCategory')).toBe('journal')

    // Remount: the stored category is restored as the active rail item.
    unmount()
    render(<Settings />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Journal' }).getAttribute('aria-current')).toBe(
        'page',
      ),
    )
  })
})
