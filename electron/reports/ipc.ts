import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { memoize } from '../lib/cache'
import { getReports } from './get'

// Reports does roll-ups across the full trades table — cache identical to
// the analytics handler. Bumped by mutation IPCs via bumpDataVersion().
export function registerReportsIpc(): void {
  ipcMain.handle(IPC.REPORTS_GET, () =>
    memoize('reports', () => getReports()),
  )
}
