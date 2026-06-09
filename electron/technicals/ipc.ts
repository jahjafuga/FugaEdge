// v0.2.4 Session 4 — Technical Analysis tab IPC handlers.
//
// listTradesWithTechnicals is a parameterized read (opts: date
// range), so it follows the tradesList precedent — bare handler,
// no memoize. The renderer fetches once on TA-tab mount and
// filters client-side; caching parameterized payloads with a
// single-string key would serve wrong data on filter change.

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { ListTradesWithTechnicalsOptions } from '@shared/technicals-types'
import { listTradesWithTechnicals } from './repo'

export function registerTechnicalsIpc(): void {
  ipcMain.handle(
    IPC.TECHNICALS_LIST,
    (_e, opts?: ListTradesWithTechnicalsOptions) =>
      listTradesWithTechnicals(opts ?? {}),
  )
}
