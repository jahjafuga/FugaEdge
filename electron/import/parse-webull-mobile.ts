import Papa from 'papaparse'
import { createHash } from 'node:crypto'
import type { Execution } from '@shared/import-types'

// Webull Mobile CSV export. Header:
//   Name, Symbol, Side, Status, Filled, Total Qty, Price, Avg Price,
//   Time-in-Force, Placed Time, Filled Time
//
// Differences from the DAS shapes:
//   - Side is title-case Buy/Sell (DAS uses B/S)
//   - Price has an '@' prefix and 10-decimal precision: "@4.7700000000"
//   - Avg Price has the same 10-decimal precision but NO '@' prefix
//   - Timestamps are "MM/DD/YYYY HH:MM:SS EDT|EST" — literal TZ abbr
//   - No per-fill ID; synthesize wbm-<sha1[0..12]> from the row tuple
//
// Per the v0.2.0 Day 4 decision: drop the EDT/EST literal and store the
// bare local-Eastern time as ISO YYYY-MM-DDTHH:MM:SS. This matches the
// four DAS parsers (parse-executions, parse-tradehistory, parse-trades-
// window, parse-daily-summary) — none of them store true UTC despite
// the executions.timestamp_utc column name. The v0.3.0 ticket
// [[store-true-utc-timestamps]] handles the cross-codebase cleanup.

const COL = {
  symbol: 'Symbol',
  side: 'Side',
  status: 'Status',
  filled: 'Filled',
  totalQty: 'Total Qty',
  price: 'Price',
  avgPrice: 'Avg Price',
  tif: 'Time-in-Force',
  placedTime: 'Placed Time',
  filledTime: 'Filled Time',
}

function normKey(k: string): string {
  return k.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9-]/g, '')
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

// "@4.7700000000" → 4.77 ; "4.77" → 4.77 ; "" → 0
// Webull mobile prefixes the order limit price (Price column) with '@'
// but not the realized fill price (Avg Price). Tolerate both.
export function parseWebullPrice(raw: string): number {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return 0
  const stripped = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  return num(stripped)
}

// "Buy" / "Sell" → 'B' / 'S'. Case-insensitive. Returns null on
// anything else so the caller can skip + trace.
export function normalizeWebullSide(raw: string): 'B' | 'S' | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'buy') return 'B'
  if (s === 'sell') return 'S'
  return null
}

// "05/14/2026 06:54:05 EDT" → { date: "2026-05-14", time: "2026-05-14T06:54:05", tz: "EDT" }
//
// The EDT|EST suffix is parsed for validation only — we store bare local
// Eastern per the v0.2.0 convention (see file header). Returns null on
// any format deviation so the row gets skipped with a clear trace
// reason rather than silently losing data.
export function parseWebullMobileTimestamp(
  raw: string,
): { date: string; time: string; tz: 'EDT' | 'EST' } | null {
  const m = String(raw ?? '').trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(EDT|EST)$/,
  )
  if (!m) return null
  const mo = Number(m[1])
  const dd = Number(m[2])
  const yy = Number(m[3])
  const hh = Number(m[4])
  const mi = Number(m[5])
  const ss = Number(m[6])
  const tz = m[7] as 'EDT' | 'EST'
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null
  if (hh > 23 || mi > 59 || ss > 59) return null
  const date = `${yy}-${pad(mo)}-${pad(dd)}`
  const time = `${date}T${pad(hh)}:${pad(mi)}:${pad(ss)}`
  return { date, time, tz }
}

// Deterministic per-row ID. Same construction shape as the trades_window
// synth (Tester B parser) so the dedup contract is consistent across
// formats — re-import a file → same hash → existing row preserved.
function synthId(
  date: string,
  time: string,
  symbol: string,
  side: 'B' | 'S',
  qty: number,
  price: number,
): string {
  const payload = `${date}|${time}|${symbol}|${side}|${qty}|${price}`
  return 'wbm-' + createHash('sha1').update(payload).digest('hex').slice(0, 12)
}

export interface ParseWebullMobileResult {
  executions: Execution[]
  skipped: number
  warnings: string[]
  trace: { row: number; outcome: 'kept' | 'skipped'; reason?: string; symbol?: string }[]
}

export function parseWebullMobileCsv(
  csvText: string,
  sourceFile?: string,
): ParseWebullMobileResult {
  // Strip any BOM / zero-width marks Webull's mobile export occasionally
  // leaves at the head of the file — same defensive op as the DAS parsers.
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
  const trace: ParseWebullMobileResult['trace'] = []
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

    // Webull Mobile can emit non-Filled statuses (Cancelled, Partial
    // Filled, etc.). Only Filled rows contribute to executions —
    // anything else has no realized fill data and would corrupt the
    // round-trip math downstream.
    const status = pick(r, COL.status).trim().toLowerCase()
    if (status !== 'filled') {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: `status:"${status}"`, symbol })
      continue
    }

    const side = normalizeWebullSide(pick(r, COL.side))
    if (!side) {
      skipped++
      trace.push({
        row: rowNum,
        outcome: 'skipped',
        reason: `bad-side:"${pick(r, COL.side)}"`,
        symbol,
      })
      continue
    }

    // Prefer Filled (the realized quantity) over Total Qty (the requested
    // quantity). They're equal in the all-fully-filled fixture; in
    // partial-fill cases Filled is the authoritative count.
    const qty = Math.abs(num(pick(r, COL.filled)))
    if (qty <= 0) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'zero-qty', symbol })
      continue
    }

    // Avg Price is the realized average fill price (no '@' prefix in
    // the source). Prefer it over Price (the order limit price) — when
    // a market or aggressive limit order fills against multiple price
    // levels, Avg is the only honest answer.
    const price = parseWebullPrice(pick(r, COL.avgPrice))
    if (price <= 0) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'zero-price', symbol })
      continue
    }

    const ts = parseWebullMobileTimestamp(pick(r, COL.filledTime))
    if (!ts) {
      skipped++
      trace.push({
        row: rowNum,
        outcome: 'skipped',
        reason: `bad-time:"${pick(r, COL.filledTime)}"`,
        symbol,
      })
      continue
    }

    const qtyRounded = Math.round(qty)
    const synth = synthId(ts.date, ts.time, symbol, side, qtyRounded, price)

    executions.push({
      // No per-fill ID in the source — both trade_id and order_id
      // collapse to the synthetic. Matches the trades_window pattern
      // when no Cloid is available.
      trade_id: synth,
      order_id: synth,
      symbol,
      side,
      // Webull Mobile has no SHORT column. Shorts get inferred by
      // build-round-trips from sell-before-buy ordering within a
      // (symbol, account_name) bucket — same convention as the DAS
      // trades_window parser.
      is_short: false,
      qty: qtyRounded,
      price,
      time: ts.time,
      date: ts.date,
      source_broker: 'Webull',
      // 'orders' is the SourceFormat slot for Webull Mobile per
      // shared/import-types.ts — one row per filled order, not one
      // row per partial fill.
      source_format: 'orders',
      source_file: sourceFile,
      // is_paper is intentionally NOT set here. It's populated by the
      // import preview's Account Type toggle (Track C). In v0.2.0 that
      // toggle disables Import on paper, so this stays implicitly
      // false (real account) for any committed Webull Mobile import.
    })
    trace.push({ row: rowNum, outcome: 'kept', symbol })
  }

  return { executions, skipped, warnings, trace }
}
