// Multi-account (Analytics slice) — the REPORTS_GET handler threads the
// scope AND keys its memoize cache by it (the ANALYTICS_GET mirror; same
// load-bearing per-scope cache key).

import { describe, expect, it, beforeEach, vi } from 'vitest'

const handlers = new Map<string, (e: unknown, input?: unknown) => unknown>()
const memoKeys: string[] = []
const getReportsSpy = vi.fn(() => ({ totals: null }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (e: unknown, input?: unknown) => unknown) => {
      handlers.set(ch, fn)
    },
  },
}))
vi.mock('../get', () => ({ getReports: (...a: unknown[]) => getReportsSpy(...(a as [])) }))
vi.mock('../../lib/cache', () => ({
  memoize: (key: string, compute: () => unknown) => {
    memoKeys.push(key)
    return compute()
  },
}))

import { IPC } from '@shared/ipc-channels'
import { registerReportsIpc } from '../ipc'

registerReportsIpc()
const invoke = (input?: unknown) => handlers.get(IPC.REPORTS_GET)!({}, input)

beforeEach(() => {
  memoKeys.length = 0
  getReportsSpy.mockClear()
})

describe('REPORTS_GET — scope threading + scope-keyed cache', () => {
  it("absent input -> 'all' through the seam, cache key 'reports:all'", () => {
    invoke(undefined)
    expect(getReportsSpy).toHaveBeenCalledWith('all')
    expect(memoKeys).toEqual(['reports:all'])
  })

  it('single-account scope threads and keys per account', () => {
    invoke({ scope: { accountId: 'ACCT-X' } })
    expect(getReportsSpy).toHaveBeenCalledWith({ accountId: 'ACCT-X' })
    expect(memoKeys).toEqual(['reports:acct:ACCT-X'])
  })
})
