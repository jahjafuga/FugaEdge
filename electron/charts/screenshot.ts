import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import type { SaveScreenshotInput, SaveScreenshotResult } from '@shared/chart-types'

// Save a chart screenshot the renderer has already captured + composited into
// PNG bytes. Pure file I/O — no capture, no compositing (that's the renderer's
// job in commit 2b), no DB. Mirrors electron/settings/export.ts's save-dialog
// flow exactly: resolve the sender's window, showSaveDialog, write on confirm.
// Like the export* handlers, write errors propagate to ipcMain.handle (which
// rejects the renderer's invoke promise) rather than being mapped into the
// result — the ExportResult-style shape has no error field.
export async function saveChartScreenshot(
  sender: Electron.WebContents,
  input: SaveScreenshotInput,
): Promise<SaveScreenshotResult> {
  const win = BrowserWindow.fromWebContents(sender) ?? undefined
  const pick = await dialog.showSaveDialog(win!, {
    title: 'Save chart screenshot',
    defaultPath: input.suggestedName,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  })
  if (pick.canceled || !pick.filePath) return { canceled: true }

  await writeFile(pick.filePath, Buffer.from(input.bytes))
  return { canceled: false, path: pick.filePath }
}
