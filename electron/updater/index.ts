import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '@shared/ipc-channels'

// Auto-update wiring. Lives in the main process per ARCHITECTURE.md —
// the renderer only sees IPC events that map to a banner component.
//
// Behaviour:
//   - On app ready (after window creation), checkForUpdatesAndNotify().
//   - Auto-download an available update silently.
//   - Auto-install on quit so the user doesn't have to think about it.
//   - When the download completes, push an event to the renderer so the
//     UI can show a "restart to apply" banner. The renderer can also
//     trigger an immediate restart via the UPDATER_QUIT_AND_INSTALL IPC.

export interface UpdateStatusPayload {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  notes?: string
  progress?: number
  error?: string
}

let mainWindowRef: BrowserWindow | null = null
let lastStatus: UpdateStatusPayload = { state: 'idle' }

function broadcast(status: UpdateStatusPayload): void {
  lastStatus = status
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(IPC.UPDATER_STATUS, status)
  }
}

export function registerUpdaterIpc(): void {
  ipcMain.handle(IPC.UPDATER_GET_STATUS, () => lastStatus)
  ipcMain.handle(IPC.UPDATER_QUIT_AND_INSTALL, () => {
    // Force-fire even if other windows are open. Auto-install on quit is
    // already enabled below, but this lets the user trigger it now.
    autoUpdater.quitAndInstall(false, true)
  })
  ipcMain.handle(IPC.UPDATER_CHECK_NOW, async () => {
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      broadcast({ state: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  })
}

export function startAutoUpdater(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow

  // Updates only make sense for packaged builds — in dev there's no
  // installer to swap. Skip the check entirely so the dev workflow
  // doesn't fire spurious network calls or errors.
  if (!app.isPackaged) {
    console.info('[FE updater] skipped (dev / unpackaged build)')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Logs surface in the main-process console (electron-updater uses its
  // own logger; pointing at console is enough for now).
  autoUpdater.logger = {
    info:  (m: unknown) => console.info('[FE updater]', m),
    warn:  (m: unknown) => console.warn('[FE updater]', m),
    error: (m: unknown) => console.error('[FE updater]', m),
    // electron-updater's logger interface tolerates a debug stub.
    debug: () => {},
  } as never

  autoUpdater.on('checking-for-update', () => {
    broadcast({ state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    console.info('[FE updater] update available:', info.version)
    broadcast({ state: 'available', version: info.version, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined })
  })
  autoUpdater.on('update-not-available', () => {
    broadcast({ state: 'not-available' })
  })
  autoUpdater.on('download-progress', (p) => {
    broadcast({ state: 'downloading', progress: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    console.info('[FE updater] update downloaded:', info.version)
    broadcast({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    console.error('[FE updater] error:', err)
    broadcast({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  })

  // Kick off an initial check on launch. Notify (default) shows the
  // native notification AND fires our renderer event.
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.warn('[FE updater] initial check failed:', err)
  })
}
