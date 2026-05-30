import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { bumpDataVersion } from '../lib/cache'
import {
  backfillAllCountries,
  resolveForTicker,
  saveTradeCountry,
} from './fetch'
import { applySymbolCountryManual } from '../trades/country'

interface BackfillInput { force?: boolean }
interface SaveCountryInput {
  trade_id: number
  country: string | null
  /** When omitted, defaults to 'manual' (user pressed Save in the picker). */
  source?: 'polygon' | 'inferred' | 'manual' | 'unknown'
}
interface SaveCountrySymbolInput {
  symbol: string
  country: string | null
}

export function registerCountryIpc(): void {
  ipcMain.handle(IPC.COUNTRY_RESOLVE, (_e, symbol: string) =>
    resolveForTicker(symbol),
  )

  ipcMain.handle(IPC.COUNTRY_BACKFILL, async (e, input?: BackfillInput) => {
    const wc = BrowserWindow.fromWebContents(e.sender)?.webContents ?? null
    const result = await backfillAllCountries({
      force: input?.force === true,
      emitProgress: wc
        ? (p) => wc.send(IPC.COUNTRY_BACKFILL_PROGRESS, p)
        : undefined,
    })
    if (result.updated > 0) bumpDataVersion()
    return result
  })

  ipcMain.handle(IPC.TRADE_COUNTRY_SAVE, (_e, input: SaveCountryInput) => {
    const result = saveTradeCountry({
      trade_id: input.trade_id,
      country: input.country,
      source: input.source ?? 'manual',
    })
    bumpDataVersion()
    return result
  })

  // Bulk per-symbol manual override — sets every trade of the ticker.
  ipcMain.handle(IPC.TRADE_COUNTRY_SAVE_SYMBOL, (_e, input: SaveCountrySymbolInput) => {
    const changed = applySymbolCountryManual(input.symbol, input.country)
    if (changed > 0) bumpDataVersion()
    return changed
  })
}
