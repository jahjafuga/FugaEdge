// Cache-invalidation contract for the accounts mutation handlers.
//
// Analytics scopes every 'all' query through SIM_WALL —
//   account_id IN (SELECT id FROM accounts WHERE account_type != 'sim')
// (electron/accounts/scope.ts:13), applied in getAnalytics at
// electron/analytics/get.ts:892 + :918 (WHERE ... AND ${sf.clause}). So the
// accounts REGISTRY is a live input to the memoized analytics payload: an
// ACCOUNTS_UPDATE that flips account_type margin<->sim changes which trades the
// 'all' rollup counts. CREATE/DELETE are output-neutral under today's invariants
// (a new account has no trades; delete is FK-blocked when trades exist) but still
// mutate the registry SIM_WALL reads, so they invalidate conservatively.
//
// These tests use the REAL cache module (memoize + bumpDataVersion + the real
// version counter) so they assert the actual invalidation CONTRACT — "after the
// mutation, the next analyticsGet recomputes fresh" — not merely that a spy
// fired. The repo is stubbed (no better-sqlite3 / real DB), mirroring the
// rule-breaks cache test's harness.

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

// Stub the repo so registering the IPC pulls no DB layer. Return values are
// irrelevant to the invalidation contract; listAccounts just needs to be callable.
vi.mock('../repo', () => ({
  createAccount: vi.fn(() => ({ id: 'a1' })),
  updateAccount: vi.fn(() => ({ id: 'a1' })),
  deleteAccount: vi.fn(),
  listAccounts: vi.fn(() => []),
  setDefaultAccount: vi.fn(() => ({ id: 'a1' })),
  setAccountStatus: vi.fn(() => ({ id: 'a1' })),
}))

// REAL cache — memoize + bumpDataVersion drive the assertions.
import { registerAccountsIpc } from '../ipc'
import { memoize, getDataVersion, clearCache } from '../../lib/cache'
import { IPC } from '@shared/ipc-channels'

registerAccountsIpc()
const invoke = (ch: string, input: unknown) => handlers.get(ch)!({}, input)

// Seed analytics:all, run the mutation, assert the next read MISSES the cache and
// recomputes fresh (the rule-breaks contract). `tick` increments per compute so a
// recompute is observable, not inferred.
function expectInvalidates(mutate: () => void) {
  let n = 0
  const compute = vi.fn(() => ({ tick: ++n }))
  expect(memoize('analytics:all', compute).tick).toBe(1) // cold seed
  expect(compute).toHaveBeenCalledTimes(1)
  const v0 = getDataVersion()
  mutate()
  expect(getDataVersion()).toBe(v0 + 1) // the handler bumped
  expect(memoize('analytics:all', compute).tick).toBe(2) // MISS -> recompute
  expect(compute).toHaveBeenCalledTimes(2)
}

// The no-bump counterpart: the cache stays warm (HIT), no recompute.
function expectStable(mutate: () => void) {
  let n = 0
  const compute = vi.fn(() => ({ tick: ++n }))
  expect(memoize('analytics:all', compute).tick).toBe(1)
  const v0 = getDataVersion()
  mutate()
  expect(getDataVersion()).toBe(v0) // no bump
  expect(memoize('analytics:all', compute).tick).toBe(1) // HIT -> still cached
  expect(compute).toHaveBeenCalledTimes(1)
}

beforeEach(() => {
  clearCache()
})

describe('accounts mutations — analytics cache invalidation (SIM_WALL registry input)', () => {
  it('ACCOUNTS_CREATE invalidates the analytics cache', () => {
    expectInvalidates(() =>
      invoke(IPC.ACCOUNTS_CREATE, { name: 'Swing', account_type: 'margin', broker: null, color: '#4f9cf9' }),
    )
  })

  it('ACCOUNTS_UPDATE invalidates the analytics cache (the live case: a type/registry change)', () => {
    expectInvalidates(() =>
      invoke(IPC.ACCOUNTS_UPDATE, { id: 'a1', patch: { color: '#f472b6', account_type: 'sim' } }),
    )
  })

  it('ACCOUNTS_DELETE invalidates the analytics cache', () => {
    expectInvalidates(() => invoke(IPC.ACCOUNTS_DELETE, { id: 'a1' }))
  })

  // Scope guard — the accounts sub-scoping decision: only CREATE/UPDATE/DELETE
  // bump. is_default / status are NOT in SIM_WALL (it filters by account_type
  // only), so SET_DEFAULT / SET_STATUS leave analytics unchanged and must NOT
  // invalidate. A future reflexive bump on either trips this.
  it('ACCOUNTS_SET_DEFAULT does NOT invalidate (is_default not in SIM_WALL)', () => {
    expectStable(() => invoke(IPC.ACCOUNTS_SET_DEFAULT, { id: 'a1' }))
  })

  it('ACCOUNTS_SET_STATUS does NOT invalidate (status not in SIM_WALL)', () => {
    expectStable(() => invoke(IPC.ACCOUNTS_SET_STATUS, { id: 'a1', status: 'archived' }))
  })
})
