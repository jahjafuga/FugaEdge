// Multi-account (Analytics slice) — the ANALYTICS_GET handler threads the
// scope AND keys its memoize cache by it. The cache key is load-bearing:
// the TTL cache is a plain string map, so without a per-scope key a switcher
// flip within 5 minutes would serve the previous scope's payload. Harness
// mirrors warmup-reclear-ipc.test.ts (handlers-map electron mock).

import { describe, expect, it, beforeEach, vi } from 'vitest'

const handlers = new Map<string, (e: unknown, input?: unknown) => unknown>()
const memoKeys: string[] = []
const getAnalyticsSpy = vi.fn(() => ({ trade_count: 0 }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (e: unknown, input?: unknown) => unknown) => {
      handlers.set(ch, fn)
    },
  },
}))
vi.mock('../get', () => ({ getAnalytics: (...a: unknown[]) => getAnalyticsSpy(...(a as [])) }))
vi.mock('../../lib/cache', () => ({
  memoize: (key: string, compute: () => unknown) => {
    memoKeys.push(key)
    return compute()
  },
}))

import { IPC } from '@shared/ipc-channels'
import { registerAnalyticsIpc } from '../ipc'

registerAnalyticsIpc()
const invoke = (input?: unknown) => handlers.get(IPC.ANALYTICS_GET)!({}, input)

beforeEach(() => {
  memoKeys.length = 0
  getAnalyticsSpy.mockClear()
})

describe('ANALYTICS_GET — scope threading + scope-keyed cache', () => {
  it("absent input -> 'all' through the seam, cache key 'analytics:all'", () => {
    invoke(undefined)
    expect(getAnalyticsSpy).toHaveBeenCalledWith('all')
    expect(memoKeys).toEqual(['analytics:all'])
  })

  it('single-account scope threads and keys per account', () => {
    invoke({ scope: { accountId: 'ACCT-X' } })
    expect(getAnalyticsSpy).toHaveBeenCalledWith({ accountId: 'ACCT-X' })
    expect(memoKeys).toEqual(['analytics:acct:ACCT-X'])
  })
})
