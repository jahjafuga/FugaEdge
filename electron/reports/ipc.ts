import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { memoize } from '../lib/cache'
import { scopeCacheKey } from '../accounts/scope'
import type { AccountScope } from '@shared/accounts-types'
import { getReports } from './get'

interface GetInput {
  /** Multi-account slice — the switcher's scope; absent -> 'all'. */
  scope?: AccountScope
}

// Reports does roll-ups across the full trades table — cache identical to
// the analytics handler (scope-keyed for the same reason). Bumped by
// mutation IPCs via bumpDataVersion().
export function registerReportsIpc(): void {
  ipcMain.handle(IPC.REPORTS_GET, (_e, input?: GetInput) => {
    const scope = input?.scope ?? 'all'
    return memoize(`reports:${scopeCacheKey(scope)}`, () => getReports(scope))
  })
}
