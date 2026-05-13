import { ipcMain } from 'electron'
import { IPC, type DbHealthcheck } from '@shared/ipc-channels'
import { getDbPath, listTables, openDatabase } from './database'

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
}
