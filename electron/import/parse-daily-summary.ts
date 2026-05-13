import Papa from 'papaparse'

// Daily summary CSV columns (joined form):
//   Symbol, Trades, Bought Shares, B Avg Price, Sold Shares, S Avg Price,
//   Net Share, Current Price, Day-trade P&L, OverNight Position,
//   OverNight AvgCost, Yesterday Close, ECN, SEC, FINRA, HTB Fee, CAT Fee,
//   Short Shares, Short Avg Price, OCC Fee
//
// DAS exports the header line as TWO physical rows or as ONE row with
// embedded newlines inside quoted cells (e.g. "Bought\nShares"). We handle
// both by parsing the whole CSV with header:false and stitching the header
// ourselves before indexing data rows.

function normKey(k: string): string {
  return k.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9&]/g, '')
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

function isTotalSymbol(symbol: string): boolean {
  return /^TOTALS?($|[\s:])/i.test(symbol)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// A "continuation" row is the second physical line of a split header — its
// first cell (under Symbol) is empty, but it has multiple non-empty cells
// carrying the rest of the column-name words ("Shares", "Price", "Fee"…).
function looksLikeHeaderContinuation(row: string[] | undefined): boolean {
  if (!row || row.length === 0) return false
  const first = (row[0] || '').trim()
  if (first.length > 0) return false
  const filled = row.filter((c) => (c || '').trim().length > 0).length
  return filled >= 2
}

function joinHeaderParts(a: string, b: string): string {
  return [a, b]
    .map((s) => (s || '').replace(/\r?\n/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
}

export interface ParsedFeeRow {
  symbol: string
  fee_ecn: number
  fee_sec: number
  fee_finra: number
  fee_htb: number
  fee_cat: number
  total_fees: number
}

export interface ParseDailySummaryResult {
  rows: ParsedFeeRow[]
  skipped: number
  warnings: string[]
  trace: { row: number; outcome: 'kept' | 'skipped'; reason?: string; symbol?: string }[]
  /** Joined header line we ended up indexing by — surfaced in dev logs. */
  headers: string[]
}

export function parseDailySummaryCsv(csvText: string): ParseDailySummaryResult {
  const cleaned = csvText.replace(/^[﻿￾​]+/, '')

  const raw = Papa.parse<string[]>(cleaned, {
    header: false,
    skipEmptyLines: true,
    delimiter: ',',
  })

  const warnings = raw.errors
    .filter((e) => e.code !== 'TooFewFields' && e.code !== 'TooManyFields')
    .map((e) => `Row ${e.row ?? '?'}: ${e.message}`)

  if (raw.data.length === 0) {
    return { rows: [], skipped: 0, warnings, trace: [], headers: [] }
  }

  const headerRow1 = raw.data[0]
  let dataStart = 1
  let headers: string[]

  if (looksLikeHeaderContinuation(raw.data[1])) {
    // Pattern B: split across two physical rows.
    const headerRow2 = raw.data[1]
    const width = Math.max(headerRow1.length, headerRow2.length)
    headers = []
    for (let i = 0; i < width; i++) {
      headers.push(joinHeaderParts(headerRow1[i] ?? '', headerRow2[i] ?? ''))
    }
    dataStart = 2
  } else {
    // Pattern A: single row, possibly with embedded newlines inside quoted cells.
    headers = headerRow1.map((c) =>
      (c || '').replace(/\r?\n/g, ' ').trim().replace(/\s+/g, ' '),
    )
  }

  // Build a normalized-key → column-index map. First match wins so duplicate
  // headers (which DAS shouldn't emit) don't shadow earlier columns.
  const colIndex = new Map<string, number>()
  headers.forEach((h, i) => {
    const k = normKey(h)
    if (k && !colIndex.has(k)) colIndex.set(k, i)
  })

  const idxOf = (name: string): number => colIndex.get(normKey(name)) ?? -1
  const cell = (row: string[], name: string): string => {
    const i = idxOf(name)
    return i >= 0 ? (row[i] ?? '') : ''
  }

  const out: ParsedFeeRow[] = []
  const trace: ParseDailySummaryResult['trace'] = []
  let skipped = 0

  for (let i = dataStart; i < raw.data.length; i++) {
    const r = raw.data[i]
    const fileRow = i + 1 // 1-based physical row in the file

    if (!Array.isArray(r) || r.length === 0) {
      skipped++
      trace.push({ row: fileRow, outcome: 'skipped', reason: 'empty-row' })
      continue
    }

    const symbol = cell(r, 'Symbol').trim().toUpperCase()
    if (!symbol) {
      skipped++
      trace.push({ row: fileRow, outcome: 'skipped', reason: 'empty-symbol' })
      continue
    }
    if (isTotalSymbol(symbol)) {
      skipped++
      trace.push({ row: fileRow, outcome: 'skipped', reason: 'total-row', symbol })
      continue
    }

    const fee_ecn = Math.abs(num(cell(r, 'ECN')))
    const fee_sec = Math.abs(num(cell(r, 'SEC')))
    const fee_finra = Math.abs(num(cell(r, 'FINRA')))
    const fee_htb = Math.abs(num(cell(r, 'HTB Fee')))
    const fee_cat = Math.abs(num(cell(r, 'CAT Fee')))
    const total_fees = round2(fee_ecn + fee_sec + fee_finra + fee_htb + fee_cat)

    out.push({
      symbol,
      fee_ecn: round2(fee_ecn),
      fee_sec: round2(fee_sec),
      fee_finra: round2(fee_finra),
      fee_htb: round2(fee_htb),
      fee_cat: round2(fee_cat),
      total_fees,
    })
    trace.push({ row: fileRow, outcome: 'kept', symbol })
  }

  return { rows: out, skipped, warnings, trace, headers }
}
