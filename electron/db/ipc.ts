import { app, ipcMain } from 'electron'
import {
  IPC,
  type DbHealthcheck,
  type DbResetResult,
} from '@shared/ipc-channels'
import { getDbPath, listTables, openDatabase } from './database'
import { resetDatabase } from './reset'

// Delay before relaunch so the DB_RESET IPC reply flushes back to the
// renderer (which is showing "Resetting…") before the process is torn down.
const RELAUNCH_DELAY_MS = 200

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.PING, () => 'pong')

  ipcMain.handle(IPC.DB_HEALTHCHECK, (): DbHealthcheck => {
    openDatabase()
    return {
      ok: true,
      path: getDbPath(),
      tables: listTables(),
    }
  })

  ipcMain.handle(IPC.DB_RESET, (): DbResetResult => {
    // resetDatabase() throws on failure (and reopens the DB first) — the
    // throw propagates to the renderer and NO relaunch is scheduled.
    const result = resetDatabase()
    console.info(`[FJ reset] journal reset → ${result.resetPath}`)
    // Relaunch only after this reply has flushed to the renderer.
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, RELAUNCH_DELAY_MS)
    return result
  })
}
