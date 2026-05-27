import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '@shared/ipc-channels'
import { openDatabase, closeDatabase } from '../db/database'
import { registerIpcHandlers } from '../db/ipc'
import { registerImportIpc } from '../import/ipc'
import { registerStatsIpc } from '../stats/ipc'
import { registerTradesIpc } from '../trades/ipc'
import { registerCalendarIpc } from '../calendar/ipc'
import { registerReportsIpc } from '../reports/ipc'
import { registerAnalyticsIpc } from '../analytics/ipc'
import { registerJournalIpc } from '../journal/ipc'
import { registerSettingsIpc } from '../settings/ipc'
import { registerDataHealthIpc } from '../data-health/ipc'
import { registerMarketIpc } from '../market/ipc'
import { registerCountryIpc } from '../country/ipc'
import { registerPlaybookIpc } from '../playbook/ipc'
import { registerAttachmentsIpc } from '../attachments/ipc'
import {
  registerAttachmentProtocolHandler,
  registerAttachmentProtocolScheme,
} from '../attachments/protocol'
import { registerSessionIpc } from '../session/ipc'
import { registerUpdaterIpc, startAutoUpdater } from '../updater'

// Privileged custom protocol must be registered BEFORE app.ready. Doing it
// at top-level (module load) is the standard pattern.
registerAttachmentProtocolScheme()

const isDev = !app.isPackaged

// Resolve the taskbar/window icon path. In dev the source PNG sits at
// public/fugaedge-icon.png (same file Vite serves as the renderer favicon).
// In packaged builds it ships via electron-builder's extraResources into
// resourcesPath. Either way we fall back gracefully so a missing file
// doesn't block the window from opening.
function resolveAppIconPath(): string | undefined {
  const candidates = isDev
    ? [join(__dirname, '..', '..', 'public', 'fugaedge-icon.png')]
    : [join(process.resourcesPath, 'fugaedge-icon.png')]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return undefined
}

function createWindow(): BrowserWindow {
  const iconPath = resolveAppIconPath()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0d0f14',
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs CommonJS require for the ipcRenderer bridge
      // Don't throttle background timers / animation frames — traders may
      // tab away and still expect the dashboard's live state to advance
      // (intraday refresh, insights re-detect on schedule, etc.).
      backgroundThrottling: false,
      // Cache compiled JS to disk on first load → ~80-120ms shaved off
      // subsequent cold launches' renderer parse phase.
      v8CacheOptions: 'code',
      // Spellcheck adds dictionary downloads + IPC overhead on text inputs
      // we don't need — the journal/notes UI is short-form.
      spellcheck: false,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '..', 'renderer', 'index.html'))
  }

  return win
}

// App metadata accessor — exposes the package.json version (via Electron's
// own app.getVersion(), which reads the manifest at runtime) so the
// renderer doesn't have to hardcode it anywhere. One-liner; no business
// logic, lives inline rather than in its own ipc module.
ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion())

// Open an external URL in the user's default browser. shell.openExternal
// is a main-only API per ARCHITECTURE.md (renderers can't reach it
// directly), so the renderer routes through this IPC. We allow only
// http(s) URLs as a basic safety check — pasted javascript: or file://
// schemes are rejected even though they couldn't reach this from a
// trusted call path. Returns true when launched, false when refused.
ipcMain.handle(IPC.APP_OPEN_EXTERNAL, async (_e, url: unknown): Promise<boolean> => {
  if (typeof url !== 'string' || url.trim() === '') return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  await shell.openExternal(parsed.toString())
  return true
})

app.whenReady().then(() => {
  openDatabase()
  registerIpcHandlers()
  registerImportIpc()
  registerStatsIpc()
  registerTradesIpc()
  registerCalendarIpc()
  registerReportsIpc()
  registerAnalyticsIpc()
  registerJournalIpc()
  registerSettingsIpc()
  registerDataHealthIpc()
  registerMarketIpc()
  registerCountryIpc()
  registerPlaybookIpc()
  registerAttachmentsIpc()
  registerAttachmentProtocolHandler()
  registerSessionIpc()
  registerUpdaterIpc()
  const win = createWindow()
  // Auto-updater is gated on app.isPackaged inside startAutoUpdater, so
  // dev launches are a no-op. The IPC handlers stay registered either
  // way so the renderer can query status without branching.
  startAutoUpdater(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeDatabase()
})
