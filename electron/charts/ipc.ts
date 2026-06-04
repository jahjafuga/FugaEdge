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
}
