// The "050" append fix on Settings' PRIVATE NumberField (:846-885) — the component behind
// the reported field, "Max daily loss alert", and behind "Account size". It is not
// exported, so it is driven through the whole <Settings> page (the savebar-test harness).
//
// The parse/store path is deliberately NOT touched by the fix: state already held the right
// number (parseFloat("050") === 50); only the DOM display stuck. These tests therefore
// assert the DISPLAY behaviour and re-confirm the saved number is unchanged.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from '@/pages/Settings'
import { ipc } from '@/lib/ipc'
import { makeSettingsPayload } from '@/test/fixtures/settings'

// The whole <Settings> subtree mounts, so every IPC it touches on mount is stubbed
// (mirrors Settings.savebar.test.tsx).
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
    accountsList: vi.fn(async () => []),
    cashEventsList: vi.fn(async () => []),
    cashBalanceGet: vi.fn(async () => null),
    // Beat 2 — the Rule Breaks editor reads rule-break usage on mount (READ-ONLY).
    ruleBreakUsage: vi.fn(async () => ({})),
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
const savedArg = () => m.settingsSave.mock.calls[0][0] as Record<string, unknown>

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
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
})

const maxLoss = () => screen.getByLabelText('Max daily loss alert') as HTMLInputElement

describe('Settings NumberField — the "050" append bug (Max daily loss alert)', () => {
  it('a zero-valued field renders EMPTY with a "0" placeholder — nothing to append to', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ max_daily_loss: 0 }))
    render(<Settings />)

    await screen.findByLabelText('Max daily loss alert')
    expect(maxLoss().value).toBe('')
    expect(maxLoss().placeholder).toBe('0')
    expect(maxLoss().type).toBe('number') // spinbutton preserved
  })

  it('typing 5 then 0 shows "50", never "050", and SAVES 50', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ max_daily_loss: 0 }))
    render(<Settings />)
    await screen.findByLabelText('Max daily loss alert')

    fireEvent.change(maxLoss(), { target: { value: '5' } })
    expect(maxLoss().value).toBe('5')
    fireEvent.change(maxLoss(), { target: { value: '50' } })
    expect(maxLoss().value).toBe('50')

    fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    expect(savedArg().max_daily_loss).toBe(50)
  })

  it('the "0" is deletable: clearing reaches empty and still stores 0', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ max_daily_loss: 500 }))
    render(<Settings />)
    await screen.findByLabelText('Max daily loss alert')
    expect(maxLoss().value).toBe('500')

    fireEvent.change(maxLoss(), { target: { value: '' } })
    expect(maxLoss().value).toBe('') // React used to repaint "0" here

    fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    expect(savedArg().max_daily_loss).toBe(0) // empty still MEANS 0
  })

  it('the SECOND NumberField (Account size) is fixed by the same component', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_size: 0 }))
    render(<Settings />)

    const acct = (await screen.findByLabelText('Account size')) as HTMLInputElement
    expect(acct.value).toBe('')

    fireEvent.change(acct, { target: { value: '5' } })
    fireEvent.change(acct, { target: { value: '50' } })
    expect(acct.value).toBe('50')

    fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    expect(savedArg().account_size).toBe(50)
  })
})
