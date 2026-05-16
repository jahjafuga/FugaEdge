import Papa from 'papaparse'
import { createHash } from 'node:crypto'
import type { Execution } from '@shared/import-types'
import { parseFilenameDate } from './parse-filename'

// DAS Trades window export — Tester B variant. Columns:
//   Time, Symbol, Side, Price, Qty, Route, LiqType, Broker, Account, Type, Cloid
//
// Distinct from both other DAS shapes:
//   - parse-executions.ts: TradeID-led, time-with-date
//   - parse-tradehistory.ts: Date+Time split, broker P&L
//
// Cloid (DAS Client Order ID) is per-order — partial fills of the same
// order share a Cloid — so we use it as order_id and synthesize a stable
// per-row trade_id from the row tuple. Same payload formula as Track A
// so the dedup contract is identical (re-import → same hash).
//
// Time is bare HH:MM:SS, so the file needs either:
//   (a) a filename with a parseable date (parseFilenameDate handles
//       MM-DD-YYYY, YYYY-MM-DD, "11thmay", etc.), or
//   (b) a guardrail warning telling the user to rename — same path Track B
//       wired for the bare-time fallback in parse-executions.ts.

const COL = {
  time: 'Time',
  symbol: 'Symbol',
  side: 'Side',
  price: 'Price',
  qty: 'Qty',
  route: 'Route',
  liqType: 'LiqType',
  broker: 'Broker',
  account: 'Account',
  type: 'Type',
  cloid: 'Cloid',
}

function normKey(k: string): string {
  return k.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9&/]/g, '')
}

function pick(row: Record<string, string>, name: string): string {
  const target = normKey(name)
  for (const key of Object.keys(row)) {
    if (normKey(key) === target) return row[key] ?? ''
  }
  return ''
}

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

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// "08:35:11" or "8:35:11" → "08:35:11". Returns null on garbage.
function parseBareTime(raw: string): string | null {
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const hh = Number(m[1])
  const mi = Number(m[2])
  const ss = Number(m[3])
  if (hh > 23 || mi > 59 || ss > 59) return null
  return `${pad(hh)}:${pad(mi)}:${pad(ss)}`
}

// Deterministic per-row ID. Per Track C spec: tw-<sha1[0..12]> of
// date|time|symbol|side|qty|price. Cloid is intentionally NOT part of
// the synth — it lives separately as order_id, which the round-trip
// builder's hashFills consumes as the trade_id:order_id pair.
function synthId(
  date: string,
  time: string,
  symbol: string,
  side: string,
  qty: number,
  price: number,
): string {
  const payload = `${date}|${time}|${symbol}|${side}|${qty}|${price}`
  return 'tw-' + createHash('sha1').update(payload).digest('hex').slice(0, 12)
}

export interface ParseTradesWindowResult {
  executions: Execution[]
  skipped: number
  warnings: string[]
  trace: { row: number; outcome: 'kept' | 'skipped'; reason?: string; symbol?: string }[]
  /** True when at least one row was dropped because the file has bare
   *  HH:MM:SS time and the filename couldn't supply a date. The IPC
   *  layer promotes this to a top-level "rename file to include a date"
   *  warning. */
  requiresDate: boolean
}

export function parseTradesWindowCsv(
  csvText: string,
  sourceFile?: string,
): ParseTradesWindowResult {
  const cleaned = csvText.replace(/^[﻿￾​]+/, '')

  const parsed = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    delimiter: ',',
    transformHeader: (h) => h.trim(),
  })

  const warnings = parsed.errors
    .filter((e) => e.code !== 'TooFewFields' && e.code !== 'TooManyFields')
    .map((e) => `Row ${e.row ?? '?'}: ${e.message}`)

  // Bare-time fallback: filename is the only path to a date for this
  // format. Empty string when filename has no date (or no filename).
  const filenameDate = sourceFile ? parseFilenameDate(sourceFile).date : ''

  const executions: Execution[] = []
  const trace: ParseTradesWindowResult['trace'] = []
  let skipped = 0
  let rowNum = 0
  let requiresDate = false

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

    const sideRaw = pick(r, COL.side).trim().toUpperCase()
    if (sideRaw !== 'B' && sideRaw !== 'S') {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: `bad-side:"${sideRaw}"`, symbol })
      continue
    }

    const qty = Math.abs(num(pick(r, COL.qty)))
    if (qty <= 0) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'zero-qty', symbol })
      continue
    }

    const price = num(pick(r, COL.price))
    if (price <= 0) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'zero-price', symbol })
      continue
    }

    const timeRaw = pick(r, COL.time)
    const time = parseBareTime(timeRaw)
    if (!time) {
      skipped++
      trace.push({
        row: rowNum,
        outcome: 'skipped',
        reason: `bad-time:"${timeRaw}"`,
        symbol,
      })
      continue
    }

    if (!filenameDate) {
      requiresDate = true
      skipped++
      trace.push({
        row: rowNum,
        outcome: 'skipped',
        reason: 'no-date-and-no-filename-fallback',
        symbol,
      })
      continue
    }

    const date = filenameDate
    const iso = `${date}T${time}`
    const qtyRounded = Math.round(qty)
    const synth = synthId(date, time, symbol, sideRaw, qtyRounded, price)
    const cloid = pick(r, COL.cloid).trim()
    const account = pick(r, COL.account).trim()

    executions.push({
      // Synthesized per-row; Cloid is per-order so we use it as order_id
      // to keep partial-fill grouping behavior identical to the existing
      // TradeID/OrderID path in parse-executions.ts.
      trade_id: synth,
      order_id: cloid || synth,
      account: account || undefined,
      // Tester B-shape files are v0.2.0-only — no v0.1.6 dedup hash to
      // preserve (Decision D's compat concern doesn't apply) — so we set
      // account_name too. Future multi-account users will get
      // (symbol, account_name) partitioning in buildRoundTrips.
      account_name: account || undefined,
      route: pick(r, COL.route).trim() || undefined,
      liq_type: pick(r, COL.liqType).trim() || undefined,
      broker_code: pick(r, COL.broker).trim() || undefined,
      order_type: pick(r, COL.type).trim() || undefined,
      symbol,
      side: sideRaw as 'B' | 'S',
      // No SHORT column; shorts get inferred by buildRoundTrips from
      // sell-before-buy ordering within a (symbol, account_name) bucket.
      is_short: false,
      qty: qtyRounded,
      price,
      time: iso,
      date,
      source_broker: 'DAS',
      source_format: 'trades_window',
      source_file: sourceFile,
    })
    trace.push({ row: rowNum, outcome: 'kept', symbol })
  }

  return { executions, skipped, warnings, trace, requiresDate }
}
