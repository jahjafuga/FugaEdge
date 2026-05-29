import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { refreshMarketData, cancelMarketRefresh } from './fetch'
import { refreshIntraday, cancelIntradayRefresh } from './intraday'
import { getIntradayBars } from './bars-get'

interface RefreshInput {
  force?: boolean
}

interface BarsGetInput {
  symbol: string
  date: string
  force?: boolean
}

export function registerMarketIpc(): void {
  ipcMain.handle(IPC.MARKET_REFRESH, (e, input?: RefreshInput) => {
    const wc = BrowserWindow.fromWebContents(e.sender)?.webContents ?? null
    return refreshMarketData({
      force: input?.force === true,
      emitProgress: wc ? (p) => wc.send(IPC.MARKET_REFRESH_PROGRESS, p) : undefined,
    })
  })
  ipcMain.handle(IPC.MARKET_INTRADAY_REFRESH, (e, input?: RefreshInput) => {
    const wc = BrowserWindow.fromWebContents(e.sender)?.webContents ?? null
    return refreshIntraday({
      force: input?.force === true,
      emitProgress: wc ? (p) => wc.send(IPC.MARKET_INTRADAY_PROGRESS, p) : undefined,
    })
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
}
