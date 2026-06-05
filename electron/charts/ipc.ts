import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SaveScreenshotInput } from '@shared/chart-types'
import { saveChartScreenshot } from './screenshot'

export function registerChartsIpc(): void {
  // Needs both the sender (dialog parent window, like export*) and the input
  // (PNG bytes + suggested name), so it takes (e, input) — a faithful blend of
  // export's (e) and attachments' (_e, input) registrations.
  ipcMain.handle(IPC.CHART_SAVE_SCREENSHOT, (e, input: SaveScreenshotInput) =>
    saveChartScreenshot(e.sender, input),
  )
  // [LADDER-DIAG] temp — forward renderer diagnostics to main stdout (survives a
  // renderer-thread freeze, unlike the DevTools console buffer). Strip later.
  ipcMain.on(IPC.LADDER_DIAG, (_e, msg: string) => {
    console.log('[LADDER-IPC]', msg)
  })
}
