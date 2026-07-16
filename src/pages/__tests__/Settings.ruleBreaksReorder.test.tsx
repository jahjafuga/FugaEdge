import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from '@/pages/Settings'
import { ipc } from '@/lib/ipc'
import { invalidateRuleBreakOptionsCache } from '@/components/calendar/RuleBreaksEditor'
import { makeSettingsPayload } from '@/test/fixtures/settings'

// Dave #12 — the savebar half of the rule-breaks reorder:
//   (3) PERSIST: a chevron move lands in the draft, and Save writes the
//       reordered array to daily_rule_break_list.
//   (6) THE CACHE: the savebar save calls invalidateRuleBreakOptionsCache()
//       (the day modal's 60s options cache — exported with zero callers until
//       this beat), so the reorder is visible on the next day-modal open.
//       handleSave's five-key patch ALWAYS carries daily_rule_break_list, so
//       the call is unconditional there — and lives ONLY there: no other save
//       path (own-writer sections) touches the list.
//
// ipc mock mirrors Settings.savebar.test.tsx (the whole subtree mounts).
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

// The invalidator is spied; the editor component itself isn't rendered by
// Settings (it lives in the day modal), so a null default is honest.
vi.mock('@/components/calendar/RuleBreaksEditor', () => ({
  default: () => null,
  invalidateRuleBreakOptionsCache: vi.fn(),
}))

const m = vi.mocked(ipc)
const invalidate = vi.mocked(invalidateRuleBreakOptionsCache)

const LIST = ['Alpha break', 'Bravo break', 'Charlie break']

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.localStorage.setItem('fuga.settings.activeCategory', 'journal')
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ daily_rule_break_list: LIST }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload({ daily_rule_break_list: LIST }))
  m.mistakeDefsGet.mockResolvedValue([] as never)
  m.catalystDefsGet.mockResolvedValue([] as never)
  m.tradesList.mockResolvedValue([] as never)
})

describe('(3) the savebar persists the reordered daily_rule_break_list', () => {
  it('chevron move + Save settings → settingsSave receives the NEW order', async () => {
    render(<Settings />)
    fireEvent.click(await screen.findByLabelText('Move Bravo break up'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }))

    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    const arg = m.settingsSave.mock.calls[0][0] as { daily_rule_break_list: string[] }
    expect(arg.daily_rule_break_list).toEqual(['Bravo break', 'Alpha break', 'Charlie break'])
  })
})

describe('(6) the savebar save ends the zero-caller cache', () => {
  it('a save carrying daily_rule_break_list invalidates the day-modal options cache', async () => {
    render(<Settings />)
    fireEvent.click(await screen.findByLabelText('Move Bravo break up'))
    expect(invalidate).not.toHaveBeenCalled() // the move alone doesn't
    fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
  })
})
