import Papa from 'papaparse'
import { createHash } from 'node:crypto'
import type { Execution } from '@shared/import-types'
import { localEasternToUtc } from '@/lib/format'
import { orderWithinMinute, type FillDirection } from '@/core/import/order-within-minute'

// ThinkorSwim (ToS) execution-level fills → position-based round-trip builder.
// TWO export shapes, both supported, sharing one private row-mapper:
//   - Trade Activity : clean flat CSV, header row 1, 13 cols incl. "Price
//     Improvement". Parsed header:true.
//   - Account Statement : section-formatted. A "Account Trade History" title
//     row, then a column header WITH A LEADING BLANK COLUMN, then data. Real
//     statements are multi-section, so we extract ONLY that block (stop at the
//     next section title / blank line / EOF) and map positionally — header:true
//     would mint an empty-string key from the leading blank column.
//
// ToS specifics: side from signed Qty; direction from Pos Effect × Side (drives
// within-minute ordering + builder); STOCK rows only (options skipped); NO fees
// (all fee fields left unset → builder infers fees_reported=false, never a fake
// $0); no fill-ID column → synthesize trade_id/order_id; minute-resolution times
// → reuse orderWithinMinute so same-minute clusters don't mislabel direction.

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

// Sign-preserving numeric parse (parens → negative, strips $ , whitespace).
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

// "M/D/YYYY H:MM" → { date "YYYY-MM-DD" (Eastern day), time "HH:MM:00" }.
// ToS times carry no seconds and single-digit month/day/hour; we zero-pad so
// localEasternToUtc's Date.parse sees a valid ISO time component. Null on a
// malformed / out-of-range value so the caller skips + traces.
export function parseToSTime(raw: string): { date: string; time: string } | null {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const mo = Number(m[1])
  const dd = Number(m[2])
  const yy = Number(m[3])
  const hh = Number(m[4])
  const mi = Number(m[5])
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59) return null
  return { date: `${yy}-${pad(mo)}-${pad(dd)}`, time: `${pad(hh)}:${pad(mi)}:00` }
}

// Trade DIRECTION from Pos Effect × Side (NOT the per-fill B/S, which is the qty
// sign). BUY+OPEN or SELL+CLOSE → long-side; SELL+OPEN or BUY+CLOSE → short-side.
// Feeds orderWithinMinute so a same-minute cluster keeps position on the correct
// side of zero and the builder reads the right long/short label.
export function deriveToSDirection(side: 'B' | 'S', posEffect: string): FillDirection {
  const opening = /open/i.test(posEffect)
  if (side === 'B') return opening ? 'long' : 'short'
  return opening ? 'short' : 'long'
}

// Deterministic per-fill ID — no ID column in either ToS export. Same shape as
// the TradeZero / Webull synths so re-importing the same file yields the same id
// (built from the bare local-Eastern components, stable across the UTC convert).
function synthId(
  date: string,
  time: string,
  symbol: string,
  side: 'B' | 'S',
  qty: number,
  price: number,
): string {
  const payload = `${date}|${time}|${symbol}|${side}|${qty}|${price}`
  return 'tos-' + createHash('sha1').update(payload).digest('hex').slice(0, 12)
}

interface ToSRaw {
  execTime: string
  side: string
  qty: string
  posEffect: string
  symbol: string
  exp: string
  strike: string
  type: string
  price: string
}

type MapResult =
  | { kind: 'exec'; exec: Execution; direction: FillDirection; warning?: string }
  | { kind: 'skip'; reason: string }

// Shared row → Execution mapper for both ToS formats.
function mapToSRow(raw: ToSRaw, sourceFile?: string): MapResult {
  const symbol = raw.symbol.trim().toUpperCase()
  if (!symbol) return { kind: 'skip', reason: 'empty-symbol' }

  // Stocks only — skip options (Type≠STOCK, or Exp/Strike populated). Honest
  // skip reason, never silent.
  const type = raw.type.trim().toUpperCase()
  if (type && type !== 'STOCK') return { kind: 'skip', reason: `non-stock-type:"${raw.type.trim()}"` }
  if (raw.exp.trim() || raw.strike.trim()) return { kind: 'skip', reason: 'option-row' }

  // Side from the SIGNED Qty; magnitude is the share count.
  const qtySigned = num(raw.qty)
  const qty = Math.round(Math.abs(qtySigned))
  if (qty <= 0) return { kind: 'skip', reason: 'zero-qty' }
  const side: 'B' | 'S' = qtySigned > 0 ? 'B' : 'S'

  const price = num(raw.price)
  if (price <= 0) return { kind: 'skip', reason: 'zero-price' }

  const t = parseToSTime(raw.execTime)
  if (!t) return { kind: 'skip', reason: `bad-time:"${raw.execTime.trim()}"` }

  // Cross-check the qty-sign side against the Side text; surface a disagreement
  // rather than swallow it (shouldn't happen on real data).
  const sideText = raw.side.trim().toUpperCase()
  let warning: string | undefined
  if ((sideText === 'BUY' && side !== 'B') || (sideText === 'SELL' && side !== 'S')) {
    warning = `Side "${raw.side.trim()}" disagrees with signed Qty (${qtySigned}) for ${symbol}`
  }

  const timeUtc = localEasternToUtc(t.date, t.time)
  const direction = deriveToSDirection(side, raw.posEffect)
  const id = synthId(t.date, t.time, symbol, side, qty, price)

  const exec: Execution = {
    trade_id: id,
    order_id: id,
    symbol,
    side,
    is_short: false,
    qty,
    price,
    time: timeUtc,
    date: t.date,
    is_paper: false,
    // ToS reports NO fees. Leave every fee field UNSET (not 0) so the builder's
    // hasReportedFee → fees_reported=false: the UI shows "not reported", never a
    // fake $0. account_name stays unset (no account column; never from filename).
    source_broker: 'ThinkorSwim',
    source_format: 'execution',
    source_file: sourceFile,
  }
  return { kind: 'exec', exec, direction, warning }
}

export interface ParseToSResult {
  executions: Execution[]
  skipped: number
  warnings: string[]
  trace: { row: number; outcome: 'kept' | 'skipped'; reason?: string; symbol?: string }[]
}

function buildResult(
  rawRows: ToSRaw[],
  sourceFile: string | undefined,
  baseWarnings: string[],
): ParseToSResult {
  const warnings = [...baseWarnings]
  const executions: Execution[] = []
  const directions: FillDirection[] = []
  const trace: ParseToSResult['trace'] = []
  let skipped = 0
  let rowNum = 0

  for (const raw of rawRows) {
    rowNum++
    const res = mapToSRow(raw, sourceFile)
    if (res.kind === 'skip') {
      skipped++
      const sym = raw.symbol.trim().toUpperCase()
      trace.push({ row: rowNum, outcome: 'skipped', reason: res.reason, symbol: sym || undefined })
      continue
    }
    if (res.warning) warnings.push(`Row ${rowNum}: ${res.warning}`)
    executions.push(res.exec)
    directions.push(res.direction)
    trace.push({ row: rowNum, outcome: 'kept', symbol: res.exec.symbol })
  }

  // Normalize within-minute fill order before the executions reach the builder.
  const ordered = orderWithinMinute(executions, directions)
  return { executions: ordered, skipped, warnings, trace }
}

// ── Trade Activity: clean flat CSV, header row 1 ────────────────────────────
export function parseToSActivityCsv(csvText: string, sourceFile?: string): ParseToSResult {
  const cleaned = csvText.replace(/^[﻿￾​]+/, '')
  const parsed = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    delimiter: ',',
    transformHeader: (h) => h.trim(),
  })
  const baseWarnings = parsed.errors
    .filter((e) => e.code !== 'TooFewFields' && e.code !== 'TooManyFields')
    .map((e) => `Row ${e.row ?? '?'}: ${e.message}`)

  const rawRows: ToSRaw[] = []
  for (const r of parsed.data) {
    if (!r || typeof r !== 'object') continue
    rawRows.push({
      execTime: pick(r, 'Exec Time'),
      side: pick(r, 'Side'),
      qty: pick(r, 'Qty'),
      posEffect: pick(r, 'Pos Effect'),
      symbol: pick(r, 'Symbol'),
      exp: pick(r, 'Exp'),
      strike: pick(r, 'Strike'),
      type: pick(r, 'Type'),
      price: pick(r, 'Price'),
    })
  }
  return buildResult(rawRows, sourceFile, baseWarnings)
}

// ── Account Statement: extract ONLY the "Account Trade History" section ──────
export function parseToSStatementCsv(csvText: string, sourceFile?: string): ParseToSResult {
  const cleaned = csvText.replace(/^[﻿￾​]+/, '')
  // header:false + skipEmptyLines:false so a blank line can mark a section
  // boundary and the leading blank column doesn't collapse into a header key.
  const parsed = Papa.parse<string[]>(cleaned, {
    header: false,
    skipEmptyLines: false,
    delimiter: ',',
  })
  const rows = parsed.data

  const titleIdx = rows.findIndex(
    (r) => (r?.[0] ?? '').replace(/^[﻿￾​]+/, '').trim().toLowerCase() === 'account trade history',
  )
  if (titleIdx < 0) {
    return { executions: [], skipped: 0, warnings: ['Account Trade History section not found'], trace: [] }
  }

  // Row after the title is the column header (leading blank col); data follows
  // until a blank line, a next section title, or EOF. Data rows have a BLANK
  // leading column, so a non-blank first cell marks the next section.
  const rawRows: ToSRaw[] = []
  for (let i = titleIdx + 2; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => (c ?? '').trim() === '')) break
    if ((row[0] ?? '').trim() !== '') break
    rawRows.push({
      execTime: row[1] ?? '',
      side: row[3] ?? '',
      qty: row[4] ?? '',
      posEffect: row[5] ?? '',
      symbol: row[6] ?? '',
      exp: row[7] ?? '',
      strike: row[8] ?? '',
      type: row[9] ?? '',
      price: row[10] ?? '',
    })
  }
  return buildResult(rawRows, sourceFile, [])
}
