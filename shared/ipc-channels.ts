export const IPC = {
  PING: 'app:ping',
  APP_GET_VERSION: 'app:getVersion',
  APP_OPEN_EXTERNAL: 'app:openExternal',
  DB_HEALTHCHECK: 'db:healthcheck',
  DB_RESET: 'db:reset',
  IMPORT_PREVIEW: 'import:preview',
  IMPORT_COMMIT: 'import:commit',
  IMPORT_PROGRESS: 'import:progress',
  DASHBOARD_GET: 'dashboard:get',
  TRADES_LIST: 'trades:list',
  TRADE_NOTE_SAVE: 'trade:noteSave',
  CALENDAR_GET: 'calendar:get',
  REPORTS_GET: 'reports:get',
  ANALYTICS_GET: 'analytics:get',
  JOURNAL_GET: 'journal:get',
  JOURNAL_SAVE: 'journal:save',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_TEST_MASSIVE_KEY: 'settings:testMassiveKey',
  /** v0.2.2 Commit A - verify an FMP key (mirrors testMassiveKey). */
  SETTINGS_TEST_FMP_KEY: 'settings:testFmpKey',
  EXPORT_TRADES: 'export:trades',
  EXPORT_JOURNAL: 'export:journal',
  EXPORT_DATABASE: 'export:database',
  MARKET_REFRESH: 'market:refresh',
  MARKET_REFRESH_PROGRESS: 'market:refreshProgress',
  MARKET_REFRESH_CANCEL: 'market:refreshCancel',
  MARKET_INTRADAY_REFRESH: 'market:intradayRefresh',
  MARKET_INTRADAY_PROGRESS: 'market:intradayProgress',
  MARKET_INTRADAY_CANCEL: 'market:intradayCancel',
  INTRADAY_BARS_GET: 'market:intradayBarsGet',
  TRADE_TIMEFRAME_SAVE: 'trade:timeframeSave',
  PLAYBOOKS_LIST: 'playbooks:list',
  PLAYBOOK_CREATE: 'playbook:create',
  PLAYBOOK_UPDATE: 'playbook:update',
  TRADE_PLAYBOOK_SAVE: 'trade:playbookSave',
  PLAYBOOK_DELETE: 'playbook:delete',
  TRADE_CONFIDENCE_SAVE: 'trade:confidenceSave',
  TRADE_MISTAKES_SAVE: 'trade:mistakesSave',
  TRADE_PLANNED_RISK_SAVE: 'trade:plannedRiskSave',
  TRADE_PLANNED_STOP_LOSS_SAVE: 'trade:plannedStopLossSave',
  TRADE_FLOAT_SAVE: 'trade:floatSave',
  TRADE_CATALYST_SAVE: 'trade:catalystSave',
  COUNTRY_RESOLVE: 'country:resolveForTicker',
  COUNTRY_BACKFILL: 'country:backfillAll',
  COUNTRY_BACKFILL_PROGRESS: 'country:backfillProgress',
  // v0.2.2 — standalone float backfill over existing trades (FMP). Separate
  // channel from COUNTRY_BACKFILL: different API + rate limits, independent
  // trigger/progress/result (never coupled into one combined action).
  FLOAT_BACKFILL: 'float:backfillAll',
  FLOAT_BACKFILL_PROGRESS: 'float:backfillProgress',
  TRADE_COUNTRY_SAVE: 'trade:countrySave',
  TRADE_COUNTRY_SAVE_SYMBOL: 'trade:countrySaveSymbol',
  SESSION_SENTIMENT_SAVE: 'session:sentimentSave',
  SESSION_LIST_ALL: 'session:listAll',
  SESSION_GET: 'session:get',
  SESSION_TODAY_SAVE: 'session:todaySave',
  // ── Auto-updater (main → renderer notification + renderer → main control)
  UPDATER_STATUS: 'updater:status',
  UPDATER_GET_STATUS: 'updater:getStatus',
  UPDATER_CHECK_NOW: 'updater:checkNow',
  UPDATER_QUIT_AND_INSTALL: 'updater:quitAndInstall',
  ATTACHMENTS_LIST: 'attachments:list',
  ATTACHMENTS_ADD: 'attachments:add',
  ATTACHMENTS_DELETE: 'attachments:delete',
  DAY_TAGS_SAVE: 'dayTags:save',
  WEEK_NOTES_SAVE: 'weekNotes:save',
  // v0.2.1 — data-health surface for the content_hash migration's historical
  // duplicate banner. _GET returns counts; _ACKNOWLEDGE marks the banner
  // dismissed.
  DATA_HEALTH_GET: 'dataHealth:get',
  DATA_HEALTH_ACKNOWLEDGE_COLLISIONS: 'dataHealth:acknowledgeCollisions',
  // v0.2.2 — Day Detail Modal data source. Returns DayDetail (trades + metrics
  // + day-level notes/mistakes) for the given date.
  DAY_GET_DETAIL: 'day:getDetail',
  // v0.2.2 Day 4 — Day Detail writable fields, both stored on session_meta.
  DAY_NOTE_SAVE: 'day:noteSave',
  DAY_MISTAKES_SAVE: 'day:mistakesSave',
  // v0.2.2 Day 4.5 — tabbed Weekly Review modal data source. Returns
  // WeekDetail (week trades + metrics + week_notes) for a Sunday week_start.
  WEEK_GET_DETAIL: 'week:getDetail',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface DbHealthcheck {
  ok: boolean
  path: string
  tables: string[]
}

export interface DbResetResult {
  /** Absolute path of the renamed-aside fugaedge-reset-<ts>.db safety file. */
  resetPath: string
}
