import Papa from 'papaparse'
import { createHash } from 'node:crypto'
import type { Execution } from '@shared/import-types'
import { localEasternToUtc } from '@/lib/format'

// TradeZero execution-level CSV export (File 1). Header:
//   Account, T/D, S/D, Currency, Type, Side, Symbol, Qty, Price, Exec Time,
//   Comm, SEC, TAF, NSCC, Nasdaq, ECN Remove, ECN Add, Gross Proceeds,
//   Net Proceeds, Clr Broker, Liq, Note
//
// A hybrid of two proven adapters:
//   - Structure cloned from parse-webull-mobile.ts: CSV → Execution[], no
//     per-fill ID in the source (synthesize tz-<sha1[0..12]>), is_short:false
//     on every row — the round-trip builder infers shorts from sell-before-buy
//     ordering within a (symbol, account_name) bucket, never from is_short.
//   - Per-fill fee columns mapped to the model's fee fields, SIGN-PRESERVING.
//     ECN Add is frequently a rebate/credit — a parenthesized "(0.20)" or a
//     literal "-0.20" — and MUST keep its sign; never abs() it. The fee fields
//     fold into the round-trip total_fees via the builder's FEE_KEYS sum.
//
// Timestamps: TradeZero's "Exec Time" carries no timezone suffix. We treat
// T/D + Exec Time as US/Eastern wall-clock and convert to true UTC via
// localEasternToUtc (DST-aware) — the same boundary the three DAS parsers use.
// (Wall-clock-Eastern is to be confirmed with the broker; revisit for File 2.)

const COL = {
  account: 'Account',
  tradeDate: 'T/D',
  type: 'Type',
  side: 'Side',
  symbol: 'Symbol',
  qty: 'Qty',
  price: 'Price',
  execTime: 'Exec Time',
  comm: 'Comm',
  sec: 'SEC',
  taf: 'TAF',
  nscc: 'NSCC',
  nasdaq: 'Nasdaq',
  ecnRemove: 'ECN Remove',
  ecnAdd: 'ECN Add',
  clrBroker: 'Clr Broker',
  liq: 'Liq',
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

// Sign-preserving numeric parse. Handles literal-minus ("-0.20") AND
// accountant parens ("(0.20)" → -0.20); strips $ , and whitespace. Empty /
// unparseable → 0. Same shape as the Webull Mobile + Ocean One parsers so an
// ECN-Add rebate keeps its negative sign through to total_fees.
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

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// "B" / "Buy" → 'B' ; "S" / "Sell" / "SS" (short sell) → 'S'. Case-insensitive.
// The canonical fixture uses single-letter B/S; the spelled-out and SS/BC forms
// are tolerated defensively. Returns null on anything else so the caller skips
// + traces rather than guessing. A short trade enters as S (SS) and covers as
// B (BC) — the builder reads sell-before-buy to label the round-trip short.
export function normalizeTradeZeroSide(raw: string): 'B' | 'S' | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (s === 'b' || s === 'buy' || s === 'bc' || s === 'buy to cover') return 'B'
  if (s === 's' || s === 'sell' || s === 'ss' || s === 'short' || s === 'sell short') return 'S'
  return null
}

// "06/15/2026" → "2026-06-15". Returns null on any format deviation or an
// out-of-range month/day so the row gets skipped with a clear trace reason.
export function parseTradeZeroDate(raw: string): string | null {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const mo = Number(m[1])
  const dd = Number(m[2])
  const yy = Number(m[3])
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null
  return `${yy}-${pad(mo)}-${pad(dd)}`
}

// "09:30:00" → "09:30:00" (validated, zero-padded HH:MM:SS, 24-hour). Returns
// null on a malformed or out-of-range time.
export function parseTradeZeroTime(raw: string): string | null {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const hh = Number(m[1])
  const mi = Number(m[2])
  const ss = Number(m[3])
  if (hh > 23 || mi > 59 || ss > 59) return null
  return `${pad(hh)}:${pad(mi)}:${pad(ss)}`
}

// Deterministic per-row ID. Same construction shape as the Webull Mobile /
// trades_window synths so the dedup contract is consistent across formats —
// re-import a file → same hash → existing row preserved. Built from the bare
// local-Eastern components (not the converted UTC) so the ID is stable.
function synthId(
  date: string,
  time: string,
  symbol: string,
  side: 'B' | 'S',
  qty: number,
  price: number,
): string {
  const payload = `${date}|${time}|${symbol}|${side}|${qty}|${price}`
  return 'tz-' + createHash('sha1').update(payload).digest('hex').slice(0, 12)
}

export interface ParseTradeZeroResult {
  executions: Execution[]
  skipped: number
  warnings: string[]
  trace: { row: number; outcome: 'kept' | 'skipped'; reason?: string; symbol?: string }[]
}

export function parseTradeZeroCsv(csvText: string, sourceFile?: string): ParseTradeZeroResult {
  // Strip any BOM / zero-width marks at the head of the file — same defensive
  // op as the DAS + Webull parsers.
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
  const trace: ParseTradeZeroResult['trace'] = []
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

    const side = normalizeTradeZeroSide(pick(r, COL.side))
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

    const date = parseTradeZeroDate(pick(r, COL.tradeDate))
    if (!date) {
      skipped++
      trace.push({
        row: rowNum,
        outcome: 'skipped',
        reason: `bad-date:"${pick(r, COL.tradeDate)}"`,
        symbol,
      })
      continue
    }

    const time = parseTradeZeroTime(pick(r, COL.execTime))
    if (!time) {
      skipped++
      trace.push({
        row: rowNum,
        outcome: 'skipped',
        reason: `bad-time:"${pick(r, COL.execTime)}"`,
        symbol,
      })
      continue
    }

    const qtyRounded = Math.round(qty)
    const synth = synthId(date, time, symbol, side, qtyRounded, price)
    const timeUtc = localEasternToUtc(date, time)

    // Fee map (sign-preserving). NSCC + Nasdaq fold into other_fees; ECN Remove
    // + ECN Add fold into ecn_fee with ECN Add's rebate sign intact.
    const commission = round2(num(pick(r, COL.comm)))
    const sec_fee = round2(num(pick(r, COL.sec)))
    const finra_fee = round2(num(pick(r, COL.taf)))
    const other_fees = round2(num(pick(r, COL.nscc)) + num(pick(r, COL.nasdaq)))
    const ecn_fee = round2(num(pick(r, COL.ecnRemove)) + num(pick(r, COL.ecnAdd)))

    const account_name = pick(r, COL.account).trim()
    const order_type = pick(r, COL.type).trim()
    const broker_code = pick(r, COL.clrBroker).trim()
    const liq_type = pick(r, COL.liq).trim()

    executions.push({
      // No per-fill ID in the source — both trade_id and order_id collapse to
      // the synthetic, matching the Webull Mobile / trades_window pattern.
      trade_id: synth,
      order_id: synth,
      symbol,
      side,
      // TradeZero has no SHORT flag on the execution row. Shorts get inferred
      // by build-round-trips from sell-before-buy ordering — same convention as
      // the Webull Mobile + DAS trades_window parsers.
      is_short: false,
      qty: qtyRounded,
      price,
      time: timeUtc,
      date,
      // Account drives the builder's (symbol, account_name) grouping. Only set
      // when non-empty so a blank Account groups by symbol alone.
      account_name: account_name || undefined,
      order_type: order_type || undefined,
      broker_code: broker_code || undefined,
      liq_type: liq_type || undefined,
      commission,
      sec_fee,
      finra_fee,
      other_fees,
      ecn_fee,
      source_broker: 'TradeZero',
      source_format: 'execution',
      source_file: sourceFile,
    })
    trace.push({ row: rowNum, outcome: 'kept', symbol })
  }

  return { executions, skipped, warnings, trace }
}
