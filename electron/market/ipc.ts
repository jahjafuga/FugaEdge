import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { refreshMarketData, cancelMarketRefresh } from './fetch'
import { refreshIntraday, cancelIntradayRefresh } from './intraday'
import { getIntradayBars } from './bars-get'
import { runWarmupBackfill } from './warmup-backfill'
import { runTradeTechnicalsBackfill } from '../technicals/backfill'
import { runXpReconcile } from '../xp/reconcile'
import { reclearStrandedWarmupMarkers, tradeCountsByKey } from './repo'
import { bumpDataVersion } from '../lib/cache'

interface RefreshInput {
  force?: boolean
}

interface BarsGetInput {
  symbol: string
  date: string
  force?: boolean
}

export function registerMarketIpc(): void {
  ipcMain.handle(IPC.MARKET_REFRESH, async (e, input?: RefreshInput) => {
    const wc = BrowserWindow.fromWebContents(e.sender)?.webContents ?? null
    const result = await refreshMarketData({
      force: input?.force === true,
      emitProgress: wc ? (p) => wc.send(IPC.MARKET_REFRESH_PROGRESS, p) : undefined,
    })
    // A market refresh rewrites market_data (float / avg_volume / daily_volumes /
    // sector / industry), which the memoized reports payload reads via
    // getAllMarketRows() — the byFloat / byRvol Volume Analysis and the
    // sector / industry breakdowns (electron/reports/get.ts). reports is
    // version-stamped against the shared global dataVersion, so without this bump
    // Analytics > reports serves the pre-refresh rollups until TTL/restart. AFTER
    // the await so it reflects the completed write (mirrors day/ipc.ts + the
    // 4cf6349 cluster). analytics reads no market_data — this is the reports cache;
    // the shared dataVersion covers it.
    bumpDataVersion()
    return result
  })
  ipcMain.handle(IPC.MARKET_INTRADAY_REFRESH, async (e, input?: RefreshInput) => {
    const wc = BrowserWindow.fromWebContents(e.sender)?.webContents ?? null
    const result = await refreshIntraday({
      force: input?.force === true,
      emitProgress: wc ? (p) => wc.send(IPC.MARKET_INTRADAY_PROGRESS, p) : undefined,
    })
    // v0.2.4 §K — chain warmup → technicals onto refresh completion so a manual
    // Settings refresh resolves in-session instead of waiting for next launch.
    // ORDER IS LOAD-BEARING (mirrors the launch arming in electron/main/index.ts):
    // runWarmupBackfill populates intraday_bars.warmup_bars, then
    // runTradeTechnicalsBackfill consumes it to flip stub trades data_complete
    // 0 → 1. Skipped on cancel (parity with the ema9/maeMfe chains inside
    // runRefresh). The handler awaits refreshIntraday's FULL resolution, so this
    // one chain covers BOTH internal completion paths — the attempted===0
    // early-return and the main worker-pool path. Progress emits on the §K
    // warmup channel + the existing technicals channel, wc-gated like the
    // refresh emitter above (intraday.ts stays web-portable — no wc.send there).
    if (!result.cancelled) {
      try {
        await runWarmupBackfill({
          onProgress: wc ? (p) => wc.send(IPC.WARMUP_BACKFILL_PROGRESS, p) : undefined,
        })
        await runTradeTechnicalsBackfill({
          onProgress: wc ? (p) => wc.send(IPC.TECHNICALS_BACKFILL_PROGRESS, p) : undefined,
        })
        // v0.2.5 Phase A Session 3 (D12/L10) — third link, same order
        // rationale as the launch chain: technicals flips stubs complete,
        // THEN xp awards them.
        runXpReconcile()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[FE refresh chain] warmup→technicals→xp failed: ${msg}`)
      }
    }
    return result
  })
  ipcMain.handle(IPC.INTRADAY_BARS_GET, (_e, input: BarsGetInput) =>
    getIntradayBars(input.symbol, input.date, { force: input.force === true }),
  )
  // Coarse cancel — fire-and-forget; the refresh promise still resolves with
  // cancelled:true once in-flight pairs finish (the airtight settle chain).
  ipcMain.handle(IPC.MARKET_REFRESH_CANCEL, () => {
    cancelMarketRefresh()
  })
  ipcMain.handle(IPC.MARKET_INTRADAY_CANCEL, () => {
    cancelIntradayRefresh()
  })
  // v0.2.4 §K.1.4 — Settings "Recover stranded indicators" button. Re-clears the
  // locked-legit-empty warmup markers (instant, synchronous), reports how many
  // TRADES that frees (the user thinks in trades; reclear returns keys, so we join
  // keys → trades via tradeCountsByKey), then fires the throttled
  // warmup → technicals → xp re-fetch in the BACKGROUND.
  //
  // FIRE-AND-FORGET (do NOT await): the button returns instantly with the counts;
  // the paced re-fetch streams its own progress on the existing Indicators row
  // (WARMUP_BACKFILL_PROGRESS), mirroring the launch arming. Same order + try/catch
  // shape as the MARKET_INTRADAY_REFRESH chain above.
  //
  // CRITICAL: this must NOT call refreshIntraday / pass force — the intraday refresh
  // path overwrites warmup_bars, which would wipe the very data this recovery
  // restores. Recovery goes straight to runWarmupBackfill (worklist-scoped to the
  // keys we just re-cleared) and never touches the active-day refresh.
  ipcMain.handle(IPC.WARMUP_RECLEAR, (e) => {
    const wc = BrowserWindow.fromWebContents(e.sender)?.webContents ?? null
    const keys = reclearStrandedWarmupMarkers()
    if (keys.length === 0) return { recleared: 0, tradesQueued: 0 }
    const counts = tradeCountsByKey(keys)
    const tradesQueued = keys.reduce(
      (sum, k) => sum + (counts[`${k.symbol}|${k.date}`] ?? 0),
      0,
    )
    void (async () => {
      try {
        await runWarmupBackfill({
          onProgress: wc ? (p) => wc.send(IPC.WARMUP_BACKFILL_PROGRESS, p) : undefined,
        })
        await runTradeTechnicalsBackfill({
          onProgress: wc ? (p) => wc.send(IPC.TECHNICALS_BACKFILL_PROGRESS, p) : undefined,
        })
        runXpReconcile()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[FE warmup recover] reclear→warmup→technicals→xp failed: ${msg}`)
      }
    })()
    return { recleared: keys.length, tradesQueued }
  })
}
