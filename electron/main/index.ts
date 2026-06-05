import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '@shared/ipc-channels'
import { openDatabase, closeDatabase } from '../db/database'
import { registerIpcHandlers } from '../db/ipc'
import { registerImportIpc } from '../import/ipc'
import { registerStatsIpc } from '../stats/ipc'
import { registerTradesIpc } from '../trades/ipc'
import { registerCalendarIpc } from '../calendar/ipc'
import { registerDayIpc } from '../day/ipc'
import { registerWeekIpc } from '../week/ipc'
import { registerReportsIpc } from '../reports/ipc'
import { registerAnalyticsIpc } from '../analytics/ipc'
import { registerJournalIpc } from '../journal/ipc'
import { registerSettingsIpc } from '../settings/ipc'
import { registerDataHealthIpc } from '../data-health/ipc'
import { registerMarketIpc } from '../market/ipc'
import { runPendingMaeMfeBackfill } from '../market/intraday'
import { registerChartsIpc } from '../charts/ipc'
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

// [LADDER-DIAG] temp — main-process CPU profiler. The in-renderer DevTools profiler
// can't capture the chart freeze (it wedges with the renderer), so sample the
// renderer over the debugger protocol from MAIN and log the top self-time functions
// to stdout (+ write a .cpuprofile). Trigger: F8. Strip with the rest of the diags.
function registerLadderProfiler(win: BrowserWindow): void {
  const DURATION_MS = 12000
  globalShortcut.register('F8', async () => {
    const wc = win.webContents
    if (wc.isDevToolsOpened()) wc.closeDevTools() // DevTools holds the debugger; free it
    try {
      wc.debugger.attach('1.3')
    } catch (e) {
      console.log('[LADDER-PROFILER] attach failed — close DevTools (F12) and press F8 again:', String(e))
      return
    }
    try {
      await wc.debugger.sendCommand('Profiler.enable')
      await wc.debugger.sendCommand('Profiler.start')
      console.log(`[LADDER-PROFILER] RECORDING ${DURATION_MS / 1000}s — do the stretch-to-freeze gesture NOW`)
    } catch (e) {
      console.log('[LADDER-PROFILER] start failed:', String(e))
      try { wc.debugger.detach() } catch { /* ignore */ }
      return
    }
    setTimeout(async () => {
      try {
        const res = await wc.debugger.sendCommand('Profiler.stop')
        const profile = res.profile
        const file = join(process.cwd(), `ladder-cpu-${Date.now()}.cpuprofile`)
        writeFileSync(file, JSON.stringify(profile))
        const nodes = (profile.nodes ?? []) as Array<{
          hitCount?: number
          callFrame: { functionName: string; url: string; lineNumber: number }
        }>
        const top = nodes
          .filter((n) => (n.hitCount ?? 0) > 0)
          .sort((a, b) => (b.hitCount ?? 0) - (a.hitCount ?? 0))
          .slice(0, 20)
        console.log(`[LADDER-PROFILER] saved ${file}`)
        console.log(`[LADDER-PROFILER] ${nodes.length} nodes — TOP self-time (hits / fn / url:line):`)
        for (const n of top) {
          const url = (n.callFrame.url || '').slice(-70)
          console.log(`[LADDER-PROFILER]   ${n.hitCount}  ${n.callFrame.functionName || '(anon)'}  ${url}:${n.callFrame.lineNumber}`)
        }
      } catch (e) {
        console.log('[LADDER-PROFILER] stop/save failed (renderer still wedged? it writes once it catches up):', String(e))
      } finally {
        try { wc.debugger.detach() } catch { /* ignore */ }
      }
    }, DURATION_MS)
  })
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
  registerDayIpc()
  registerWeekIpc()
  registerReportsIpc()
  registerAnalyticsIpc()
  registerJournalIpc()
  registerSettingsIpc()
  registerDataHealthIpc()
  registerMarketIpc()
  registerChartsIpc()
  registerCountryIpc()
  registerPlaybookIpc()
  registerAttachmentsIpc()
  registerAttachmentProtocolHandler()
  registerSessionIpc()
  registerUpdaterIpc()
  const win = createWindow()
  if (isDev) registerLadderProfiler(win) // [LADDER-DIAG] temp — F8 captures a renderer CPU profile to stdout
  // v0.2.3 — after the schema-25 migration nulls trades.mae/mfe, recompute from
  // cached intraday_bars once the window is up. Deferred to ready-to-show +
  // setImmediate so it never blocks first paint; no-op (flag unset) on launches
  // where the migration didn't run. See runPendingMaeMfeBackfill.
  win.once('ready-to-show', () => setImmediate(runPendingMaeMfeBackfill))
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
