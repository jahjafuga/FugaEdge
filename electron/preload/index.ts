import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type DbHealthcheck, type DbResetResult } from '@shared/ipc-channels'
import type {
  CommitInput,
  CommitResult,
  PreviewInputFile,
  PreviewResult,
} from '@shared/import-types'
import type { DashboardData, TimeRange } from '@shared/dashboard-types'
import type {
  TradeListRow,
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateCountryForSymbolInput,
  UpdateFloatInput,
  UpdateMistakesInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type { ResolvedCountry } from '@/core/country/resolve'
import type {
  CreatePlaybookInput,
  PlaybookWithStats,
  SetPlaybookOnTradeInput,
  UpdatePlaybookInput,
} from '@shared/playbook-types'
import type {
  CalendarMonth,
  DayTagsResult,
  SaveDayTagsInput,
  SaveWeekNotesInput,
  WeekNotesResult,
} from '@shared/calendar-types'
import type { ReportsData } from '@shared/reports-types'
import type { AnalyticsData } from '@shared/analytics-types'
import type { JournalDay, SaveJournalInput } from '@shared/journal-types'
import type {
  ExportResult,
  SettingsPayload,
  SettingsUpdate,
} from '@shared/settings-types'
import type { MassiveKeyStatus } from '@shared/massive-types'
import type { FmpKeyStatus } from '@shared/fmp-types'
import type {
  FloatBackfillProgress,
  FloatBackfillResult,
  IntradayBarsPayload,
  IntradayRefreshResult,
  MarketRefreshProgress,
  MarketRefreshResult,
  ProfileBackfillProgress,
  ProfileBackfillResult,
} from '@shared/market-types'
import type { SaveScreenshotInput, SaveScreenshotResult } from '@shared/chart-types'
import type {
  AddAttachmentsInput,
  AddAttachmentsResult,
  AttachmentRecord,
} from '@shared/attachment-types'
import type {
  SaveSentimentInput,
  SaveTodaySessionInput,
  SessionMeta,
} from '@shared/session-types'
import type { DataHealth } from '@shared/data-health-types'
import type { DayDetail } from '@shared/day-types'
import type { WeekDetail } from '@shared/week-types'

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke(IPC.PING),
  getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),
  dbHealthcheck: (): Promise<DbHealthcheck> => ipcRenderer.invoke(IPC.DB_HEALTHCHECK),
  resetDatabase: (): Promise<DbResetResult> => ipcRenderer.invoke(IPC.DB_RESET),
  importPreview: (files: PreviewInputFile[]): Promise<PreviewResult> =>
    ipcRenderer.invoke(IPC.IMPORT_PREVIEW, files),
  importCommit: (input: CommitInput): Promise<CommitResult> =>
    ipcRenderer.invoke(IPC.IMPORT_COMMIT, input),
  dashboardGet: (range?: TimeRange): Promise<DashboardData> =>
    ipcRenderer.invoke(IPC.DASHBOARD_GET, { range }),
  tradesList: (opts?: { date?: string; deleted?: boolean }): Promise<TradeListRow[]> =>
    ipcRenderer.invoke(IPC.TRADES_LIST, opts),
  // ── v0.2.3 P2b — soft-delete lifecycle ───────────────────────────────────
  tradeSoftDelete: (trade_id: number): Promise<void> =>
    ipcRenderer.invoke(IPC.TRADE_SOFT_DELETE, { trade_id }),
  tradesSoftDeleteBulk: (trade_ids: number[]): Promise<void> =>
    ipcRenderer.invoke(IPC.TRADES_SOFT_DELETE_BULK, { trade_ids }),
  tradeRestore: (trade_id: number): Promise<void> =>
    ipcRenderer.invoke(IPC.TRADE_RESTORE, { trade_id }),
  tradesRestoreBulk: (trade_ids: number[]): Promise<void> =>
    ipcRenderer.invoke(IPC.TRADES_RESTORE_BULK, { trade_ids }),
  tradeHardDelete: (trade_id: number): Promise<void> =>
    ipcRenderer.invoke(IPC.TRADE_HARD_DELETE, { trade_id }),
  tradesHardDeleteBulk: (trade_ids: number[]): Promise<void> =>
    ipcRenderer.invoke(IPC.TRADES_HARD_DELETE_BULK, { trade_ids }),
  tradeNoteSave: (input: UpdateNoteInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_NOTE_SAVE, input),
  tradeTimeframeSave: (input: UpdateTimeframeInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_TIMEFRAME_SAVE, input),
  tradeConfidenceSave: (input: UpdateConfidenceInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_CONFIDENCE_SAVE, input),
  tradeMistakesSave: (input: UpdateMistakesInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_MISTAKES_SAVE, input),
  tradePlannedRiskSave: (input: UpdatePlannedRiskInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_PLANNED_RISK_SAVE, input),
  tradePlannedStopLossSave: (
    input: UpdatePlannedStopLossInput,
  ): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_PLANNED_STOP_LOSS_SAVE, input),
  tradeFloatSave: (input: UpdateFloatInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_FLOAT_SAVE, input),
  tradeCatalystSave: (input: UpdateCatalystInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_CATALYST_SAVE, input),
  tradeCountrySave: (input: UpdateCountryInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_COUNTRY_SAVE, input),
  tradeCountrySaveSymbol: (input: UpdateCountryForSymbolInput): Promise<number> =>
    ipcRenderer.invoke(IPC.TRADE_COUNTRY_SAVE_SYMBOL, input),
  countryResolve: (symbol: string): Promise<ResolvedCountry | null> =>
    ipcRenderer.invoke(IPC.COUNTRY_RESOLVE, symbol),
  countryBackfill: (force?: boolean): Promise<{
    updated: number; skipped: number; failed: number;
    apiKeyMissing: boolean; errors: { symbol: string; message: string }[]; durationMs: number
  }> => ipcRenderer.invoke(IPC.COUNTRY_BACKFILL, { force: !!force }),
  countryOnBackfillProgress: (
    cb: (p: { current: number; total: number; symbol: string }) => void,
  ): (() => void) => {
    const listener = (_e: unknown, p: { current: number; total: number; symbol: string }) => cb(p)
    ipcRenderer.on(IPC.COUNTRY_BACKFILL_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.COUNTRY_BACKFILL_PROGRESS, listener)
    }
  },
  floatBackfill: (): Promise<FloatBackfillResult> =>
    ipcRenderer.invoke(IPC.FLOAT_BACKFILL),
  floatOnBackfillProgress: (cb: (p: FloatBackfillProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: FloatBackfillProgress) => cb(p)
    ipcRenderer.on(IPC.FLOAT_BACKFILL_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.FLOAT_BACKFILL_PROGRESS, listener)
    }
  },
  profileBackfill: (force?: boolean): Promise<ProfileBackfillResult> =>
    ipcRenderer.invoke(IPC.PROFILE_BACKFILL, { force: !!force }),
  profileOnBackfillProgress: (cb: (p: ProfileBackfillProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: ProfileBackfillProgress) => cb(p)
    ipcRenderer.on(IPC.PROFILE_BACKFILL_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.PROFILE_BACKFILL_PROGRESS, listener)
    }
  },
  attachmentsList: (tradeId: number): Promise<AttachmentRecord[]> =>
    ipcRenderer.invoke(IPC.ATTACHMENTS_LIST, tradeId),
  attachmentsAdd: (input: AddAttachmentsInput): Promise<AddAttachmentsResult> =>
    ipcRenderer.invoke(IPC.ATTACHMENTS_ADD, input),
  attachmentsDelete: (id: number): Promise<AttachmentRecord | null> =>
    ipcRenderer.invoke(IPC.ATTACHMENTS_DELETE, id),
  calendarGet: (year: number, month: number): Promise<CalendarMonth> =>
    ipcRenderer.invoke(IPC.CALENDAR_GET, { year, month }),
  dayTagsSave: (input: SaveDayTagsInput): Promise<DayTagsResult> =>
    ipcRenderer.invoke(IPC.DAY_TAGS_SAVE, input),
  weekNotesSave: (input: SaveWeekNotesInput): Promise<WeekNotesResult> =>
    ipcRenderer.invoke(IPC.WEEK_NOTES_SAVE, input),
  reportsGet: (): Promise<ReportsData> => ipcRenderer.invoke(IPC.REPORTS_GET),
  analyticsGet: (): Promise<AnalyticsData> => ipcRenderer.invoke(IPC.ANALYTICS_GET),
  journalGet: (date: string): Promise<JournalDay> =>
    ipcRenderer.invoke(IPC.JOURNAL_GET, { date }),
  journalSave: (input: SaveJournalInput): Promise<JournalDay> =>
    ipcRenderer.invoke(IPC.JOURNAL_SAVE, input),
  settingsGet: (): Promise<SettingsPayload> => ipcRenderer.invoke(IPC.SETTINGS_GET),
  settingsSave: (input: SettingsUpdate): Promise<SettingsPayload> =>
    ipcRenderer.invoke(IPC.SETTINGS_SAVE, input),
  testMassiveKey: (apiKey: string): Promise<MassiveKeyStatus> =>
    ipcRenderer.invoke(IPC.SETTINGS_TEST_MASSIVE_KEY, apiKey),
  testFmpKey: (apiKey: string): Promise<FmpKeyStatus> =>
    ipcRenderer.invoke(IPC.SETTINGS_TEST_FMP_KEY, apiKey),
  exportTrades: (): Promise<ExportResult> => ipcRenderer.invoke(IPC.EXPORT_TRADES),
  exportJournal: (): Promise<ExportResult> => ipcRenderer.invoke(IPC.EXPORT_JOURNAL),
  exportDatabase: (): Promise<ExportResult> => ipcRenderer.invoke(IPC.EXPORT_DATABASE),
  marketRefresh: (force?: boolean): Promise<MarketRefreshResult> =>
    ipcRenderer.invoke(IPC.MARKET_REFRESH, { force: !!force }),
  marketRefreshCancel: (): Promise<void> => ipcRenderer.invoke(IPC.MARKET_REFRESH_CANCEL),
  marketIntradayRefresh: (force?: boolean): Promise<IntradayRefreshResult> =>
    ipcRenderer.invoke(IPC.MARKET_INTRADAY_REFRESH, { force: !!force }),
  marketIntradayCancel: (): Promise<void> => ipcRenderer.invoke(IPC.MARKET_INTRADAY_CANCEL),
  /** Subscribe to per-symbol market-refresh progress. Returns an unsubscribe fn. */
  marketOnRefreshProgress: (cb: (p: MarketRefreshProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: MarketRefreshProgress) => cb(p)
    ipcRenderer.on(IPC.MARKET_REFRESH_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.MARKET_REFRESH_PROGRESS, listener)
    }
  },
  /** Subscribe to per-(symbol,date) intraday-refresh progress. Returns an unsubscribe fn. */
  marketOnIntradayProgress: (cb: (p: MarketRefreshProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: MarketRefreshProgress) => cb(p)
    ipcRenderer.on(IPC.MARKET_INTRADAY_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.MARKET_INTRADAY_PROGRESS, listener)
    }
  },
  intradayBarsGet: (
    symbol: string,
    date: string,
    force?: boolean,
  ): Promise<IntradayBarsPayload> =>
    ipcRenderer.invoke(IPC.INTRADAY_BARS_GET, { symbol, date, force: !!force }),
  // v0.2.4 — save a branded chart screenshot. Renderer (commit 2b) produces the
  // PNG bytes; main shows the save dialog + writes the file. Mirrors export* above.
  chartSaveScreenshot: (input: SaveScreenshotInput): Promise<SaveScreenshotResult> =>
    ipcRenderer.invoke(IPC.CHART_SAVE_SCREENSHOT, input),
  // [LADDER-DIAG] temp — one-way diagnostic forward to main stdout. Strip later.
  ladderDiag: (msg: string): void => ipcRenderer.send(IPC.LADDER_DIAG, msg),
  playbooksList: (): Promise<PlaybookWithStats[]> =>
    ipcRenderer.invoke(IPC.PLAYBOOKS_LIST),
  playbookCreate: (input: CreatePlaybookInput): Promise<PlaybookWithStats> =>
    ipcRenderer.invoke(IPC.PLAYBOOK_CREATE, input),
  playbookUpdate: (input: UpdatePlaybookInput): Promise<PlaybookWithStats> =>
    ipcRenderer.invoke(IPC.PLAYBOOK_UPDATE, input),
  tradePlaybookSave: (input: SetPlaybookOnTradeInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_PLAYBOOK_SAVE, input),
  playbookDelete: (
    id: number,
  ): Promise<{ deleted: boolean; trades_unlinked: number }> =>
    ipcRenderer.invoke(IPC.PLAYBOOK_DELETE, id),
  sessionSentimentSave: (input: SaveSentimentInput): Promise<SessionMeta> =>
    ipcRenderer.invoke(IPC.SESSION_SENTIMENT_SAVE, input),
  sessionListAll: (): Promise<SessionMeta[]> =>
    ipcRenderer.invoke(IPC.SESSION_LIST_ALL),
  sessionGet: (date: string): Promise<SessionMeta | null> =>
    ipcRenderer.invoke(IPC.SESSION_GET, date),
  sessionTodaySave: (input: SaveTodaySessionInput): Promise<SessionMeta> =>
    ipcRenderer.invoke(IPC.SESSION_TODAY_SAVE, input),
  // ── Auto-updater ─────────────────────────────────────────────────────
  updaterGetStatus: (): Promise<UpdaterStatus> =>
    ipcRenderer.invoke(IPC.UPDATER_GET_STATUS),
  updaterCheckNow: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATER_CHECK_NOW),
  updaterQuitAndInstall: (): Promise<void> =>
    ipcRenderer.invoke(IPC.UPDATER_QUIT_AND_INSTALL),
  /** Subscribe to push notifications from the main-process auto-updater.
   *  Returns an unsubscribe function — call it in a useEffect cleanup. */
  updaterOnStatus: (cb: (status: UpdaterStatus) => void): (() => void) => {
    const listener = (_e: unknown, status: UpdaterStatus) => cb(status)
    ipcRenderer.on(IPC.UPDATER_STATUS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.UPDATER_STATUS, listener)
    }
  },
  dataHealthGet: (): Promise<DataHealth> =>
    ipcRenderer.invoke(IPC.DATA_HEALTH_GET),
  dataHealthAcknowledgeCollisions: (): Promise<DataHealth> =>
    ipcRenderer.invoke(IPC.DATA_HEALTH_ACKNOWLEDGE_COLLISIONS),
  dayDetailGet: (date: string): Promise<DayDetail> =>
    ipcRenderer.invoke(IPC.DAY_GET_DETAIL, date),
  dayNoteSave: (date: string, body: string): Promise<void> =>
    ipcRenderer.invoke(IPC.DAY_NOTE_SAVE, { date, body }),
  dayMistakesSave: (date: string, tags: string[]): Promise<void> =>
    ipcRenderer.invoke(IPC.DAY_MISTAKES_SAVE, { date, tags }),
  weekDetailGet: (weekStart: string): Promise<WeekDetail> =>
    ipcRenderer.invoke(IPC.WEEK_GET_DETAIL, weekStart),
}

// Updater status shape — duplicated from electron/updater so the preload
// can stay free of cross-package imports. Keep in sync if the main-side
// shape changes.
export interface UpdaterStatus {
  state:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'
  version?: string
  notes?: string
  progress?: number
  error?: string
}

export type FugaApi = typeof api

contextBridge.exposeInMainWorld('api', api)
