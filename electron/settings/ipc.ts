import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SettingsUpdate } from '@shared/settings-types'
import { getSettings, saveSettings } from './repo'
import { exportDatabase, exportJournalJson, exportTradesCsv } from './export'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings())
  ipcMain.handle(IPC.SETTINGS_SAVE, (_e, input: SettingsUpdate) =>
    saveSettings(input),
  )
  ipcMain.handle(IPC.EXPORT_TRADES, (e) => exportTradesCsv(e.sender))
  ipcMain.handle(IPC.EXPORT_JOURNAL, (e) => exportJournalJson(e.sender))
  ipcMain.handle(IPC.EXPORT_DATABASE, (e) => exportDatabase(e.sender))
}
