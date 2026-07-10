import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SettingsUpdate } from '@shared/settings-types'
import { verifyMassive } from '@/services/massive'
import { verifyFmp } from '@/services/fmp'
import { getSettings, saveSettings } from './repo'
import { exportDatabase, exportJournalJson, exportTradesCsv } from './export'
import { bumpDataVersion } from '../lib/cache'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings())
  // SETTINGS_SAVE bumps the analytics data version: analytics reads
  // settings.daily_profit_target (analytics/get.ts:986), a memoized input. The
  // handler is key-agnostic (saveSettings takes an arbitrary patch and can't
  // cheaply tell which key changed), so it bumps on any save — the target key is
  // the one that matters, and a full-cache invalidation on a rare settings write
  // is cheap.
  ipcMain.handle(IPC.SETTINGS_SAVE, (_e, input: SettingsUpdate) => {
    const out = saveSettings(input)
    bumpDataVersion()
    return out
  })
  ipcMain.handle(IPC.SETTINGS_TEST_MASSIVE_KEY, (_e, apiKey: string) =>
    verifyMassive(apiKey),
  )
  // v0.2.2 Commit A — FMP key verification (mirror of testMassiveKey).
  // Key is passed from renderer over IPC, verified in main, never logged.
  ipcMain.handle(IPC.SETTINGS_TEST_FMP_KEY, (_e, apiKey: string) =>
    verifyFmp(apiKey),
  )
  ipcMain.handle(IPC.EXPORT_TRADES, (e) => exportTradesCsv(e.sender))
  ipcMain.handle(IPC.EXPORT_JOURNAL, (e) => exportJournalJson(e.sender))
  ipcMain.handle(IPC.EXPORT_DATABASE, (e) => exportDatabase(e.sender))
}
