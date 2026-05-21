import Papa from 'papaparse'
import type { Execution } from '@shared/import-types'
import { parseFilenameDate } from './parse-filename'
import { localEasternToUtc } from '@/lib/format'

// DAS Trades.csv columns:
// TradeID, OrderID, Trader, Account, Branch, route, bkrsym, rrno, B/S, SHORT,
// Market, symb, qty, price, time
//
// Some DAS exports also append a broker-computed P/L column (header "P/L"
// or "P&L"). Captured opportunistically into Execution.broker_pnl when
// present; absent on a stock DAS Trades.csv.
const COL = {
  tradeId: 'TradeID',
  orderId: 'OrderID',
  account: 'Account',
  route: 'route',
  bs: 'B/S',
  short: 'SHORT',
  symbol: 'symb',
  qty: 'qty',
  price: 'price',
  time: 'time',
  pnl: 'P/L',
  pnlAlt: 'P&L',
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

// "0" stays 0 (broker reported zero); empty/missing → undefined so
// consumers can distinguish "not reported" from "reported as zero".
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

// "05/11/26 08:35:11" → { iso: "2026-05-11T08:35:11", date: "2026-05-11" }
export function parseDasTime(raw: string): { iso: string; date: string } | null {
  const m = String(raw).trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
  )
  if (!m) return null
  const mo = Number(m[1])
  const dd = Number(m[2])
  let yy = Number(m[3])
  if (yy < 100) yy = 2000 + yy
  const hh = Number(m[4])
  const mi = Number(m[5])
  const ss = Number(m[6])
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59 || ss > 59) return null
  const date = `${yy}-${pad(mo)}-${pad(dd)}`
  return { iso: `${date}T${pad(hh)}:${pad(mi)}:${pad(ss)}`, date }
}

// Bare-time fallback: "08:35:11" or "8:35:11". When DAS users export with
// a time column that lacks the date prefix, we still extract the time and
// rely on a filename-derived date to fill in. Returns the zero-padded
// HH:MM:SS string.
export function parseBareTime(raw: string): string | null {
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const hh = Number(m[1])
  const mi = Number(m[2])
  const ss = Number(m[3])
  if (hh > 23 || mi > 59 || ss > 59) return null
  return `${pad(hh)}:${pad(mi)}:${pad(ss)}`
}

function truthy(s: string): boolean {
  const t = s.trim().toUpperCase()
  if (!t) return false
  if (t === '0' || t === 'N' || t === 'NO' || t === 'FALSE') return false
  return true
}

export interface ParseExecutionsResult {
  executions: Execution[]
  skipped: number
  warnings: string[]
  trace: { row: number; outcome: 'kept' | 'skipped'; reason?: string; symbol?: string }[]
  /** True when at least one row had a bare time (no date) AND the filename
   *  couldn't supply a date either. Lets the IPC layer surface a clear
   *  "rename file to include a date" guardrail instead of silently
   *  dropping rows. */
  requiresDate: boolean
}

// `sourceFile` is the originating filename. When set, every emitted Execution
// carries it as provenance (surfaces in error messages and future import-
// history UI). Optional so v0.1.6 callers that don't pass a filename still
// compile — those Executions just leave `source_file` undefined. Per decision
// D, account_name is intentionally NOT populated here even though DAS Trades
// .csv has an Account column; doing so would change exec_hash inputs and
// break duplicate detection for existing v0.1.6 users on re-import. The
// legacy `account` field still carries the value for informational use.
export function parseExecutionsCsv(
  csvText: string,
  sourceFile?: string,
): ParseExecutionsResult {
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

  // Pre-derive a filename-based date for the bare-time fallback. Only used
  // when a row's time column lacks an embedded date AND a filename was
  // passed. Never overrides a row whose time has its own date.
  const filenameDate = sourceFile ? parseFilenameDate(sourceFile).date : ''

  const executions: Execution[] = []
  const trace: ParseExecutionsResult['trace'] = []
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

    const bs = pick(r, COL.bs).trim().toUpperCase()
    if (bs !== 'B' && bs !== 'S') {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: `bad-bs:"${bs}"`, symbol })
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
    let iso = ''
    let date = ''
    const t = parseDasTime(timeRaw)
    if (t) {
      iso = t.iso
      date = t.date
    } else {
      // Bare-time fallback — accept "HH:MM:SS" if a filename date is
      // available, otherwise mark this row as requiring a date and skip.
      const bare = parseBareTime(timeRaw)
      if (bare && filenameDate) {
        date = filenameDate
        iso = `${filenameDate}T${bare}`
      } else if (bare && !filenameDate) {
        requiresDate = true
        skipped++
        trace.push({
          row: rowNum,
          outcome: 'skipped',
          reason: 'no-date-and-no-filename-fallback',
          symbol,
        })
        continue
      } else {
        skipped++
        trace.push({
          row: rowNum,
          outcome: 'skipped',
          reason: `bad-time:"${timeRaw}"`,
          symbol,
        })
        continue
      }
    }

    // Capture broker P/L when the export includes it (column header "P/L"
    // or "P&L"). Absent on stock DAS Trades.csv; present on some custom
    // column configs.
    const brokerPnl =
      numOrUndefined(pick(r, COL.pnl)) ?? numOrUndefined(pick(r, COL.pnlAlt))

    // Day 8.5 Commit B — store true UTC. `iso`/`date` are bare-local Eastern
    // (DAS Trades.csv carries no offset); localEasternToUtc infers EDT/EST.
    // `date` stays the Eastern trading day; only `time` becomes UTC.
    const timeUtc = localEasternToUtc(date, iso.slice(11, 19))

    executions.push({
      trade_id: pick(r, COL.tradeId).trim(),
      order_id: pick(r, COL.orderId).trim(),
      account: pick(r, COL.account).trim() || undefined,
      route: pick(r, COL.route).trim() || undefined,
      symbol,
      side: bs as 'B' | 'S',
      is_short: truthy(pick(r, COL.short)),
      qty: Math.round(qty),
      price,
      time: timeUtc,
      date,
      source_broker: 'DAS',
      source_format: 'execution',
      source_file: sourceFile,
      broker_pnl: brokerPnl,
    })
    trace.push({ row: rowNum, outcome: 'kept', symbol })
  }

  return { executions, skipped, warnings, trace, requiresDate }
}
