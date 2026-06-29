import Papa from 'papaparse'
import { createHash } from 'node:crypto'
import type { Execution, RoundTrip, RoundTripExecution } from '@shared/import-types'
import { hashFills, hashFillsByContent } from '@/core/import/build-round-trips'
import { localEasternToUtc } from '@/lib/format'

// TradeZero daily-summary CSV export (File 2). Header:
//   Trade Type, Symbol, Start of Day Position, Previous Day Close,
//   End of Day Position, Start of Day Value, Bought Shares,
//   Bought Average Price, Bought Value, Sold Shares, Sold Average Price,
//   Sold Value, End of Day Closing Price, End of Day Value, Fees,
//   Day Profit & Loss
//
// Each row is a PRE-AGGREGATED round trip for one symbol's day (no fills). So,
// like the Ocean One parser, this emits RoundTrips DIRECTLY into directTrips
// (bypassing buildRoundTrips). It builds two synthetic fills (buy + sell) only
// to compute the dual dedup hashes + back executions_json, exactly as Ocean One
// does.
//
// TWO things this format lacks that every other parser has:
//   1. NO DATE COLUMN. The trading day can't be read from the file, so the
//      caller supplies it (the import preview prompts the user). The date is a
//      required parameter — the parser cannot build a trip without it (date +
//      times bake into the synthId/exec_hash/content_hash).
//   2. NO DIRECTION. There is no Side column, no fill order, and the aggregate
//      P&L math is symmetric (gross = SoldValue - BoughtValue is identical for a
//      long that bought-then-sold and a short that sold-then-covered), and the
//      Start/End-of-Day positions are flat-to-flat (0) on intraday round trips.
//      So long vs short is UNRECOVERABLE from this format. We default to 'long'
//      (the momentum-day-trader common case). The numbers — shares, avg prices,
//      fees, P&L — are correct regardless; ONLY the direction label is a guess,
//      and a true short will mislabel as long. (Phase 3 marks these trips so
//      time-of-day analytics can exclude them.)
//
// PHASE 1 of 3: parsing in isolation. NOT shippable alone — without Phase 2's
// duplicate-guard, importing this summary AND an execution file for the same
// symbol/day double-counts (the synthetic-fill hashes can't match the real-fill
// hashes). source_format:'summary' is set so Phase 3 can identify these trips.

const COL = {
  tradeType: 'Trade Type',
  symbol: 'Symbol',
  boughtShares: 'Bought Shares',
  boughtAvg: 'Bought Average Price',
  soldShares: 'Sold Shares',
  soldAvg: 'Sold Average Price',
  fees: 'Fees',
  dayPnl: 'Day Profit & Loss',
}

// Single nominal anchor — open_time === close_time === this time. We deliberately
// make the hold 0s rather than fabricate a session-length span: the summary
// carries no real fill times, and 0s is the honest signal of that.
const SUMMARY_TIME_ANCHOR = '09:30:00'

function normKey(k: string): string {
  return k.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9&]/g, '')
}

function pick(row: Record<string, string>, name: string): string {
  const target = normKey(name)
  for (const key of Object.keys(row)) {
    if (normKey(key) === target) return row[key] ?? ''
  }
  return ''
}

// Sign-preserving numeric parse: "(0.12)" → -0.12, "-0.12" → -0.12,
// "$1,234.50" → 1234.5, blank → 0.
function num(raw: string | undefined): number {
  if (raw == null) return 0
  const trimmed = String(raw).trim()
  if (!trimmed) return 0
  const negative = trimmed.startsWith('(') && trimmed.endsWith(')')
  const cleaned = trimmed.replace(/[$,()\s]/g, '')
  const n = Number.parseFloat(cleaned)
  if (Number.isNaN(n)) return 0
  return negative ? -Math.abs(n) : n
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000
}

function isTotalSymbol(symbol: string): boolean {
  return /^TOTALS?($|[\s:])/i.test(symbol)
}

function synthId(parts: (string | number)[]): string {
  return 'tzs-' + createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12)
}

export interface ParseTradeZeroSummaryResult {
  roundTrips: RoundTrip[]
  skipped: number
  warnings: string[]
  trace: { row: number; outcome: 'kept' | 'skipped'; reason?: string; symbol?: string }[]
}

/** Parse a TradeZero daily-summary CSV into RoundTrips for the given trading
 *  `date` (YYYY-MM-DD Eastern). The date is REQUIRED — the file carries none, so
 *  the caller supplies it (prompted in the import preview). An empty/invalid
 *  date yields no trips (the preview keeps needsDate=true instead). */
export function parseTradeZeroSummaryCsv(
  csvText: string,
  date: string,
  sourceFile?: string,
): ParseTradeZeroSummaryResult {
  const trace: ParseTradeZeroSummaryResult['trace'] = []
  const warnings: string[] = []

  // The date must be a real YYYY-MM-DD; without it we cannot build stable
  // trips. Return empty rather than throw so the preview can stay on the prompt.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { roundTrips: [], skipped: 0, warnings: ['summary import: a trading date is required'], trace }
  }

  const cleaned = csvText.replace(/^[﻿￾​]+/, '')
  const parsed = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    delimiter: ',',
    transformHeader: (h) => h.trim(),
  })

  warnings.push(
    ...parsed.errors
      .filter((e) => e.code !== 'TooFewFields' && e.code !== 'TooManyFields')
      .map((e) => `Row ${e.row ?? '?'}: ${e.message}`),
  )

  // Both fills sit on the one nominal anchor → open_time === close_time (0s hold).
  const timeUtc = localEasternToUtc(date, SUMMARY_TIME_ANCHOR)

  const roundTrips: RoundTrip[] = []
  let skipped = 0
  let rowNum = 0

  for (const r of parsed.data) {
    rowNum++
    if (!r || typeof r !== 'object') {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'not-an-object' })
      continue
    }

    const symbol = pick(r, COL.symbol).trim().toUpperCase()
    if (!symbol) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'empty-symbol' })
      continue
    }
    if (isTotalSymbol(symbol)) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'total-row', symbol })
      continue
    }

    const sharesBought = Math.round(Math.abs(num(pick(r, COL.boughtShares))))
    const sharesSold = Math.round(Math.abs(num(pick(r, COL.soldShares))))
    const avgBuy = round4(num(pick(r, COL.boughtAvg)))
    const avgSell = round4(num(pick(r, COL.soldAvg)))
    if (sharesBought <= 0 || sharesSold <= 0 || avgBuy <= 0 || avgSell <= 0) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'non-positive-shares-or-price', symbol })
      continue
    }

    const totalFees = round2(num(pick(r, COL.fees)))
    const netPnl = round2(num(pick(r, COL.dayPnl))) // Day Profit & Loss = net
    const grossPnl = round2(netPnl + totalFees)

    // Direction is unrecoverable (see header note) — default long.
    const side: 'long' | 'short' = 'long'

    // Two synthetic fills (buy + sell) on the single anchor — used only for the
    // dual dedup hashes + executions_json, not run through buildRoundTrips.
    const buyId = synthId([date, timeUtc, symbol, 'B', sharesBought, avgBuy])
    const sellId = synthId([date, timeUtc, symbol, 'S', sharesSold, avgSell])
    const mkFill = (id: string, s: 'B' | 'S', qty: number, price: number): Execution => ({
      trade_id: id,
      order_id: id,
      symbol,
      side: s,
      is_short: false,
      qty,
      price,
      time: timeUtc,
      date,
    })
    const fills: Execution[] = [
      mkFill(buyId, 'B', sharesBought, avgBuy),
      mkFill(sellId, 'S', sharesSold, avgSell),
    ]
    const rtExecs: RoundTripExecution[] = fills.map((f) => ({
      trade_id: f.trade_id,
      order_id: f.order_id,
      side: f.side,
      qty: f.qty,
      price: f.price,
      time: f.time,
    }))

    roundTrips.push({
      date,
      symbol,
      side,
      open_time: timeUtc,
      close_time: timeUtc, // === open_time → 0s hold (no real fill times)
      is_open: false,
      shares_bought: sharesBought,
      avg_buy_price: avgBuy,
      shares_sold: sharesSold,
      avg_sell_price: avgSell,
      gross_pnl: grossPnl,
      total_fees: totalFees,
      net_pnl: netPnl,
      exec_hash: hashFills(fills),
      content_hash: hashFillsByContent(fills),
      executions: rtExecs,
      status: 'new',
      source_broker: 'TradeZero',
      // Reuses the existing 'summary' SourceFormat (pre-aggregated, no real fill
      // times). Phase 3 keys analytics-exclusion on this.
      source_format: 'summary',
      source_file: sourceFile,
      fees_reported: true,
    })
    trace.push({ row: rowNum, outcome: 'kept', symbol })
  }

  return { roundTrips, skipped, warnings, trace }
}
