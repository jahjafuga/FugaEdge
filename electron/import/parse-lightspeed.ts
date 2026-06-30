import Papa from 'papaparse'
import type { Execution } from '@shared/import-types'
import { localEasternToUtc } from '@/lib/format'
import { orderWithinMinute, type FillDirection } from '@/core/import/order-within-minute'

// Lightspeed "blotter" — execution-level CSV, 46 fixed columns, one row per
// fill, fees inline. Feeds the position-based round-trip builder (like TradeZero
// / DAS execution). Cloned from parse-tradezero.ts; the Lightspeed-specific
// parts are:
//   - side comes from the SIGNED Qty (+ buy / − sell), cross-checked against the
//     "Side" column;
//   - timestamps come from "Raw Exec. Time" ("MM/DD/YYYY HH:MM:SS"), Eastern
//     wall-clock → true UTC via localEasternToUtc (DST-aware). Seconds are
//     always :00;
//   - real per-fill IDs exist ("Trade Number", unique), so no synthetic IDs;
//   - inline fees map to the model's fee fields, sign-preserving;
//   - a within-minute ordering pass (orderWithinMinute) fixes Lightspeed's
//     minute-resolution row order so the builder reads each trip's direction
//     correctly — see src/core/import/order-within-minute.ts.

const COL = {
  account: 'Account Number',
  sideCol: 'Side',
  symbol: 'Symbol',
  buySell: 'Buy/Sell',
  price: 'Price',
  qty: 'Qty',
  tradeNumber: 'Trade Number',
  commission: 'Commission Amount',
  rawExecTime: 'Raw Exec. Time',
  feeSec: 'FeeSEC',
  feeMf: 'FeeMF',
  fee1: 'Fee1',
  fee2: 'Fee2',
  fee3: 'Fee3',
  feeStamp: 'FeeStamp',
  feeTaf: 'FeeTAF',
  fee4: 'Fee4',
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

// Sign-preserving numeric parse. Handles literal-minus ("-1088.2000"),
// accountant parens ("(0.20)" → -0.20), AND leading-dot / zero-padded forms
// (".2500" → 0.25, ".0400000000" → 0.04) — Number.parseFloat accepts a leading
// dot natively, so no special-casing is needed. Strips $ , and whitespace.
// Empty / unparseable → 0.
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

// "MM/DD/YYYY HH:MM:SS" → { date: "YYYY-MM-DD" (Eastern trading day), time:
// "HH:MM:SS" }. Returns null on a malformed or out-of-range value so the caller
// skips + traces. Seconds are always :00 in Lightspeed but are passed through.
export function parseLightspeedExecTime(
  raw: string,
): { date: string; time: string } | null {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const mo = Number(m[1])
  const dd = Number(m[2])
  const yy = Number(m[3])
  const hh = Number(m[4])
  const mi = Number(m[5])
  const ss = Number(m[6])
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59 || ss > 59) {
    return null
  }
  return { date: `${yy}-${pad(mo)}-${pad(dd)}`, time: `${pad(hh)}:${pad(mi)}:${pad(ss)}` }
}

export interface ParseLightspeedResult {
  executions: Execution[]
  skipped: number
  warnings: string[]
  trace: { row: number; outcome: 'kept' | 'skipped'; reason?: string; symbol?: string }[]
}

export function parseLightspeedCsv(
  csvText: string,
  sourceFile?: string,
): ParseLightspeedResult {
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
  // Per-fill trade-direction labels (from "Buy/Sell"), parallel to executions,
  // consumed by the within-minute ordering pass below.
  const directions: FillDirection[] = []
  const trace: ParseLightspeedResult['trace'] = []
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

    // Side from the SIGNED Qty: + → buy, − → sell. Magnitude is the share count.
    const qtySigned = num(pick(r, COL.qty))
    const qty = Math.round(Math.abs(qtySigned))
    if (qty <= 0) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'zero-qty', symbol })
      continue
    }
    const side: 'B' | 'S' = qtySigned > 0 ? 'B' : 'S'

    // Cross-check against the explicit "Side" column. They always agree on real
    // data; a disagreement shouldn't happen, so surface it rather than swallow.
    const sideCol = pick(r, COL.sideCol).trim().toUpperCase()
    if ((sideCol === 'B' || sideCol === 'S') && sideCol !== side) {
      warnings.push(
        `Row ${rowNum}: Side column "${sideCol}" disagrees with signed Qty (${qtySigned}) for ${symbol}`,
      )
    }

    const price = num(pick(r, COL.price))
    if (price <= 0) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'zero-price', symbol })
      continue
    }

    const t = parseLightspeedExecTime(pick(r, COL.rawExecTime))
    if (!t) {
      skipped++
      trace.push({
        row: rowNum,
        outcome: 'skipped',
        reason: `bad-time:"${pick(r, COL.rawExecTime)}"`,
        symbol,
      })
      continue
    }

    // Bare-local Eastern (Lightspeed carries no offset) → true UTC. `date` stays
    // the Eastern trading day; only `time` becomes UTC.
    const timeUtc = localEasternToUtc(t.date, t.time)

    // Trade direction from the "Long"/"Short" prefix — used ONLY for the
    // within-minute ordering rule, never for per-fill B/S (that's the qty sign).
    const direction: FillDirection = /^\s*short/i.test(pick(r, COL.buySell)) ? 'short' : 'long'

    // Real per-fill ID. The Execution type requires order_id; Lightspeed has no
    // separate order identifier, so both reuse the unique Trade Number.
    const tradeNumber = pick(r, COL.tradeNumber).trim()

    const account_name = pick(r, COL.account).trim()

    // Fee map (sign-preserving). FeeTAF → finra_fee (FINRA Trading Activity
    // Fee). The generic numbered/MF/stamp fees have no documented per-bucket
    // mapping, so they fold into other_fees ("capture now, normalize later").
    // ecn_fee / cat_fee / htb_fee have no Lightspeed column → left unset.
    const commission = round2(num(pick(r, COL.commission)))
    const sec_fee = round2(num(pick(r, COL.feeSec)))
    const finra_fee = round2(num(pick(r, COL.feeTaf)))
    const other_fees = round2(
      num(pick(r, COL.feeMf)) +
        num(pick(r, COL.fee1)) +
        num(pick(r, COL.fee2)) +
        num(pick(r, COL.fee3)) +
        num(pick(r, COL.feeStamp)) +
        num(pick(r, COL.fee4)),
    )

    executions.push({
      trade_id: tradeNumber,
      order_id: tradeNumber,
      symbol,
      side,
      // Lightspeed knows direction explicitly, but per spec the Long/Short label
      // drives only the ordering pass; is_short stays false (the builder infers
      // short trips from sell-before-buy ordering, same as the other parsers).
      is_short: false,
      qty,
      price,
      time: timeUtc,
      date: t.date,
      account_name: account_name || undefined,
      is_paper: false,
      commission,
      sec_fee,
      finra_fee,
      other_fees,
      source_broker: 'Lightspeed',
      source_format: 'execution',
      source_file: sourceFile,
    })
    directions.push(direction)
    trace.push({ row: rowNum, outcome: 'kept', symbol })
  }

  // Normalize within-minute fill order before the executions reach the builder.
  const ordered = orderWithinMinute(executions, directions)

  return { executions: ordered, skipped, warnings, trace }
}
