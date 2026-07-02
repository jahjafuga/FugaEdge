import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { memoize } from '../lib/cache'
import { scopeCacheKey } from '../accounts/scope'
import type { AccountScope } from '@shared/accounts-types'
import { getAnalytics } from './get'

interface GetInput {
  /** Multi-account slice — the switcher's scope; absent -> 'all'. */
  scope?: AccountScope
}

// Analytics scans the entire trades table and runs ~10 aggregations.
// Cache the payload for 5 minutes (version-stamped — any trade mutation
// bumps the data version and forces a recompute). The cache key carries the
// scope: without it a switcher flip within the TTL would serve the previous
// scope's payload.
export function registerAnalyticsIpc(): void {
  ipcMain.handle(IPC.ANALYTICS_GET, (_e, input?: GetInput) => {
    const scope = input?.scope ?? 'all'
    return memoize(`analytics:${scopeCacheKey(scope)}`, () => getAnalytics(scope))
  })
}
