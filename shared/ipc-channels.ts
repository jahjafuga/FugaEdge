export const IPC = {
  PING: 'app:ping',
  DB_HEALTHCHECK: 'db:healthcheck',
  IMPORT_PREVIEW: 'import:preview',
  IMPORT_COMMIT: 'import:commit',
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
  EXPORT_TRADES: 'export:trades',
  EXPORT_JOURNAL: 'export:journal',
  EXPORT_DATABASE: 'export:database',
  MARKET_REFRESH: 'market:refresh',
  MARKET_INTRADAY_REFRESH: 'market:intradayRefresh',
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
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface DbHealthcheck {
  ok: boolean
  path: string
  tables: string[]
}
