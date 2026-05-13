import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { refreshMarketData } from './fetch'
import { refreshIntraday } from './intraday'
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
  ipcMain.handle(IPC.MARKET_REFRESH, (_e, input?: RefreshInput) =>
    refreshMarketData({ force: input?.force === true }),
  )
  ipcMain.handle(IPC.MARKET_INTRADAY_REFRESH, (_e, input?: RefreshInput) =>
    refreshIntraday({ force: input?.force === true }),
  )
  ipcMain.handle(IPC.INTRADAY_BARS_GET, (_e, input: BarsGetInput) =>
    getIntradayBars(input.symbol, input.date, { force: input.force === true }),
  )
}
