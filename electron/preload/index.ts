import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type DbHealthcheck, type DbResetResult } from '@shared/ipc-channels'
import type {
  WeeklyReviewCompleteResult,
  WeeklyReviewStatus,
  XpSummary,
} from '@shared/xp-types'
import type {
  BadgesListResult,
  CreateGoalResult,
  GoalKind,
  GoalsListResult,
  GoalWithProgress,
  Profile,
  UpdateProfileInput,
} from '@shared/identity-types'
import type {
  Account,
  AccountScope,
  AccountStatus,
  CreateAccountInput,
  UpdateAccountInput,
} from '@shared/accounts-types'
import type {
  AccountBalance,
  CashEvent,
  CombinedBalance,
  CreateCashEventInput,
  CreateTransferInput,
  TransferResult,
} from '@shared/cash-types'
import type {
  CommitInput,
  CommitResult,
  PreviewInputFile,
  PreviewResult,
} from '@shared/import-types'
import type { DashboardData, TimeRange } from '@shared/dashboard-types'
import type {
  BulkSetCatalystInput,
  TradeListRow,
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateCountryForSymbolInput,
  UpdateFloatInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type { ResolvedCountry } from '@/core/country/resolve'
import type {
  BulkSetPlaybookInput,
  CreatePlaybookInput,
  PlaybookTag,
  PlaybookTagInput,
  PlaybookWithStats,
  SetPlaybookOnTradeInput,
  UpdatePlaybookInput,
} from '@shared/playbook-types'
import type {
  BulkSetMistakesInput,
  CreateMistakeDefInput,
  DeleteMistakeDefResult,
  MistakeDef,
  MistakeDefIdInput,
  MistakeTag,
  MistakeTagInput,
  RenameMistakeDefInput,
  ReorderMistakeDefsInput,
} from '@shared/mistakes-types'
import type {
  CatalystDef,
  CatalystDefIdInput,
  CreateCatalystDefInput,
  DeleteCatalystDefResult,
  RenameCatalystDefInput,
  ReorderCatalystDefsInput,
} from '@shared/catalyst-types'
import type {
  CalendarMonth,
  CalendarYear,
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
  DailyChangeBackfillProgress,
  DailyChangeBackfillResult,
  FloatBackfillProgress,
  FloatBackfillResult,
  IntradayBarsPayload,
  IntradayRefreshResult,
  MarketRefreshProgress,
  MarketRefreshResult,
  ProfileBackfillProgress,
  ProfileBackfillResult,
  WarmupBackfillProgress,
} from '@shared/market-types'
import type { SaveScreenshotInput, SaveScreenshotResult } from '@shared/chart-types'
import type {
  AddAttachmentsInput,
  AddAttachmentsResult,
  AttachmentRecord,
} from '@shared/attachment-types'
import type {
  SaveNoTradeDayInput,
  SaveSentimentInput,
  SaveTodaySessionInput,
  SessionMeta,
} from '@shared/session-types'
import type { DataHealth } from '@shared/data-health-types'
import type { DayDetail, RuleBreaksResult } from '@shared/day-types'
import type { WeekDetail } from '@shared/week-types'
import type {
  ListTradesWithTechnicalsOptions,
  TradeWithTechnicalsRow,
} from '@shared/technicals-types'

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke(IPC.PING),
  getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),
  dbHealthcheck: (): Promise<DbHealthcheck> => ipcRenderer.invoke(IPC.DB_HEALTHCHECK),
  resetDatabase: (): Promise<DbResetResult> => ipcRenderer.invoke(IPC.DB_RESET),
  importPreview: (
    files: PreviewInputFile[],
    previewDate?: string,
    accountId?: string,
  ): Promise<PreviewResult> =>
    ipcRenderer.invoke(IPC.IMPORT_PREVIEW, files, previewDate, accountId),
  importCommit: (input: CommitInput): Promise<CommitResult> =>
    ipcRenderer.invoke(IPC.IMPORT_COMMIT, input),
  dashboardGet: (range?: TimeRange, scope?: AccountScope): Promise<DashboardData> =>
    ipcRenderer.invoke(IPC.DASHBOARD_GET, { range, scope }),
  tradesList: (opts?: {
    date?: string
    deleted?: boolean
    accountScope?: AccountScope
  }): Promise<TradeListRow[]> => ipcRenderer.invoke(IPC.TRADES_LIST, opts),
  getTrade: (input: { trade_id: number }): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_GET, input),
  listTradesWithTechnicals: (opts?: ListTradesWithTechnicalsOptions): Promise<TradeWithTechnicalsRow[]> =>
    ipcRenderer.invoke(IPC.TECHNICALS_LIST, opts),
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
  tradesCatalystSaveBulk: (input: BulkSetCatalystInput): Promise<TradeListRow[]> =>
    ipcRenderer.invoke(IPC.TRADES_CATALYST_SAVE_BULK, input),
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
  dailyChangeBackfill: (): Promise<DailyChangeBackfillResult> =>
    ipcRenderer.invoke(IPC.DAILY_CHANGE_BACKFILL),
  dailyChangeOnBackfillProgress: (
    cb: (p: DailyChangeBackfillProgress) => void,
  ): (() => void) => {
    const listener = (_e: unknown, p: DailyChangeBackfillProgress) => cb(p)
    ipcRenderer.on(IPC.DAILY_CHANGE_BACKFILL_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.DAILY_CHANGE_BACKFILL_PROGRESS, listener)
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
  warmupOnBackfillProgress: (cb: (p: WarmupBackfillProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: WarmupBackfillProgress) => cb(p)
    ipcRenderer.on(IPC.WARMUP_BACKFILL_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.WARMUP_BACKFILL_PROGRESS, listener)
    }
  },
  // v0.2.4 §K.1.4 — trigger the "Recover stranded indicators" recovery. Returns
  // instantly with { recleared, tradesQueued }; the paced re-fetch then streams on
  // WARMUP_BACKFILL_PROGRESS (subscribe via warmupOnBackfillProgress above).
  warmupReclearStranded: (): Promise<{ recleared: number; tradesQueued: number }> =>
    ipcRenderer.invoke(IPC.WARMUP_RECLEAR),
  attachmentsList: (tradeId: number): Promise<AttachmentRecord[]> =>
    ipcRenderer.invoke(IPC.ATTACHMENTS_LIST, tradeId),
  attachmentsAdd: (input: AddAttachmentsInput): Promise<AddAttachmentsResult> =>
    ipcRenderer.invoke(IPC.ATTACHMENTS_ADD, input),
  attachmentsDelete: (id: number): Promise<AttachmentRecord | null> =>
    ipcRenderer.invoke(IPC.ATTACHMENTS_DELETE, id),
  calendarGet: (year: number, month: number, scope?: AccountScope): Promise<CalendarMonth> =>
    ipcRenderer.invoke(IPC.CALENDAR_GET, { year, month, scope }),
  calendarYearGet: (year: number, scope?: AccountScope): Promise<CalendarYear> =>
    ipcRenderer.invoke(IPC.CALENDAR_YEAR_GET, { year, scope }),
  dayTagsSave: (input: SaveDayTagsInput): Promise<DayTagsResult> =>
    ipcRenderer.invoke(IPC.DAY_TAGS_SAVE, input),
  weekNotesSave: (input: SaveWeekNotesInput): Promise<WeekNotesResult> =>
    ipcRenderer.invoke(IPC.WEEK_NOTES_SAVE, input),
  reportsGet: (scope?: AccountScope): Promise<ReportsData> =>
    ipcRenderer.invoke(IPC.REPORTS_GET, { scope }),
  analyticsGet: (scope?: AccountScope): Promise<AnalyticsData> =>
    ipcRenderer.invoke(IPC.ANALYTICS_GET, { scope }),
  journalGet: (date: string, scope?: AccountScope): Promise<JournalDay> =>
    ipcRenderer.invoke(IPC.JOURNAL_GET, { date, scope }),
  journalSave: (input: SaveJournalInput): Promise<JournalDay> =>
    ipcRenderer.invoke(IPC.JOURNAL_SAVE, input),
  // THE FINAL TWO (build A) — READ-ONLY: rule id -> distinct marked days, for
  // the Settings Remove guard.
  journalRuleUsageGet: (): Promise<Record<string, number>> =>
    ipcRenderer.invoke(IPC.JOURNAL_RULE_USAGE_GET),
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
  playbooksList: (opts?: { accountScope?: AccountScope }): Promise<PlaybookWithStats[]> =>
    ipcRenderer.invoke(IPC.PLAYBOOKS_LIST, opts),
  playbookCreate: (input: CreatePlaybookInput): Promise<PlaybookWithStats> =>
    ipcRenderer.invoke(IPC.PLAYBOOK_CREATE, input),
  playbookUpdate: (input: UpdatePlaybookInput): Promise<PlaybookWithStats> =>
    ipcRenderer.invoke(IPC.PLAYBOOK_UPDATE, input),
  tradePlaybookSave: (input: SetPlaybookOnTradeInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_PLAYBOOK_SAVE, input),
  tradesPlaybookSaveBulk: (input: BulkSetPlaybookInput): Promise<TradeListRow[]> =>
    ipcRenderer.invoke(IPC.TRADES_PLAYBOOK_SAVE_BULK, input),
  playbookDelete: (
    id: number,
  ): Promise<{ deleted: boolean; trades_unlinked: number }> =>
    ipcRenderer.invoke(IPC.PLAYBOOK_DELETE, id),
  playbookTagsGet: (tradeId: number): Promise<PlaybookTag[]> =>
    ipcRenderer.invoke(IPC.TRADE_PLAYBOOK_TAGS_GET, tradeId),
  playbookTagAdd: (input: PlaybookTagInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_PLAYBOOK_TAG_ADD, input),
  playbookTagRemove: (input: PlaybookTagInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_PLAYBOOK_TAG_REMOVE, input),
  mistakeDefsGet: (includeArchived?: boolean): Promise<MistakeDef[]> =>
    ipcRenderer.invoke(IPC.MISTAKE_DEFS_GET, includeArchived),
  tradeMistakeTagsGet: (tradeId: number): Promise<MistakeTag[]> =>
    ipcRenderer.invoke(IPC.TRADE_MISTAKE_TAGS_GET, tradeId),
  tradeMistakeTagAdd: (input: MistakeTagInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_MISTAKE_TAG_ADD, input),
  tradeMistakeTagRemove: (input: MistakeTagInput): Promise<TradeListRow | null> =>
    ipcRenderer.invoke(IPC.TRADE_MISTAKE_TAG_REMOVE, input),
  tradesMistakesSaveBulk: (input: BulkSetMistakesInput): Promise<TradeListRow[]> =>
    ipcRenderer.invoke(IPC.TRADES_MISTAKES_SAVE_BULK, input),
  mistakeDefCreate: (input: CreateMistakeDefInput): Promise<MistakeDef> =>
    ipcRenderer.invoke(IPC.MISTAKE_DEF_CREATE, input),
  mistakeDefRename: (input: RenameMistakeDefInput): Promise<MistakeDef> =>
    ipcRenderer.invoke(IPC.MISTAKE_DEF_RENAME, input),
  mistakeDefsReorder: (input: ReorderMistakeDefsInput): Promise<MistakeDef[]> =>
    ipcRenderer.invoke(IPC.MISTAKE_DEFS_REORDER, input),
  mistakeDefArchive: (input: MistakeDefIdInput): Promise<MistakeDef> =>
    ipcRenderer.invoke(IPC.MISTAKE_DEF_ARCHIVE, input),
  mistakeDefUnarchive: (input: MistakeDefIdInput): Promise<MistakeDef> =>
    ipcRenderer.invoke(IPC.MISTAKE_DEF_UNARCHIVE, input),
  mistakeDefDelete: (input: MistakeDefIdInput): Promise<DeleteMistakeDefResult> =>
    ipcRenderer.invoke(IPC.MISTAKE_DEF_DELETE, input),
  catalystDefsGet: (includeArchived?: boolean): Promise<CatalystDef[]> =>
    ipcRenderer.invoke(IPC.CATALYST_DEFS_GET, includeArchived),
  catalystDefCreate: (input: CreateCatalystDefInput): Promise<CatalystDef> =>
    ipcRenderer.invoke(IPC.CATALYST_DEF_CREATE, input),
  catalystDefRename: (input: RenameCatalystDefInput): Promise<CatalystDef> =>
    ipcRenderer.invoke(IPC.CATALYST_DEF_RENAME, input),
  catalystDefsReorder: (input: ReorderCatalystDefsInput): Promise<CatalystDef[]> =>
    ipcRenderer.invoke(IPC.CATALYST_DEFS_REORDER, input),
  catalystDefArchive: (input: CatalystDefIdInput): Promise<CatalystDef> =>
    ipcRenderer.invoke(IPC.CATALYST_DEF_ARCHIVE, input),
  catalystDefUnarchive: (input: CatalystDefIdInput): Promise<CatalystDef> =>
    ipcRenderer.invoke(IPC.CATALYST_DEF_UNARCHIVE, input),
  catalystDefDelete: (input: CatalystDefIdInput): Promise<DeleteCatalystDefResult> =>
    ipcRenderer.invoke(IPC.CATALYST_DEF_DELETE, input),
  sessionSentimentSave: (input: SaveSentimentInput): Promise<SessionMeta> =>
    ipcRenderer.invoke(IPC.SESSION_SENTIMENT_SAVE, input),
  sessionListAll: (): Promise<SessionMeta[]> =>
    ipcRenderer.invoke(IPC.SESSION_LIST_ALL),
  sessionGet: (date: string): Promise<SessionMeta | null> =>
    ipcRenderer.invoke(IPC.SESSION_GET, date),
  sessionTodaySave: (input: SaveTodaySessionInput): Promise<SessionMeta> =>
    ipcRenderer.invoke(IPC.SESSION_TODAY_SAVE, input),
  sessionNoTradeSave: (input: SaveNoTradeDayInput): Promise<SessionMeta> =>
    ipcRenderer.invoke(IPC.SESSION_NO_TRADE_SAVE, input),
  // ── XP (v0.2.5 Phase A Session 3, D5/L15) ───────────────────────────
  xpWeeklyReviewComplete: (input: {
    weekStart: string
  }): Promise<WeeklyReviewCompleteResult> =>
    ipcRenderer.invoke(IPC.XP_WEEKLY_REVIEW_COMPLETE, input),
  xpWeeklyReviewGet: (input: { weekStart: string }): Promise<WeeklyReviewStatus> =>
    ipcRenderer.invoke(IPC.XP_WEEKLY_REVIEW_GET, input),
  xpSummaryGet: (): Promise<XpSummary> =>
    ipcRenderer.invoke(IPC.XP_SUMMARY_GET),
  // ── Profile (USER profile — v0.2.5 Phase B Session 4, L20) ──────────
  profileGet: (): Promise<Profile> => ipcRenderer.invoke(IPC.PROFILE_GET),
  profileUpdate: (input: UpdateProfileInput): Promise<Profile> =>
    ipcRenderer.invoke(IPC.PROFILE_UPDATE, input),
  // ── Goals (v0.2.5 Phase B Session 5, L27/L29) ───────────────────────
  goalsList: (): Promise<GoalsListResult> => ipcRenderer.invoke(IPC.GOALS_LIST),
  goalsCreate: (input: {
    title: string
    kind: GoalKind
    config: unknown
    preset_id: string | null
  }): Promise<CreateGoalResult> => ipcRenderer.invoke(IPC.GOALS_CREATE, input),
  goalsAbandon: (input: { id: string }): Promise<{ updated: boolean }> =>
    ipcRenderer.invoke(IPC.GOALS_ABANDON, input),
  goalsProgressRead: (): Promise<GoalWithProgress[]> =>
    ipcRenderer.invoke(IPC.GOALS_PROGRESS_READ),
  // ── Badges (v0.2.5 Phase B Session 6) ──
  badgesList: (opts?: { mint?: boolean }): Promise<BadgesListResult> =>
    ipcRenderer.invoke(IPC.BADGES_LIST, opts),
  // ── Trading accounts (multi-account Beat 1) — mutations return the fresh list ──
  accountsList: (): Promise<Account[]> => ipcRenderer.invoke(IPC.ACCOUNTS_LIST),
  accountsCreate: (input: CreateAccountInput): Promise<Account[]> =>
    ipcRenderer.invoke(IPC.ACCOUNTS_CREATE, input),
  accountsUpdate: (input: { id: string; patch: UpdateAccountInput }): Promise<Account[]> =>
    ipcRenderer.invoke(IPC.ACCOUNTS_UPDATE, input),
  accountsSetDefault: (input: { id: string }): Promise<Account[]> =>
    ipcRenderer.invoke(IPC.ACCOUNTS_SET_DEFAULT, input),
  accountsSetStatus: (input: { id: string; status: AccountStatus }): Promise<Account[]> =>
    ipcRenderer.invoke(IPC.ACCOUNTS_SET_STATUS, input),
  accountsDelete: (input: { id: string }): Promise<Account[]> =>
    ipcRenderer.invoke(IPC.ACCOUNTS_DELETE, input),
  // ── Cash ledger (Stage 3 beat 2) — events, transfers, computed balances ──
  cashEventsList: (accountId?: string): Promise<CashEvent[]> =>
    ipcRenderer.invoke(IPC.CASH_EVENTS_LIST, accountId),
  cashEventCreate: (input: CreateCashEventInput): Promise<CashEvent> =>
    ipcRenderer.invoke(IPC.CASH_EVENT_CREATE, input),
  cashEventDelete: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.CASH_EVENT_DELETE, id),
  cashTransferCreate: (input: CreateTransferInput): Promise<TransferResult> =>
    ipcRenderer.invoke(IPC.CASH_TRANSFER_CREATE, input),
  cashTransferDelete: (transferId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.CASH_TRANSFER_DELETE, transferId),
  cashBalanceGet: (accountId: string): Promise<AccountBalance | null> =>
    ipcRenderer.invoke(IPC.CASH_BALANCE_GET, accountId),
  cashBalanceCombined: (): Promise<CombinedBalance> =>
    ipcRenderer.invoke(IPC.CASH_BALANCE_COMBINED),
  cashBalanceSeries: (scope?: AccountScope): Promise<{ date: string; balance: number }[]> =>
    ipcRenderer.invoke(IPC.CASH_BALANCE_SERIES, scope),
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
  dayDetailGet: (date: string, opts?: { accountScope?: AccountScope }): Promise<DayDetail> =>
    ipcRenderer.invoke(IPC.DAY_GET_DETAIL, date, opts),
  dayNoteSave: (date: string, body: string): Promise<void> =>
    ipcRenderer.invoke(IPC.DAY_NOTE_SAVE, { date, body }),
  ruleBreaksSave: (date: string, breaks: string[]): Promise<RuleBreaksResult> =>
    ipcRenderer.invoke(IPC.DAY_RULE_BREAKS_SAVE, { date, breaks }),
  // Beat 2 — READ-ONLY: label -> distinct journal days, for the Settings freeze guard.
  ruleBreakUsageGet: (): Promise<Record<string, number>> =>
    ipcRenderer.invoke(IPC.DAY_RULE_BREAK_USAGE_GET),
  weekDetailGet: (weekStart: string, opts?: { accountScope?: AccountScope }): Promise<WeekDetail> =>
    ipcRenderer.invoke(IPC.WEEK_GET_DETAIL, weekStart, opts),
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
