// v3 import types. Two CSV formats are supported per import batch:
//   - executions (DAS Trades.csv): one row per fill → grouped into round trips
//   - daily-summary: one row per (date, symbol) → fees applied pro-rata
// A single import can contain either, both, or multiple files of each format.
//
// v0.2.0 extends the model with broker-agnostic provenance and per-execution
// fee fields. All additions are OPTIONAL so the v0.1.6 parser/builder/repo
// callers keep compiling unchanged. The universal pipeline (parse → build →
// commit) treats unset fields as "not provided", never as zero.

export type ExecSide = 'B' | 'S'

/** Origin broker for a row. Drives format-specific parser routing only —
 *  the universal Execution shape itself is broker-agnostic. */
export type SourceBroker = 'DAS' | 'Webull' | 'Lightspeed' | 'IBKR' | 'ToS' | 'OceanOne' | 'TradeZero' | 'ThinkorSwim'

/** Which export shape produced this row. 'summary' = daily aggregate,
 *  'execution' = per-fill (DAS Trades.csv), 'tradehistory' = per-fill
 *  with separate Date+Time columns and broker P/L (DAS Trades window /
 *  Executed Orders export, "tradehistory variant"), 'trades_window' = per-fill
 *  Trades-window export with Cloid + LiqType + Broker columns and bare
 *  HH:MM:SS time ("trades_window variant"), 'orders' = per-order, 'xlsx' =
 *  Webull desktop, 'account_report' = DAS fee statement. */
export type SourceFormat =
  | 'summary'
  | 'execution'
  | 'tradehistory'
  | 'trades_window'
  | 'orders'
  | 'xlsx'
  | 'account_report'

export interface Execution {
  trade_id: string
  order_id: string
  /** Legacy field — kept populated for v0.1.6 callers. New code should
   *  prefer `account_name`, which carries the same value and participates
   *  in the universal grouping/hashing logic. */
  account?: string
  route?: string
  symbol: string
  side: ExecSide
  is_short: boolean
  qty: number
  price: number
  time: string // ISO 8601 UTC, e.g. 2026-05-14T13:30:00Z (Day 8.5 Commit B)
  date: string // YYYY-MM-DD Eastern trading day (NOT the UTC day of `time`)

  // v0.2.0 universal-model additions (all optional).
  source_broker?: SourceBroker
  source_format?: SourceFormat
  /** Filename the execution was parsed from. Surfaces in error messages
   *  and future import-history UI; never used for identity. */
  source_file?: string
  /** Broker account identifier. Participates in round-trip grouping and
   *  in `exec_hash` only when non-empty — see build-round-trips.ts. */
  account_name?: string
  /** True when the originating account is a paper/simulator account.
   *  Set by Webull desktop XLSX parser; flagged in UI but doesn't change
   *  any math. */
  is_paper?: boolean
  /** ADDED = liquidity rebated to trader, REMOVED = liquidity taken. */
  liquidity_type?: 'ADDED' | 'REMOVED'
  /** Raw broker-specific liquidity code (DAS: RR, X, 99, RBD, …). Stays
   *  loose because the mapping to the universal ADDED/REMOVED bucket
   *  isn't 1:1 across DAS configurations — capture now, normalize later. */
  liq_type?: string
  /** Executing broker / clearing tag from the source row (DAS Broker
   *  column: ARCX, CROX, …). Distinct from `source_broker`, which is
   *  the originating platform ("DAS"). */
  broker_code?: string
  /** Order type / account-tier tag (DAS Type column: Margin, Cash, …).
   *  Captured for future per-account analytics. */
  order_type?: string

  // Per-execution fee components. SIGN-PRESERVING — negative ECN values are
  // rebates and contribute as negative numbers to total_fees. v0.1.6's
  // daily-summary path stripped signs; the universal path keeps them.
  commission?: number
  ecn_fee?: number
  sec_fee?: number
  finra_fee?: number
  cat_fee?: number
  htb_fee?: number
  other_fees?: number

  /** Broker-computed P&L for the fill (DAS Trades window / Executed Orders
   *  export). Captured for reference only; FugaEdge's own gross/net P&L
   *  is always recomputed from buy/sell pricing in buildRoundTrips(). */
  broker_pnl?: number
}

export type RowStatus = 'new' | 'duplicate'
export type FeeStatus = 'new' | 'replace'

export interface RoundTripExecution {
  trade_id: string
  order_id: string
  side: ExecSide
  qty: number
  price: number
  /** ISO 8601 UTC with a Z suffix (Day 8.5 Commit B). */
  time: string

  // v0.2.0 Day 2 additions (all optional). Travel through executions_json
  // so the modal can display broker-supplied reference data without a
  // schema migration. Day 8 wires them to the UI.
  /** ECN / venue route the fill was directed to (ARCA, NSDQ, EDGX, …).
   *  Captured from DAS Trades.csv when present. */
  route?: string
  /** Broker-computed P&L for the fill (e.g. DAS Trades window P/L column).
   *  Captured for reference only — FugaEdge's own gross/net P&L is always
   *  recomputed from buy/sell pricing. */
  broker_pnl?: number
}

export interface RoundTrip {
  /** Eastern trading day (YYYY-MM-DD). Deliberately NOT the UTC day of
   *  open_time — see the timezone footgun note in electron/db/schema.ts. */
  date: string
  symbol: string
  side: 'long' | 'short'
  /** ISO 8601 UTC with a Z suffix (Day 8.5 Commit B). */
  open_time: string
  /** ISO 8601 UTC with a Z suffix; null when is_open. */
  close_time: string | null
  is_open: boolean
  shares_bought: number
  avg_buy_price: number
  shares_sold: number
  avg_sell_price: number
  gross_pnl: number
  total_fees: number
  net_pnl: number
  /** ID-based content hash: SHA-1 over sorted "trade_id:order_id" pairs
   *  (plus account_name when non-empty for multi-account partitioning).
   *  v0.1.6 contract — every existing trade row dedups against itself on
   *  upgrade. See hashFills in src/core/import/build-round-trips.ts. */
  exec_hash: string
  /** Content-based hash: SHA-1 over sorted (symbol, UTC timestamp, side,
   *  qty, price) tuples — broker-agnostic. v0.2.1 dedup safety net that
   *  catches the same logical fill expressed with different IDs across
   *  export formats (scenarios b1/b2/b3 from the 2026-05-26 dedup
   *  investigation). See hashFillsByContent in build-round-trips.ts.
   *  Populated by buildRoundTrips for new trips; backfilled for legacy
   *  rows by migrate-content-hash.ts. */
  content_hash: string
  executions: RoundTripExecution[]
  status: RowStatus

  // v0.2.0 universal-model additions (all optional).
  source_broker?: SourceBroker
  source_format?: SourceFormat
  /** Filename of the import that produced this trip. Derived from the
   *  first constituent execution; if a single trip's executions span
   *  multiple files (rare today, possible once batched imports land),
   *  this records the first file only. */
  source_file?: string
  account_name?: string
  /** True when at least one constituent execution arrived with a fee
   *  component populated. Lets the UI say "Fees: not reported" instead of
   *  rendering $0.00 for brokers/formats that don't surface fees. */
  fees_reported?: boolean
  /** Broker commission for the round trip, kept DISTINCT from the other fee
   *  components (which fold into total_fees). Ocean One reports a separate Comm
   *  column Dave wants surfaced apart from regulatory/clearing fees; total_fees
   *  still INCLUDES commission. Optional/additive — a trades.commission schema
   *  column + population for the other parsers land in a later beat. */
  commission?: number
}

export interface DaySummaryFeeRow {
  date: string
  symbol: string
  fee_ecn: number
  fee_sec: number
  fee_finra: number
  fee_htb: number
  fee_cat: number
  // Ocean One fee-merge (schema 40): the broker's DISTINCT commission and the
  // pooled other-fees bucket (ORF/OCC/NSCC/Acc/Clr/Misc). DAS/Webull daily-
  // summary rows carry 0 here — they have no separately-itemized commission.
  fee_commission: number
  fee_other: number
  total_fees: number
  status: FeeStatus
  matchedTrips: number  // round trips already in DB for this (date, symbol)
}

// File-format tag carried on FileInfo. Broader than detect-format.ts's
// own CsvFormat — this one also covers 'xlsx' (Webull Desktop), which is
// routed by file extension upstream of detect-format because XLSX has no
// text first-row to sniff.
export type CsvFormat =
  | 'executions'
  | 'tradehistory'
  | 'trades_window'
  | 'webull_mobile'
  | 'xlsx'
  | 'ocean_one'
  | 'daily-summary'
  | 'tradezero'
  | 'tradezero_summary'
  | 'lightspeed'
  | 'tos_activity'
  | 'tos_statement'
  | 'unknown'

export interface FileInfo {
  filename: string
  format: CsvFormat
  /** True if a date was parsed from the filename (only relevant for daily-summary files). */
  filenameDateParsed: boolean
  /** Date assumed for this file (empty when no inference possible). */
  inferredDate: string
  rowCount: number
}

// ── Structured import errors (Day 9) ──────────────────────────────────────
// Every user-facing import problem is one ImportIssue. Built by the catalog
// in src/core/import/import-errors.ts, carried on PreviewResult.issues and
// CommitResult.issues, rendered by the import UI. No i18n yet (v0.3.0).

export type ImportErrorCode =
  | 'UNKNOWN_FORMAT'
  | 'EMPTY_FILE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_READ_FAILED'
  | 'XLSX_WRONG_SHEET'
  | 'XLSX_MISSING_COLUMN'
  | 'NO_USABLE_ROWS'
  | 'BACKUP_FAILED'
  | 'COMMIT_FAILED'
  | 'FILE_NOT_DELIVERED'
  | 'ROWS_SKIPPED'
  | 'MALFORMED_CSV'
  | 'DATE_REQUIRED'
  | 'FEE_ROWS_DROPPED'
  | 'ENRICHMENT_NO_API_KEY'
  | 'ENRICHMENT_FETCH_FAILED'

/** Which prefilled GitHub template the "request" affordance opens. Only
 *  meaningful when `requestBroker` is true. */
export type ImportRequestKind = 'broker' | 'bug'

export interface ImportIssue {
  code: ImportErrorCode
  /** Plain-English statement of what happened. */
  message: string
  /** Plain-English statement of what the user should do next. */
  actionable: string
  /** 'error' blocks the affected file / import; 'warning' is informational —
   *  the import still proceeds. */
  severity: 'error' | 'warning'
  /** Human-readable detected format, when known (e.g. "Webull Desktop"). */
  format?: string
  /** When true, the renderer shows a GitHub request/report button. */
  requestBroker?: boolean
  /** Picks the prefilled GitHub template + button label. Only read when
   *  `requestBroker` is true. */
  requestKind?: ImportRequestKind
}

export interface PreviewSummary {
  totalExecutions: number
  totalTrips: number
  newTrips: number
  duplicateTrips: number
  /** TradeZero File 2 Phase 2 — incoming summary trips dropped because an
   *  execution covers their (symbol, date). A SUBSET of duplicateTrips,
   *  surfaced separately so the user sees WHY the summary row was skipped. */
  supersededTrips: number
  openTrips: number
  totalFeeRows: number
  newFeeRows: number
  replaceFeeRows: number
  skippedExecutions: number
  skippedFeeRows: number
}

export interface PreviewResult {
  files: FileInfo[]
  trips: RoundTrip[]
  fees: DaySummaryFeeRow[]
  /** True when a daily-summary file in this batch couldn't infer a date and needs user input. */
  needsDate: boolean
  /** True when this batch contains executions (DAS Trades.csv or tradehistory)
   *  but no fee-bearing file (daily-summary, account_report). UI shows a
   *  banner suggesting the user drop their Account Report alongside, but
   *  the import is still permitted — trips just get fees_reported=false. */
  feesUnavailable: boolean
  dateRange: { from: string; to: string } | null
  summary: PreviewSummary
  /** Structured import issues (Day 9). */
  issues: ImportIssue[]
}

export interface PreviewInputFile {
  filename: string
  /** Set by the renderer for CSV files (DropZone reads via file.text()).
   *  Mutually exclusive with `bytes` at runtime — IPC handler routes by
   *  filename extension and reads whichever field is appropriate. */
  text?: string
  /** Set by the renderer for binary files (XLSX). Reads via
   *  file.arrayBuffer() then constructs a Uint8Array. Uint8Array
   *  passes through Electron's structured-clone IPC and contextBridge
   *  transparently — no encoding step needed. */
  bytes?: Uint8Array
}

export interface CommitInput {
  trips: RoundTrip[]
  fees: DaySummaryFeeRow[]
  /** Applied to every fee row that lacks a date (filename couldn't be parsed). */
  feeDateOverride?: string
  /** Multi-account Beat 2 — the trading account this import belongs to.
   *  Absent = the default account (resolved main-side). Beat 3's import
   *  picker populates it; no UI reads it yet. */
  account_id?: string
}

export interface CommitResult {
  insertedTrips: number
  skippedTrips: number
  /** v0.2.3: closed soft-deleted trades revived by a matching re-import
   *  (deleted_at cleared in commit()'s INSERT OR IGNORE else-branch). Distinct
   *  from skippedTrips — a resurrect brings a trashed trade back, a skip is an
   *  ordinary live duplicate. */
  resurrectedTrips: number
  /** TradeZero File 2 Phase 2 (case b) — stale DB summary rows hard-deleted at
   *  commit because an authoritative execution arrived for the same
   *  (symbol, date). 0 in the common case. */
  supersededTrips: number
  insertedFees: number
  replacedFees: number
  affectedDates: string[]
  affectedPairs: number
  /** Newly-imported symbols whose country was successfully auto-detected
   *  from Polygon during this import. */
  countriesResolved: number
  /** Newly-imported symbols whose country could NOT be detected (Polygon
   *  returned no usable address/locale/exchange, the call errored, or the
   *  API key wasn't configured). These trades save with country=NULL and
   *  source='unknown' so a later Backfill in Settings can retry. */
  countriesUnknown: number
  /** True when country resolution was skipped because no Polygon API key
   *  is configured. Lets the renderer show a specific "set your key"
   *  banner instead of the generic "N tickers unknown" line, since when
   *  this is true every ticker in `countriesUnknown` is a missed call,
   *  not a Polygon-side gap. */
  countryApiKeyMissing: boolean
  /** Newly-imported symbols whose float fetch threw (Polygon rate-limit
   *  exhaustion, network error, malformed response). Distinct from
   *  "Polygon returned null float" which is a legitimate outcome. The
   *  v0.3.0 import-progress UI ticket will surface this — until then,
   *  shipped for log + future-renderer parity. */
  floatErrored: number
  /** Newly-imported symbols whose daily-aggregates fetch threw. Same
   *  semantics as floatErrored — distinct from "Polygon returned zero
   *  bars" (which is captured separately at log level). */
  aggregatesErrored: number
  /** Structured import issues (Day 9): hard failures (backup / commit),
   *  dropped fee rows, and post-commit enrichment problems. */
  issues: ImportIssue[]
}
