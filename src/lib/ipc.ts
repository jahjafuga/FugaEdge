import type { CommitInput, PreviewInputFile } from '@shared/import-types'
import type { SaveDayTagsInput, SaveWeekNotesInput } from '@shared/calendar-types'
import type {
  BulkSetCatalystInput,
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateFloatInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type {
  BulkSetPlaybookInput,
  CreatePlaybookInput,
  PlaybookTagInput,
  SetPlaybookOnTradeInput,
  UpdatePlaybookInput,
} from '@shared/playbook-types'
import type {
  BulkSetMistakesInput,
  CreateMistakeDefInput,
  MistakeDefIdInput,
  MistakeTagInput,
  RenameMistakeDefInput,
  ReorderMistakeDefsInput,
} from '@shared/mistakes-types'
import type {
  CreateCatalystDefInput,
  RenameCatalystDefInput,
  ReorderCatalystDefsInput,
  CatalystDefIdInput,
} from '@shared/catalyst-types'
import type { AddAttachmentsInput } from '@shared/attachment-types'
import type { SaveJournalInput } from '@shared/journal-types'
import type { SettingsUpdate } from '@shared/settings-types'
import type {
  AccountStatus,
  CreateAccountInput,
  UpdateAccountInput,
} from '@shared/accounts-types'
import type { TimeRange } from '@shared/dashboard-types'
import type { ListTradesWithTechnicalsOptions } from '@shared/technicals-types'

// Thin renderer-side wrapper around the contextBridge'd `window.api`.
// Provides typed access without sprinkling `window.api.x()` calls everywhere.

export const ipc = {
  ping: () => window.api.ping(),
  getVersion: () => window.api.getVersion(),
  openExternal: (url: string) => window.api.openExternal(url),
  dbHealthcheck: () => window.api.dbHealthcheck(),
  resetDatabase: () => window.api.resetDatabase(),
  importPreview: (files: PreviewInputFile[], previewDate?: string, accountId?: string) =>
    window.api.importPreview(files, previewDate, accountId),
  importCommit: (input: CommitInput) => window.api.importCommit(input),
  dashboardGet: (range?: TimeRange) => window.api.dashboardGet(range),
  tradesList: (opts?: { date?: string; deleted?: boolean }) =>
    window.api.tradesList(opts),
  getTrade: (input: { trade_id: number }) => window.api.getTrade(input),
  listTradesWithTechnicals: (opts?: ListTradesWithTechnicalsOptions) =>
    window.api.listTradesWithTechnicals(opts),
  tradeSoftDelete: (trade_id: number) => window.api.tradeSoftDelete(trade_id),
  tradesSoftDeleteBulk: (trade_ids: number[]) =>
    window.api.tradesSoftDeleteBulk(trade_ids),
  tradeRestore: (trade_id: number) => window.api.tradeRestore(trade_id),
  tradesRestoreBulk: (trade_ids: number[]) =>
    window.api.tradesRestoreBulk(trade_ids),
  tradeHardDelete: (trade_id: number) => window.api.tradeHardDelete(trade_id),
  tradesHardDeleteBulk: (trade_ids: number[]) =>
    window.api.tradesHardDeleteBulk(trade_ids),
  tradeNoteSave: (input: UpdateNoteInput) => window.api.tradeNoteSave(input),
  tradeTimeframeSave: (input: UpdateTimeframeInput) =>
    window.api.tradeTimeframeSave(input),
  tradeConfidenceSave: (input: UpdateConfidenceInput) =>
    window.api.tradeConfidenceSave(input),
  tradePlannedRiskSave: (input: UpdatePlannedRiskInput) =>
    window.api.tradePlannedRiskSave(input),
  tradePlannedStopLossSave: (input: UpdatePlannedStopLossInput) =>
    window.api.tradePlannedStopLossSave(input),
  tradeFloatSave: (input: UpdateFloatInput) =>
    window.api.tradeFloatSave(input),
  tradeCatalystSave: (input: UpdateCatalystInput) =>
    window.api.tradeCatalystSave(input),
  tradesCatalystSaveBulk: (input: BulkSetCatalystInput) =>
    window.api.tradesCatalystSaveBulk(input),
  tradeCountrySave: (input: UpdateCountryInput) => window.api.tradeCountrySave(input),
  tradeCountrySaveSymbol: (input: import('@shared/trades-types').UpdateCountryForSymbolInput) =>
    window.api.tradeCountrySaveSymbol(input),
  countryResolve: (symbol: string) => window.api.countryResolve(symbol),
  countryBackfill: (force?: boolean) => window.api.countryBackfill(force),
  countryOnBackfillProgress: (
    cb: (p: { current: number; total: number; symbol: string }) => void,
  ) => window.api.countryOnBackfillProgress(cb),
  floatBackfill: () => window.api.floatBackfill(),
  floatOnBackfillProgress: (
    cb: (p: import('@shared/market-types').FloatBackfillProgress) => void,
  ) => window.api.floatOnBackfillProgress(cb),
  dailyChangeBackfill: () => window.api.dailyChangeBackfill(),
  dailyChangeOnBackfillProgress: (
    cb: (p: import('@shared/market-types').DailyChangeBackfillProgress) => void,
  ) => window.api.dailyChangeOnBackfillProgress(cb),
  profileBackfill: (force?: boolean) => window.api.profileBackfill(force),
  profileOnBackfillProgress: (
    cb: (p: import('@shared/market-types').ProfileBackfillProgress) => void,
  ) => window.api.profileOnBackfillProgress(cb),
  warmupOnBackfillProgress: (
    cb: (p: import('@shared/market-types').WarmupBackfillProgress) => void,
  ) => window.api.warmupOnBackfillProgress(cb),
  recoverStrandedWarmup: () => window.api.warmupReclearStranded(),
  attachmentsList: (tradeId: number) => window.api.attachmentsList(tradeId),
  attachmentsAdd: (input: AddAttachmentsInput) => window.api.attachmentsAdd(input),
  attachmentsDelete: (id: number) => window.api.attachmentsDelete(id),
  calendarGet: (year: number, month: number) => window.api.calendarGet(year, month),
  calendarYearGet: (year: number) => window.api.calendarYearGet(year),
  dayTagsSave: (input: SaveDayTagsInput) => window.api.dayTagsSave(input),
  weekNotesSave: (input: SaveWeekNotesInput) => window.api.weekNotesSave(input),
  reportsGet: () => window.api.reportsGet(),
  analyticsGet: () => window.api.analyticsGet(),
  journalGet: (date: string) => window.api.journalGet(date),
  journalSave: (input: SaveJournalInput) => window.api.journalSave(input),
  settingsGet: () => window.api.settingsGet(),
  settingsSave: (input: SettingsUpdate) => window.api.settingsSave(input),
  testMassiveKey: (apiKey: string) => window.api.testMassiveKey(apiKey),
  testFmpKey: (apiKey: string) => window.api.testFmpKey(apiKey),
  exportTrades: () => window.api.exportTrades(),
  exportJournal: () => window.api.exportJournal(),
  exportDatabase: () => window.api.exportDatabase(),
  marketRefresh: (force?: boolean) => window.api.marketRefresh(force),
  marketRefreshCancel: () => window.api.marketRefreshCancel(),
  marketIntradayRefresh: (force?: boolean) => window.api.marketIntradayRefresh(force),
  marketIntradayCancel: () => window.api.marketIntradayCancel(),
  marketOnRefreshProgress: (
    cb: (p: import('@shared/market-types').MarketRefreshProgress) => void,
  ) => window.api.marketOnRefreshProgress(cb),
  marketOnIntradayProgress: (
    cb: (p: import('@shared/market-types').MarketRefreshProgress) => void,
  ) => window.api.marketOnIntradayProgress(cb),
  intradayBarsGet: (symbol: string, date: string, force?: boolean) =>
    window.api.intradayBarsGet(symbol, date, force),
  chartSaveScreenshot: (input: import('@shared/chart-types').SaveScreenshotInput) =>
    window.api.chartSaveScreenshot(input),
  playbooksList: () => window.api.playbooksList(),
  playbookCreate: (input: CreatePlaybookInput) => window.api.playbookCreate(input),
  playbookUpdate: (input: UpdatePlaybookInput) => window.api.playbookUpdate(input),
  tradePlaybookSave: (input: SetPlaybookOnTradeInput) =>
    window.api.tradePlaybookSave(input),
  tradesPlaybookSaveBulk: (input: BulkSetPlaybookInput) =>
    window.api.tradesPlaybookSaveBulk(input),
  playbookDelete: (id: number) => window.api.playbookDelete(id),
  playbookTagsGet: (tradeId: number) => window.api.playbookTagsGet(tradeId),
  playbookTagAdd: (input: PlaybookTagInput) => window.api.playbookTagAdd(input),
  playbookTagRemove: (input: PlaybookTagInput) =>
    window.api.playbookTagRemove(input),
  // Beat 2a — mistakes API (Electron-IPC adapter; the web port swaps these for
  // fetch/tRPC). Nothing in the renderer calls them yet.
  mistakeDefsGet: (includeArchived?: boolean) =>
    window.api.mistakeDefsGet(includeArchived),
  tradeMistakeTagsGet: (tradeId: number) =>
    window.api.tradeMistakeTagsGet(tradeId),
  tradeMistakeTagAdd: (input: MistakeTagInput) =>
    window.api.tradeMistakeTagAdd(input),
  tradeMistakeTagRemove: (input: MistakeTagInput) =>
    window.api.tradeMistakeTagRemove(input),
  tradesMistakesSaveBulk: (input: BulkSetMistakesInput) =>
    window.api.tradesMistakesSaveBulk(input),
  // Beat 2b — mistake_def vocabulary writes (Electron-IPC adapter; web port swaps
  // for fetch/tRPC). The delete guard is enforced in the repo, not here.
  mistakeDefCreate: (input: CreateMistakeDefInput) =>
    window.api.mistakeDefCreate(input),
  mistakeDefRename: (input: RenameMistakeDefInput) =>
    window.api.mistakeDefRename(input),
  mistakeDefsReorder: (input: ReorderMistakeDefsInput) =>
    window.api.mistakeDefsReorder(input),
  mistakeDefArchive: (input: MistakeDefIdInput) =>
    window.api.mistakeDefArchive(input),
  mistakeDefUnarchive: (input: MistakeDefIdInput) =>
    window.api.mistakeDefUnarchive(input),
  mistakeDefDelete: (input: MistakeDefIdInput) =>
    window.api.mistakeDefDelete(input),
  // Beat 2 — catalyst_def vocabulary writes (Electron-IPC adapter; web port swaps
  // for fetch/tRPC). The delete guard + rename propagation are enforced in the repo.
  catalystDefsGet: (includeArchived?: boolean) =>
    window.api.catalystDefsGet(includeArchived),
  catalystDefCreate: (input: CreateCatalystDefInput) =>
    window.api.catalystDefCreate(input),
  catalystDefRename: (input: RenameCatalystDefInput) =>
    window.api.catalystDefRename(input),
  catalystDefsReorder: (input: ReorderCatalystDefsInput) =>
    window.api.catalystDefsReorder(input),
  catalystDefArchive: (input: CatalystDefIdInput) =>
    window.api.catalystDefArchive(input),
  catalystDefUnarchive: (input: CatalystDefIdInput) =>
    window.api.catalystDefUnarchive(input),
  catalystDefDelete: (input: CatalystDefIdInput) =>
    window.api.catalystDefDelete(input),
  sessionSentimentSave: (input: import('@shared/session-types').SaveSentimentInput) =>
    window.api.sessionSentimentSave(input),
  sessionListAll: () => window.api.sessionListAll(),
  sessionGet: (date: string) => window.api.sessionGet(date),
  sessionTodaySave: (
    input: import('@shared/session-types').SaveTodaySessionInput,
  ) => window.api.sessionTodaySave(input),
  sessionNoTradeSave: (
    input: import('@shared/session-types').SaveNoTradeDayInput,
  ) => window.api.sessionNoTradeSave(input),
  // ── XP (v0.2.5 Phase A Session 3, D5/L15) — consumed by the Phase B
  // Session 6 weekly-review Complete button.
  xpWeeklyReviewComplete: (input: { weekStart: string }) =>
    window.api.xpWeeklyReviewComplete(input),
  xpWeeklyReviewGet: (input: { weekStart: string }) =>
    window.api.xpWeeklyReviewGet(input),
  // ── Profile page (v0.2.5 Phase B Session 4, L20) ──
  xpSummaryGet: () => window.api.xpSummaryGet(),
  profileGet: () => window.api.profileGet(),
  profileUpdate: (input: import('@shared/identity-types').UpdateProfileInput) =>
    window.api.profileUpdate(input),
  // ── Goals (v0.2.5 Phase B Session 5, L27/L29) ──
  goalsList: () => window.api.goalsList(),
  goalsCreate: (input: {
    title: string
    kind: import('@shared/identity-types').GoalKind
    config: unknown
    preset_id: string | null
  }) => window.api.goalsCreate(input),
  goalsAbandon: (id: string) => window.api.goalsAbandon({ id }),
  goalsProgressRead: () => window.api.goalsProgressRead(),
  badgesList: (opts?: { mint?: boolean }) => window.api.badgesList(opts),
  // ── Trading accounts (multi-account Beat 1) — mutations return the fresh list ──
  accountsList: () => window.api.accountsList(),
  accountsCreate: (input: CreateAccountInput) => window.api.accountsCreate(input),
  accountsUpdate: (id: string, patch: UpdateAccountInput) =>
    window.api.accountsUpdate({ id, patch }),
  accountsSetDefault: (id: string) => window.api.accountsSetDefault({ id }),
  accountsSetStatus: (id: string, status: AccountStatus) =>
    window.api.accountsSetStatus({ id, status }),
  accountsDelete: (id: string) => window.api.accountsDelete({ id }),
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
