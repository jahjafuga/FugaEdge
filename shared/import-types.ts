// v3 import types. Two CSV formats are supported per import batch:
//   - executions (DAS Trades.csv): one row per fill → grouped into round trips
//   - daily-summary: one row per (date, symbol) → fees applied pro-rata
// A single import can contain either, both, or multiple files of each format.

export type ExecSide = 'B' | 'S'

export interface Execution {
  trade_id: string
  order_id: string
  account?: string
  route?: string
  symbol: string
  side: ExecSide
  is_short: boolean
  qty: number
  price: number
  time: string // ISO YYYY-MM-DDTHH:MM:SS
  date: string // YYYY-MM-DD
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

export type CsvFormat = 'executions' | 'daily-summary' | 'unknown'

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
  dateRange: { from: string; to: string } | null
  summary: PreviewSummary
  warnings: string[]
}

export interface PreviewInputFile {
  filename: string
  text: string
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
}
