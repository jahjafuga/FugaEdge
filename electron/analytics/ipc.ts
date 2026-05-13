import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { memoize } from '../lib/cache'
import { getAnalytics } from './get'

// Analytics scans the entire trades table and runs ~10 aggregations.
// Cache the payload for 5 minutes (version-stamped — any trade mutation
// bumps the data version and forces a recompute).
export function registerAnalyticsIpc(): void {
  ipcMain.handle(IPC.ANALYTICS_GET, () =>
    memoize('analytics', () => getAnalytics()),
  )
}
