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
  // v0.2.4 §F1 — single-trade detail fetch for the read-only drill-down sheet
  // (Phase F2). Singular TRADE_ (matches TRADE_NOTE_SAVE etc.); read-only.
  TRADE_GET: 'trade:get',
  // v0.2.3 P2b — soft-delete lifecycle. Singular TRADE_ for single-trade ops
  // (matches TRADE_NOTE_SAVE etc.); plural TRADES_*_BULK for batch ops.
  TRADE_SOFT_DELETE: 'trade:softDelete',
  TRADE_RESTORE: 'trade:restore',
  TRADE_HARD_DELETE: 'trade:hardDelete',
  TRADES_SOFT_DELETE_BULK: 'trades:softDeleteBulk',
  TRADES_RESTORE_BULK: 'trades:restoreBulk',
  TRADES_HARD_DELETE_BULK: 'trades:hardDeleteBulk',
  TRADE_NOTE_SAVE: 'trade:noteSave',
  CALENDAR_GET: 'calendar:get',
  // v0.3.0 Yearly View Beat 1 — 12-month rollup for one year (a single
  // GROUP BY substr(date,1,7) query). Mirrors CALENDAR_GET; read-only,
  // returns CalendarYear { year, months[12], range }.
  CALENDAR_YEAR_GET: 'calendar:yearGet',
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
  // Phase 2 — bulk set the primary playbook on many trades (plural TRADES_*_BULK
  // for batch ops, mirroring TRADES_SOFT_DELETE_BULK).
  TRADES_PLAYBOOK_SAVE_BULK: 'trades:playbookSaveBulk',
  PLAYBOOK_DELETE: 'playbook:delete',
  // v0.2.5 Beat 2 — playbook confluence: read a trade's secondary confluence
  // tag set, and add/remove a secondary tag (the trade_playbooks junction).
  // Trade-scoped, mirroring TRADE_PLAYBOOK_SAVE (the primary link).
  TRADE_PLAYBOOK_TAGS_GET: 'trade:playbookTagsGet',
  TRADE_PLAYBOOK_TAG_ADD: 'trade:playbookTagAdd',
  TRADE_PLAYBOOK_TAG_REMOVE: 'trade:playbookTagRemove',
  // Beat 2a — mistakes API: read the mistake_def vocabulary, and read/add/remove
  // a trade's mistake tags (the trade_mistake junction). Mirrors TRADE_PLAYBOOK_*.
  MISTAKE_DEFS_GET: 'mistake:defsGet',
  TRADE_MISTAKE_TAGS_GET: 'trade:mistakeTagsGet',
  TRADE_MISTAKE_TAG_ADD: 'trade:mistakeTagAdd',
  TRADE_MISTAKE_TAG_REMOVE: 'trade:mistakeTagRemove',
  // Phase 2 — bulk add/remove mistakes across many trades (one channel, mode field).
  TRADES_MISTAKES_SAVE_BULK: 'trades:mistakesSaveBulk',
  // Beat 2b — mistake_def vocabulary writes (CRUD). The repo enforces the delete
  // guard (custom + unreferenced → delete; else archive).
  MISTAKE_DEF_CREATE: 'mistake:defCreate',
  MISTAKE_DEF_RENAME: 'mistake:defRename',
  MISTAKE_DEFS_REORDER: 'mistake:defsReorder',
  MISTAKE_DEF_ARCHIVE: 'mistake:defArchive',
  MISTAKE_DEF_UNARCHIVE: 'mistake:defUnarchive',
  MISTAKE_DEF_DELETE: 'mistake:defDelete',
  // Catalyst vocabulary writes (CRUD) — user-customizable catalyst_def. No tag
  // channels: catalyst is a name string on the trade, not a junction.
  CATALYST_DEFS_GET: 'catalyst:defsGet',
  CATALYST_DEF_CREATE: 'catalyst:defCreate',
  CATALYST_DEF_RENAME: 'catalyst:defRename',
  CATALYST_DEFS_REORDER: 'catalyst:defsReorder',
  CATALYST_DEF_ARCHIVE: 'catalyst:defArchive',
  CATALYST_DEF_UNARCHIVE: 'catalyst:defUnarchive',
  CATALYST_DEF_DELETE: 'catalyst:defDelete',
  TRADE_CONFIDENCE_SAVE: 'trade:confidenceSave',
  TRADE_PLANNED_RISK_SAVE: 'trade:plannedRiskSave',
  TRADE_PLANNED_STOP_LOSS_SAVE: 'trade:plannedStopLossSave',
  TRADE_FLOAT_SAVE: 'trade:floatSave',
  TRADE_CATALYST_SAVE: 'trade:catalystSave',
  // Phase 2 — bulk set catalyst_type on many trades (mirrors TRADES_PLAYBOOK_SAVE_BULK).
  TRADES_CATALYST_SAVE_BULK: 'trades:catalystSaveBulk',
  COUNTRY_RESOLVE: 'country:resolveForTicker',
  COUNTRY_BACKFILL: 'country:backfillAll',
  COUNTRY_BACKFILL_PROGRESS: 'country:backfillProgress',
  // v0.2.2 — standalone float backfill over existing trades (FMP). Separate
  // channel from COUNTRY_BACKFILL: different API + rate limits, independent
  // trigger/progress/result (never coupled into one combined action).
  FLOAT_BACKFILL: 'float:backfillAll',
  FLOAT_BACKFILL_PROGRESS: 'float:backfillProgress',
  // v0.2.5 Trader DNA — standalone daily % change backfill over existing trades
  // (Massive daily bars). Auto-arms once on the schema-31 upgrade; this channel
  // backs the Settings manual retry button. Mirrors FLOAT_BACKFILL.
  DAILY_CHANGE_BACKFILL: 'dailyChange:backfillAll',
  DAILY_CHANGE_BACKFILL_PROGRESS: 'dailyChange:backfillProgress',
  // v0.2.3 Stage A — standalone sector/industry backfill (FMP /stable/profile).
  // Separate channel from FLOAT/COUNTRY: own API call, independent
  // trigger/progress/result.
  // NB (v0.2.5 A3): these two are the FMP COMPANY-profile backfill squatting
  // on the 'profile:' domain for legacy reasons — the USER profile
  // (PROFILE_GET / PROFILE_UPDATE below) is the rightful long-term owner of
  // the prefix. Do not add further company-profile channels here.
  PROFILE_BACKFILL: 'profile:backfillAll',
  PROFILE_BACKFILL_PROGRESS: 'profile:backfillProgress',
  TRADE_COUNTRY_SAVE: 'trade:countrySave',
  TRADE_COUNTRY_SAVE_SYMBOL: 'trade:countrySaveSymbol',
  SESSION_SENTIMENT_SAVE: 'session:sentimentSave',
  SESSION_LIST_ALL: 'session:listAll',
  SESSION_GET: 'session:get',
  SESSION_TODAY_SAVE: 'session:todaySave',
  SESSION_NO_TRADE_SAVE: 'session:noTradeSave',
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
  // + day-level notes) for the given date.
  DAY_GET_DETAIL: 'day:getDetail',
  // v0.2.2 Day 4 — Day Detail writable field, stored on session_meta.
  DAY_NOTE_SAVE: 'day:noteSave',
  // Phase 2 (djsevans87) — Day Detail writable field: per-day rule breaks,
  // stored on journal.rule_breaks (the day_tags column pattern).
  DAY_RULE_BREAKS_SAVE: 'day:ruleBreaksSave',
  // Beat 2 — READ-ONLY usage read (label -> distinct journal days) behind the Settings
  // freeze guard: a rule-break used on >= 1 day cannot be renamed or deleted until Beat 3
  // ships a history-preserving rename. A pure read, so its handler must NOT bumpDataVersion.
  DAY_RULE_BREAK_USAGE_GET: 'day:ruleBreakUsageGet',
  // v0.2.2 Day 4.5 — tabbed Weekly Review modal data source. Returns
  // WeekDetail (week trades + metrics + week_notes) for a Sunday week_start.
  WEEK_GET_DETAIL: 'week:getDetail',
  // ── Chart ──────────────────────────────────────────────────────────────
  // v0.2.4 — branded chart screenshot save. Renderer (commit 2b) captures +
  // composites the PNG bytes; MAIN does the file I/O only (showSaveDialog →
  // writeFile), per ARCHITECTURE.md. Mirrors the export:* save-dialog channels.
  CHART_SAVE_SCREENSHOT: 'chart:saveScreenshot',
  // ── Technicals ─────────────────────────────────────────────────────────
  // v0.2.4 §K — progress for the bulk warmup-bars backfill (runWarmupBackfill),
  // auto-armed at launch AHEAD of the technicals backfill below (warmup
  // populates intraday_bars so the technicals sweep can flip data_complete
  // 0 → 1). 'market:' prefix because the orchestrator is a market-domain module
  // operating on intraday_bars. Subscribed by Settings' "Computing N trades"
  // row (Beat 2.6). Emitter wired by launch arming (Beat 2.4).
  WARMUP_BACKFILL_PROGRESS: 'market:warmupBackfillProgress',
  // v0.2.4 §K.1.4 — user trigger for the Settings "Recover stranded indicators"
  // button: re-clears the locked-legit-empty warmup markers, then fires the
  // throttled warmup -> technicals -> xp re-fetch in the background. Progress
  // reuses WARMUP_BACKFILL_PROGRESS above (the Indicators row) — this is the
  // trigger only. Returns { recleared, tradesQueued } so the button reports trades.
  WARMUP_RECLEAR: 'market:warmupReclearStranded',
  // v0.2.4 Session 3 — progress emission for the bulk trade_technicals
  // backfill armed at ready-to-show. Auto-armed (no trigger channel —
  // unlike COUNTRY_BACKFILL / FLOAT_BACKFILL / PROFILE_BACKFILL, which are
  // user-initiated from Settings). No subscriber in v0.2.4; the channel
  // exists so Session 4's Technical Analysis tab (or any future
  // subscriber) can listen without a main-process change.
  TECHNICALS_BACKFILL_PROGRESS: 'technicals:backfillProgress',
  TECHNICALS_LIST: 'technicals:list',
  // ── XP ─────────────────────────────────────────────────────────────────
  // v0.2.5 Phase A Session 3 (D5/L15) — weekly-review completion. The
  // xp_event IS the completion record: COMPLETE inserts through the Sunday
  // guard + idempotency key, GET is key existence. No completion table.
  // The "Complete review" button UI ships in Phase B Session 6.
  XP_WEEKLY_REVIEW_COMPLETE: 'xp:weeklyReviewComplete',
  XP_WEEKLY_REVIEW_GET: 'xp:weeklyReviewGet',
  // v0.2.5 Phase B Session 4 (L20) — the profile page's read model:
  // level/XP progress + the ledger-derived journaling streak. Read-only,
  // uncached, refetched on route mount (no push channel — single-window
  // app; see D24).
  XP_SUMMARY_GET: 'xp:summaryGet',
  // ── Profile (USER profile — spec §B identity row) ──────────────────────
  // v0.2.5 Phase B Session 4 (L20). NOT the FMP company-profile backfill
  // that squats on this domain at PROFILE_BACKFILL* above (A3) — the user
  // profile owns 'profile:' long-term.
  PROFILE_GET: 'profile:get',
  PROFILE_UPDATE: 'profile:update',
  // ── Goals (v0.2.5 Phase B Session 5, L27/L29) ──────────────────────────
  // GOALS_LIST is deliberately an EVALUATE-AND-READ: it computes progress
  // and performs due completions inline (idempotent — only active goals
  // transition; XP key + badge index dedupe the rest). No sweep, no hooks:
  // a goal completes when its owner looks at it.
  GOALS_LIST: 'goals:list',
  GOALS_CREATE: 'goals:create',
  GOALS_ABANDON: 'goals:abandon',
  // Read-only: active equity goals + progress, NO evaluate/award (cf. GOALS_LIST).
  GOALS_PROGRESS_READ: 'goals:progress-read',
  // ── Badges (v0.2.5 Phase B Session 6) — read-only award list for the badge
  // wall. The catalog (what CAN be earned) is the pure code module
  // src/core/badges/catalog.ts; minting is engine-side + future threshold sweeps.
  BADGES_LIST: 'badges:list',
  // ── Trading accounts (multi-account Beat 1) — the account REGISTRY only.
  // Mutations return the fresh ordered list (one round-trip for the future
  // switcher/Settings UI). Per-account FILTERING channels arrive in Beat 3;
  // the import picker + scoped dedup in Beat 2.
  ACCOUNTS_LIST: 'accounts:list',
  ACCOUNTS_CREATE: 'accounts:create',
  ACCOUNTS_UPDATE: 'accounts:update',
  ACCOUNTS_SET_DEFAULT: 'accounts:setDefault',
  ACCOUNTS_SET_STATUS: 'accounts:setStatus',
  ACCOUNTS_DELETE: 'accounts:delete',

  // Stage 3 beat 2 — the per-account cash ledger (events, transfers,
  // computed balances). combinedBalance ships now; its consumer is beat 3.
  CASH_EVENTS_LIST: 'cash:eventsList',
  CASH_EVENT_CREATE: 'cash:eventCreate',
  CASH_EVENT_DELETE: 'cash:eventDelete',
  CASH_TRANSFER_CREATE: 'cash:transferCreate',
  CASH_TRANSFER_DELETE: 'cash:transferDelete',
  CASH_BALANCE_GET: 'cash:balanceGet',
  CASH_BALANCE_COMBINED: 'cash:balanceCombined',
  // Beat 3 — the balance-over-time series (the Dashboard curve + any
  // future consumer). Optional scope; daily points.
  CASH_BALANCE_SERIES: 'cash:balanceSeries',
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
