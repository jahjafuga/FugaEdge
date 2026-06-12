import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '@shared/ipc-channels'
import { resolveDataDirs } from '@/core/runtime/dataDirs'
import { openDatabase, closeDatabase, setDbPathOverride } from '../db/database'
import { registerIpcHandlers } from '../db/ipc'
import { registerImportIpc } from '../import/ipc'
import { registerStatsIpc } from '../stats/ipc'
import { registerTradesIpc } from '../trades/ipc'
import { registerCalendarIpc } from '../calendar/ipc'
import { registerDayIpc } from '../day/ipc'
import { registerWeekIpc } from '../week/ipc'
import { registerReportsIpc } from '../reports/ipc'
import { registerAnalyticsIpc } from '../analytics/ipc'
import { registerTechnicalsIpc } from '../technicals/ipc'
import { registerJournalIpc } from '../journal/ipc'
import { registerSettingsIpc } from '../settings/ipc'
import { registerDataHealthIpc } from '../data-health/ipc'
import { registerMarketIpc } from '../market/ipc'
import { runPendingMaeMfeBackfill } from '../market/intraday'
import { runTradeTechnicalsBackfill } from '../technicals/backfill'
import { runWarmupBackfill } from '../market/warmup-backfill'
import { registerChartsIpc } from '../charts/ipc'
import { registerCountryIpc } from '../country/ipc'
import { registerPlaybookIpc } from '../playbook/ipc'
import { registerAttachmentsIpc } from '../attachments/ipc'
import {
  registerAttachmentProtocolHandler,
  registerAttachmentProtocolScheme,
} from '../attachments/protocol'
import { registerSessionIpc } from '../session/ipc'
import { registerXpIpc } from '../xp/ipc'
import { runXpReconcile } from '../xp/reconcile'
import { registerUpdaterIpc, startAutoUpdater } from '../updater'

// D1 (v0.2.5 Session 0) — dev-DB isolation. MUST run at module load, before
// anything reads app.getPath('userData') (the first reader is openDatabase
// inside whenReady; every consumer — DB, backups, attachments, Chromium
// profile — derives from userData lazily). Dev runs land in
// %APPDATA%\fugaedge-dev so they can never touch the real journal;
// FUGAEDGE_DB_PATH can point a dev run at a fixture DB copy and is ignored
// in packaged builds (resolveDataDirs returns null there).
const dataDirs = resolveDataDirs({
  isPackaged: app.isPackaged,
  appDataDir: app.getPath('appData'),
  envDbPath: process.env.FUGAEDGE_DB_PATH ?? null,
})
if (app.getPath('userData') !== dataDirs.userDataDir) {
  app.setPath('userData', dataDirs.userDataDir)
}
setDbPathOverride(dataDirs.dbPathOverride)

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
  registerDayIpc()
  registerWeekIpc()
  registerReportsIpc()
  registerAnalyticsIpc()
  registerTechnicalsIpc()
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
  registerXpIpc()
  registerUpdaterIpc()
  const win = createWindow()
  // v0.2.3 — after the schema-25 migration nulls trades.mae/mfe, recompute from
  // cached intraday_bars once the window is up. Deferred to ready-to-show +
  // setImmediate so it never blocks first paint; no-op (flag unset) on launches
  // where the migration didn't run. See runPendingMaeMfeBackfill.
  // v0.2.4 §K — at the same ready-to-show beat, run the launch backfill chain.
  // ORDER IS LOAD-BEARING: runWarmupBackfill populates intraday_bars.warmup_bars,
  // and runTradeTechnicalsBackfill then CONSUMES that warmup to flip stub trades
  // from data_complete=0 to 1. Running them in parallel (or technicals first)
  // would let the technicals sweep recompute rows whose warmup hasn't landed yet
  // and re-write placeholders — so first launch would never self-heal. A single
  // awaited async block is the only honest sequencing; separate setImmediates
  // give no ordering guarantee. v0.2.5 Phase A Session 3 (D12/L10) appends the
  // third link: runXpReconcile awards off the technicals snapshots, so it runs
  // AFTER technicals flips stubs complete — xp first would skip discipline
  // bonuses until the next launch. All three are self-gated no-ops at steady
  // state (empty worklist / no stale technicals / zero new intents). One
  // try/catch (log only) so a backfill failure never crashes the app — mirrors
  // the lazy-guard hook shape at electron/market/bars-get.ts:194-209. The
  // win.isDestroyed() guard drops progress emissions after a window close, since
  // wc.send on a destroyed window throws. (runPendingMaeMfeBackfill stays a
  // separate parallel setImmediate — it's the independent v0.2.3 mae/mfe
  // recompute, unrelated to the warmup→technicals→xp chain.)
  win.once('ready-to-show', () => {
    setImmediate(runPendingMaeMfeBackfill)
    setImmediate(async () => {
      try {
        const warmupResult = await runWarmupBackfill({
          onProgress: (p) => {
            if (!win.isDestroyed()) {
              win.webContents.send(IPC.WARMUP_BACKFILL_PROGRESS, p)
            }
          },
        })
        console.info(`[FE launch backfill] warmup: ${JSON.stringify(warmupResult)}`)
        const technicalsResult = await runTradeTechnicalsBackfill({
          onProgress: (p) => {
            if (!win.isDestroyed()) {
              win.webContents.send(IPC.TECHNICALS_BACKFILL_PROGRESS, p)
            }
          },
        })
        console.info(`[FE launch backfill] technicals: ${JSON.stringify(technicalsResult)}`)
        const xpResult = runXpReconcile()
        console.info(`[FE launch backfill] xp: ${JSON.stringify(xpResult)}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[FE launch backfill] warmup→technicals→xp failed: ${msg}`)
      }
    })
  })
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
