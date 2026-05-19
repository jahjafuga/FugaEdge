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
export type SourceBroker = 'DAS' | 'Webull' | 'Lightspeed' | 'IBKR' | 'ToS'

/** Which export shape produced this row. 'summary' = daily aggregate,
 *  'execution' = per-fill (DAS Trades.csv), 'tradehistory' = per-fill
 *  with separate Date+Time columns and broker P/L (DAS Trades window /
 *  Executed Orders export, "Dave variant"), 'trades_window' = per-fill
 *  Trades-window export with Cloid + LiqType + Broker columns and bare
 *  HH:MM:SS time ("Brendan variant"), 'orders' = per-order, 'xlsx' =
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
  time: string // ISO YYYY-MM-DDTHH:MM:SS
  date: string // YYYY-MM-DD

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
  date: string
  symbol: string
  side: 'long' | 'short'
  open_time: string
  close_time: string | null
  is_open: boolean
  shares_bought: number
  avg_buy_price: number
  shares_sold: number
  avg_sell_price: number
  gross_pnl: number
  total_fees: number
  net_pnl: number
  exec_hash: string
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
}

export interface DaySummaryFeeRow {
  date: string
  symbol: string
  fee_ecn: number
  fee_sec: number
  fee_finra: number
  fee_htb: number
  fee_cat: number
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
  | 'daily-summary'
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

export interface PreviewSummary {
  totalExecutions: number
  totalTrips: number
  newTrips: number
  duplicateTrips: number
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
  warnings: string[]
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
}

export interface CommitResult {
  insertedTrips: number
  skippedTrips: number
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
}
