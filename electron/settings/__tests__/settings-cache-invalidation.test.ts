// Cache-invalidation contract for SETTINGS_SAVE.
//
// analytics reads settings.daily_profit_target (electron/analytics/get.ts:986),
// so a settings save that changes that key mutates a memoized analytics input;
// without a bump the payload is stale until TTL/restart. The handler is
// key-agnostic (saveSettings takes an arbitrary patch) and can't cheaply tell
// which key changed, so it bumps on any save — the target key is the one that
// matters. REAL cache module; repo/services/export are stubbed (no DB, no
// network, no dialog).

import { describe, expect, it, beforeEach, vi } from 'vitest'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, input: unknown) => unknown>(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (e: unknown, input: unknown) => unknown) => {
      handlers.set(ch, fn)
    },
  },
}))

// Stub every non-cache dependency the registrar pulls at import.
vi.mock('../repo', () => ({
  getSettings: vi.fn(() => ({ values: {} })),
  saveSettings: vi.fn(() => ({ values: {} })),
}))
vi.mock('../export', () => ({
  exportDatabase: vi.fn(),
  exportJournalJson: vi.fn(),
  exportTradesCsv: vi.fn(),
}))
vi.mock('@/services/massive', () => ({ verifyMassive: vi.fn() }))
vi.mock('@/services/fmp', () => ({ verifyFmp: vi.fn() }))

import { registerSettingsIpc } from '../ipc'
import { memoize, getDataVersion, clearCache } from '../../lib/cache'
import { IPC } from '@shared/ipc-channels'

registerSettingsIpc()
const invoke = (ch: string, input: unknown) => handlers.get(ch)!({}, input)

beforeEach(() => {
  clearCache()
})

describe('SETTINGS_SAVE — analytics cache invalidation (daily_profit_target)', () => {
  it('invalidates analytics:all so the next read recomputes against the new settings', () => {
    let n = 0
    const compute = vi.fn(() => ({ tick: ++n }))
    expect(memoize('analytics:all', compute).tick).toBe(1)
    expect(compute).toHaveBeenCalledTimes(1)

    const v0 = getDataVersion()
    invoke(IPC.SETTINGS_SAVE, { daily_profit_target: '500' })
    expect(getDataVersion()).toBe(v0 + 1)

    expect(memoize('analytics:all', compute).tick).toBe(2)
    expect(compute).toHaveBeenCalledTimes(2)
  })
})
