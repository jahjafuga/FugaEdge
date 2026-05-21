import Papa from 'papaparse'
import { createHash } from 'node:crypto'
import type { Execution } from '@shared/import-types'
import { localEasternToUtc } from '@/lib/format'

// DAS Trades window / Executed Orders export. Columns:
//   Date, Time, Symbol, Side, Quantity, Price, P&L
//
// Distinct from DAS Trades.csv (parse-executions.ts) — that one has
// TradeID/OrderID/route and a combined "time" cell. This shape ships no
// fill IDs, so we synthesize a stable per-row ID from the row's tuple so
// re-imports dedup against themselves via the existing exec_hash path.

const COL = {
  date: 'Date',
  time: 'Time',
  symbol: 'Symbol',
  side: 'Side',
  qty: 'Quantity',
  price: 'Price',
  pnl: 'P&L',
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

// "0" stays 0 (broker explicitly reported zero P&L on the opening leg);
// empty/missing returns undefined so consumers can distinguish "not
// reported" from "reported as zero".
function numOrUndefined(raw: string | undefined): number | undefined {
  if (raw == null) return undefined
  const trimmed = String(raw).trim()
  if (!trimmed) return undefined
  const negative = trimmed.startsWith('(') && trimmed.endsWith(')')
  const cleaned = trimmed.replace(/[$,()\s]/g, '')
  const n = Number.parseFloat(cleaned)
  if (Number.isNaN(n)) return undefined
  return negative ? -Math.abs(n) : n
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// "05/01/26" → "2026-05-01". Accepts MM/DD/YY or MM/DD/YYYY.
export function parseTradeHistoryDate(raw: string): string | null {
  const m = String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const mo = Number(m[1])
  const dd = Number(m[2])
  let yy = Number(m[3])
  if (yy < 100) yy = 2000 + yy
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null
  return `${yy}-${pad(mo)}-${pad(dd)}`
}

// "08:03:35" → "08:03:35" (zero-padded). Single-digit hours tolerated.
export function parseTradeHistoryTime(raw: string): string | null {
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const hh = Number(m[1])
  const mi = Number(m[2])
  const ss = Number(m[3])
  if (hh > 23 || mi > 59 || ss > 59) return null
  return `${pad(hh)}:${pad(mi)}:${pad(ss)}`
}

// Deterministic synthetic ID from the row tuple. Same row on re-import
// produces the same ID → same exec_hash → existing dedup wins. Genuinely
// identical fills (same second, same side, same qty, same price) collide
// on ID, which is fine for hash purposes since hashFills sorts+joins
// stably either way.
function synthId(
  date: string,
  time: string,
  symbol: string,
  side: string,
  qty: number,
  price: number,
): string {
  const payload = `${date}|${time}|${symbol}|${side}|${qty}|${price}`
  return 'th-' + createHash('sha1').update(payload).digest('hex').slice(0, 12)
}

export interface ParseTradeHistoryResult {
  executions: Execution[]
  skipped: number
  warnings: string[]
  trace: { row: number; outcome: 'kept' | 'skipped'; reason?: string; symbol?: string }[]
}

export function parseTradeHistoryCsv(
  csvText: string,
  sourceFile?: string,
): ParseTradeHistoryResult {
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

  const executions: Execution[] = []
  const trace: ParseTradeHistoryResult['trace'] = []
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

    const dateRaw = pick(r, COL.date)
    const date = parseTradeHistoryDate(dateRaw)
    if (!date) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: `bad-date:"${dateRaw}"`, symbol })
      continue
    }

    const timeRaw = pick(r, COL.time)
    const time = parseTradeHistoryTime(timeRaw)
    if (!time) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: `bad-time:"${timeRaw}"`, symbol })
      continue
    }

    const brokerPnl = numOrUndefined(pick(r, COL.pnl))
    const qtyRounded = Math.round(qty)
    const synth = synthId(date, time, symbol, sideRaw, qtyRounded, price)
    // Day 8.5 Commit B — store true UTC. synthId above still receives the
    // bare-local `time` so exec_hash is stable across the flip; `date` stays
    // the Eastern trading day; only `time` becomes UTC.
    const timeUtc = localEasternToUtc(date, time)

    executions.push({
      trade_id: synth,
      order_id: synth,
      symbol,
      side: sideRaw as 'B' | 'S',
      // No SHORT column in this export; shorts are inferred by buildRoundTrips
      // from sell-before-buy ordering within a (symbol) bucket.
      is_short: false,
      qty: qtyRounded,
      price,
      time: timeUtc,
      date,
      source_broker: 'DAS',
      source_format: 'tradehistory',
      source_file: sourceFile,
      broker_pnl: brokerPnl,
    })
    trace.push({ row: rowNum, outcome: 'kept', symbol })
  }

  return { executions, skipped, warnings, trace }
}
