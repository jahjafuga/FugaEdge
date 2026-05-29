import type { CommitInput, PreviewInputFile } from '@shared/import-types'
import type { SaveDayTagsInput, SaveWeekNotesInput } from '@shared/calendar-types'
import type {
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateFloatInput,
  UpdateMistakesInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type {
  CreatePlaybookInput,
  SetPlaybookOnTradeInput,
  UpdatePlaybookInput,
} from '@shared/playbook-types'
import type { AddAttachmentsInput } from '@shared/attachment-types'
import type { SaveJournalInput } from '@shared/journal-types'
import type { SettingsUpdate } from '@shared/settings-types'
import type { TimeRange } from '@shared/dashboard-types'

// Thin renderer-side wrapper around the contextBridge'd `window.api`.
// Provides typed access without sprinkling `window.api.x()` calls everywhere.

export const ipc = {
  ping: () => window.api.ping(),
  getVersion: () => window.api.getVersion(),
  openExternal: (url: string) => window.api.openExternal(url),
  dbHealthcheck: () => window.api.dbHealthcheck(),
  resetDatabase: () => window.api.resetDatabase(),
  importPreview: (files: PreviewInputFile[]) => window.api.importPreview(files),
  importCommit: (input: CommitInput) => window.api.importCommit(input),
  dashboardGet: (range?: TimeRange) => window.api.dashboardGet(range),
  tradesList: (opts?: { date?: string }) => window.api.tradesList(opts),
  tradeNoteSave: (input: UpdateNoteInput) => window.api.tradeNoteSave(input),
  tradeTimeframeSave: (input: UpdateTimeframeInput) =>
    window.api.tradeTimeframeSave(input),
  tradeConfidenceSave: (input: UpdateConfidenceInput) =>
    window.api.tradeConfidenceSave(input),
  tradeMistakesSave: (input: UpdateMistakesInput) =>
    window.api.tradeMistakesSave(input),
  tradePlannedRiskSave: (input: UpdatePlannedRiskInput) =>
    window.api.tradePlannedRiskSave(input),
  tradePlannedStopLossSave: (input: UpdatePlannedStopLossInput) =>
    window.api.tradePlannedStopLossSave(input),
  tradeFloatSave: (input: UpdateFloatInput) =>
    window.api.tradeFloatSave(input),
  tradeCatalystSave: (input: UpdateCatalystInput) =>
    window.api.tradeCatalystSave(input),
  tradeCountrySave: (input: UpdateCountryInput) => window.api.tradeCountrySave(input),
  tradeCountrySaveSymbol: (input: import('@shared/trades-types').UpdateCountryForSymbolInput) =>
    window.api.tradeCountrySaveSymbol(input),
  countryResolve: (symbol: string) => window.api.countryResolve(symbol),
  countryBackfill: (force?: boolean) => window.api.countryBackfill(force),
  countryOnBackfillProgress: (
    cb: (p: { current: number; total: number; symbol: string }) => void,
  ) => window.api.countryOnBackfillProgress(cb),
  attachmentsList: (tradeId: number) => window.api.attachmentsList(tradeId),
  attachmentsAdd: (input: AddAttachmentsInput) => window.api.attachmentsAdd(input),
  attachmentsDelete: (id: number) => window.api.attachmentsDelete(id),
  calendarGet: (year: number, month: number) => window.api.calendarGet(year, month),
  dayTagsSave: (input: SaveDayTagsInput) => window.api.dayTagsSave(input),
  weekNotesSave: (input: SaveWeekNotesInput) => window.api.weekNotesSave(input),
  reportsGet: () => window.api.reportsGet(),
  analyticsGet: () => window.api.analyticsGet(),
  journalGet: (date: string) => window.api.journalGet(date),
  journalSave: (input: SaveJournalInput) => window.api.journalSave(input),
  settingsGet: () => window.api.settingsGet(),
  settingsSave: (input: SettingsUpdate) => window.api.settingsSave(input),
  testMassiveKey: (apiKey: string) => window.api.testMassiveKey(apiKey),
  exportTrades: () => window.api.exportTrades(),
  exportJournal: () => window.api.exportJournal(),
  exportDatabase: () => window.api.exportDatabase(),
  marketRefresh: (force?: boolean) => window.api.marketRefresh(force),
  marketIntradayRefresh: (force?: boolean) => window.api.marketIntradayRefresh(force),
  marketOnRefreshProgress: (
    cb: (p: import('@shared/market-types').MarketRefreshProgress) => void,
  ) => window.api.marketOnRefreshProgress(cb),
  marketOnIntradayProgress: (
    cb: (p: import('@shared/market-types').MarketRefreshProgress) => void,
  ) => window.api.marketOnIntradayProgress(cb),
  intradayBarsGet: (symbol: string, date: string, force?: boolean) =>
    window.api.intradayBarsGet(symbol, date, force),
  playbooksList: () => window.api.playbooksList(),
  playbookCreate: (input: CreatePlaybookInput) => window.api.playbookCreate(input),
  playbookUpdate: (input: UpdatePlaybookInput) => window.api.playbookUpdate(input),
  tradePlaybookSave: (input: SetPlaybookOnTradeInput) =>
    window.api.tradePlaybookSave(input),
  playbookDelete: (id: number) => window.api.playbookDelete(id),
  sessionSentimentSave: (input: import('@shared/session-types').SaveSentimentInput) =>
    window.api.sessionSentimentSave(input),
  sessionListAll: () => window.api.sessionListAll(),
  sessionGet: (date: string) => window.api.sessionGet(date),
  sessionTodaySave: (
    input: import('@shared/session-types').SaveTodaySessionInput,
  ) => window.api.sessionTodaySave(input),
  updaterGetStatus: () => window.api.updaterGetStatus(),
  updaterCheckNow: () => window.api.updaterCheckNow(),
  updaterQuitAndInstall: () => window.api.updaterQuitAndInstall(),
  /** Subscribe to updater status pushes. Returns an unsubscribe fn. */
  updaterOnStatus: (cb: (status: UpdaterStatus) => void) =>
    window.api.updaterOnStatus(cb),
  dataHealthGet: () => window.api.dataHealthGet(),
  dataHealthAcknowledgeCollisions: () =>
    window.api.dataHealthAcknowledgeCollisions(),
}

// Re-exported from the preload for renderer-side consumers.
export type UpdaterStatus = Parameters<
  Parameters<typeof window.api.updaterOnStatus>[0]
>[0]
