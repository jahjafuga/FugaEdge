import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from '@/pages/Settings'
import { ipc } from '@/lib/ipc'
import { makeSettingsPayload, makeSettingsValues } from '@/test/fixtures/settings'
import type { SettingsValues } from '@shared/settings-types'

// Characterization tests for the Settings page's save wiring, ahead of the
// presentational pane remodel. GREEN on current code by design — they exist to
// go RED if the reorg disturbs a save path. The whole <Settings> subtree mounts,
// so every IPC it touches on mount is stubbed.
vi.mock('@/lib/ipc', () => ({
  ipc: {
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    testMassiveKey: vi.fn(),
    testFmpKey: vi.fn(),
    mistakeDefsGet: vi.fn(),
    mistakeDefCreate: vi.fn(),
    mistakeDefRename: vi.fn(),
    mistakeDefDelete: vi.fn(),
    mistakeDefReorder: vi.fn(),
    mistakeDefUnarchive: vi.fn(),
    catalystDefsGet: vi.fn(),
    catalystDefCreate: vi.fn(),
    catalystDefRename: vi.fn(),
    catalystDefDelete: vi.fn(),
    catalystDefReorder: vi.fn(),
    catalystDefUnarchive: vi.fn(),
    // Beat 3 — TradingAccountsCard mounts inside Settings and lists on mount.
    accountsList: vi.fn(async () => []),
    // Stage 3 beat 2 — BalancesCard mounts inside Settings and fetches on mount.
    cashEventsList: vi.fn(async () => []),
    cashBalanceGet: vi.fn(async () => null),
    tradesList: vi.fn(),
    tradeRestore: vi.fn(),
    tradesRestoreBulk: vi.fn(),
    tradeHardDelete: vi.fn(),
    tradesHardDeleteBulk: vi.fn(),
    countryBackfill: vi.fn(),
    floatBackfill: vi.fn(),
    profileBackfill: vi.fn(),
    dailyChangeBackfill: vi.fn(),
    recoverStrandedWarmup: vi.fn(),
    countryOnBackfillProgress: vi.fn(() => () => {}),
    floatOnBackfillProgress: vi.fn(() => () => {}),
    profileOnBackfillProgress: vi.fn(() => () => {}),
    warmupOnBackfillProgress: vi.fn(() => () => {}),
    dailyChangeOnBackfillProgress: vi.fn(() => () => {}),
    exportTrades: vi.fn(),
    exportJournal: vi.fn(),
    exportDatabase: vi.fn(),
    openExternal: vi.fn(),
    resetDatabase: vi.fn(),
    getVersion: vi.fn(),
  },
}))

const m = vi.mocked(ipc)

// The 7 keys handleSave is allowed to persist (Settings.tsx handleSave).
const SEVEN_KEYS = [
  'max_daily_loss',
  'account_size',
  'journal_rules',
  'day_tag_list',
  'daily_rule_break_list',
  'polygon_api_key',
  'fmp_api_key',
].sort()
// Keys handleSave must NEVER touch (the :123-128 exclusions + the self-contained sections).
const EXCLUDED = [
  'daily_profit_target',
  'dna_price_min',
  'dna_require_catalyst',
  'show_macd_pane',
  'show_ema9',
  'show_ema20',
  'show_vwap',
  'activation_key',
  'activation_payload',
  'activation_grace_started_at',
  'last_country_backfill',
]

beforeEach(() => {
  vi.clearAllMocks()
  m.mistakeDefsGet.mockResolvedValue([] as never)
  m.catalystDefsGet.mockResolvedValue([] as never)
  m.tradesList.mockResolvedValue([] as never)
  m.testMassiveKey.mockResolvedValue({ kind: 'valid' } as never)
  m.testFmpKey.mockResolvedValue({ kind: 'valid' } as never)
  m.countryOnBackfillProgress.mockReturnValue(() => {})
  m.floatOnBackfillProgress.mockReturnValue(() => {})
  m.profileOnBackfillProgress.mockReturnValue(() => {})
  m.warmupOnBackfillProgress.mockReturnValue(() => {})
  m.dailyChangeOnBackfillProgress.mockReturnValue(() => {})
})

describe('Settings savebar — 7-key contract (RED-lock #1)', () => {
  it('persists EXACTLY the 7 page-managed keys, and none of the excluded ones', async () => {
    // max_daily_loss = 777 is a unique display value across all number fields.
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ max_daily_loss: 777 }))
    m.settingsSave.mockResolvedValue(makeSettingsPayload({ max_daily_loss: 800 }))

    render(<Settings />)
    const input = await screen.findByDisplayValue('777')
    fireEvent.change(input, { target: { value: '800' } })

    fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }))

    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    const arg = m.settingsSave.mock.calls[0][0] as Record<string, unknown>

    expect(Object.keys(arg).sort()).toEqual(SEVEN_KEYS)
    for (const k of EXCLUDED) expect(arg).not.toHaveProperty(k)
    expect(arg.max_daily_loss).toBe(800)
  })
})

describe('Settings cross-component polygon-key wire (RED-lock #6)', () => {
  it('patches editor so the Market-data input reflects a key saved via the backfill modal', async () => {
    // Stateful "DB": settingsSave persists into `current`, settingsGet reads it,
    // and countryBackfill reports apiKeyMissing until a key exists.
    let current: SettingsValues = makeSettingsValues({ polygon_api_key: '' })
    m.settingsGet.mockImplementation(async () => makeSettingsPayload({ ...current }))
    m.settingsSave.mockImplementation(async (patch: Partial<SettingsValues>) => {
      current = { ...current, ...patch }
      return makeSettingsPayload({ ...current })
    })
    m.countryBackfill.mockImplementation(async () =>
      current.polygon_api_key
        ? ({ apiKeyMissing: false, updated: 1, skipped: 0, failed: 0 } as never)
        : ({ apiKeyMissing: true } as never),
    )

    render(<Settings />)
    // The Market-data Massive input starts empty.
    const marketInput = (await screen.findByPlaceholderText(
      'paste your massive.com API key',
    )) as HTMLInputElement
    expect(marketInput.value).toBe('')

    // Trigger the no-key backfill modal.
    fireEvent.click(screen.getByRole('button', { name: 'Backfill countries' }))
    const dialog = await screen.findByRole('dialog')

    // Enter + save a key inside the modal's ApiKeyEntry (>=16 alphanumeric).
    const NEW_KEY = 'massivekey1234567890'
    fireEvent.change(
      within(dialog).getByPlaceholderText('paste your massive.com API key'),
      { target: { value: NEW_KEY } },
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save and continue' }))

    // After onApiKeySaved → parent settingsGet → editor patch, the Market-data
    // input reflects the new key (and the modal has closed).
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      const live = screen.getByPlaceholderText(
        'paste your massive.com API key',
      ) as HTMLInputElement
      expect(live.value).toBe(NEW_KEY)
    })
  })
})
