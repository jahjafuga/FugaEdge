import Papa from 'papaparse'
import type { Execution } from '@shared/import-types'

// DAS Trades.csv columns:
// TradeID, OrderID, Trader, Account, Branch, route, bkrsym, rrno, B/S, SHORT,
// Market, symb, qty, price, time
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
}

export function parseExecutionsCsv(csvText: string): ParseExecutionsResult {
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
  const trace: ParseExecutionsResult['trace'] = []
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
    const t = parseDasTime(timeRaw)
    if (!t) {
      skipped++
      trace.push({
        row: rowNum,
        outcome: 'skipped',
        reason: `bad-time:"${timeRaw}"`,
        symbol,
      })
      continue
    }

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
      time: t.iso,
      date: t.date,
    })
    trace.push({ row: rowNum, outcome: 'kept', symbol })
  }

  return { executions, skipped, warnings, trace }
}
