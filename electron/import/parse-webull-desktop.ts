import ExcelJS from 'exceljs'
import { createHash } from 'node:crypto'
import type { Execution } from '@shared/import-types'

// Webull Desktop XLSX export. Sheet: "Order" (singular). 19 columns:
//   User ID, Symbol, Name, Ticker Type, Side, Total Qty, Filled Qty,
//   Stop Price, Limit Price, Average Price, Order Type, Time In Force,
//   Trading Allowed Time Period, Placed Time, Filled Time, Execute
//   Status, Filled Price, Filled Amount, Create Time
//
// Differences from Webull Mobile CSV (parse-webull-mobile.ts):
//   - Binary input read via exceljs (Papa.parse can't read XLSX)
//   - Side is UPPERCASE BUY/SELL (mobile: title-case Buy/Sell) — separate
//     normalizer per the v0.2.0 cross-format-isolation rule
//   - Prices are 2-decimal strings, no '@' prefix (mobile: 10-decimal
//     with optional '@')
//   - Timestamps are ISO 8601 UTC with '+0000' offset (mobile: bare
//     MM/DD/YYYY HH:MM:SS with literal EDT|EST suffix)
//   - Status column is "Execute Status" with value "FILLED" (mobile:
//     "Status" with "Filled")
//   - Synthetic ID prefix is wbd- (mobile: wbm-) — useful for forensic
//     ID tracing back to source format
//
// Per the v0.2.0 Day 4 decision (Option I): convert UTC → America/
// New_York local wall-clock via Intl.DateTimeFormat, then store as bare
// ISO without the Z/offset. Matches the existing DAS-parser convention
// and the sibling Webull Mobile parser. v0.3.0 ticket
// [[store-true-utc-timestamps]] flips this to true UTC across all six
// parsers in one go (cross-codebase audit deferred).
//
// Cell-type note: exceljs preserves source cell types. Total Qty and
// Filled Qty come through as JS numbers (XLSX numeric cells); Average
// Price, Filled Price, Filled Amount come through as strings (XLSX text
// cells). The num() helper coerces both — future readers shouldn't have
// to discover this by debugging.

const SHEET_NAME = 'Order'

const COL = {
  symbol: 'Symbol',
  side: 'Side',
  totalQty: 'Total Qty',
  filledQty: 'Filled Qty',
  filledPrice: 'Filled Price',
  filledTime: 'Filled Time',
  status: 'Execute Status',
}

const REQUIRED_COLUMNS = [
  COL.symbol,
  COL.side,
  COL.filledQty,
  COL.filledPrice,
  COL.filledTime,
  COL.status,
]

function normKey(k: string): string {
  return k.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9-]/g, '')
}

// Coerces XLSX cell values (string OR number, plus null/undefined) into
// a finite number. Returns 0 on garbage so the caller's qty/price > 0
// checks reject the row with a clean trace reason.
function num(raw: unknown): number {
  if (raw == null) return 0
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  const trimmed = String(raw).trim()
  if (!trimmed) return 0
  const cleaned = trimmed.replace(/[$,\s]/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isNaN(n) ? 0 : n
}

// "BUY" / "SELL" → 'B' / 'S'. Trim + uppercase first so a stray
// title-case 'Buy' from a hand-edited file won't silently fail — but
// the strict surface is the canonical case (see Webull Mobile parser
// for the title-case sibling). Returns null on anything else.
export function normalizeWebullDesktopSide(raw: unknown): 'B' | 'S' | null {
  if (raw == null) return null
  const s = String(raw).trim().toUpperCase()
  if (s === 'BUY') return 'B'
  if (s === 'SELL') return 'S'
  return null
}

// Convert a UTC-anchored ISO timestamp to America/New_York local
// wall-clock time, returned as bare ISO (no Z, no offset).
// Uses Intl.DateTimeFormat with timeZone='America/New_York' so DST
// transitions and any future US DST rule changes are handled by the
// platform's zoneinfo data, not by a year-by-year lookup table.
//
//   "2026-05-14T10:37:03.153+0000" (UTC, EDT in effect)
//     → { date: "2026-05-14", time: "2026-05-14T06:37:03" }
//   "2026-12-15T14:30:00.000+0000" (UTC, EST in effect)
//     → { date: "2026-12-15", time: "2026-12-15T09:30:00" }
//
// Returns null on any parse failure (malformed ISO, NaN milliseconds).
export function utcIsoToBareEastern(
  utcIso: string,
): { date: string; time: string } | null {
  const ms = Date.parse(utcIso)
  if (Number.isNaN(ms)) return null
  const d = new Date(ms)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const yyyy = get('year')
  const mm = get('month')
  const dd = get('day')
  let hh = get('hour')
  const mi = get('minute')
  const ss = get('second')
  // Older Intl implementations occasionally emit "24" instead of "00"
  // for midnight (a known Node quirk in the v18 era). Normalize.
  if (hh === '24') hh = '00'
  if (!yyyy || !mm || !dd || !hh || !mi || !ss) return null
  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`,
  }
}

// Deterministic per-row ID. Distinct prefix wbd- (Webull Desktop)
// vs wbm- (Webull Mobile) so the source format is recoverable from any
// stored trade_id during debugging.
function synthId(
  date: string,
  time: string,
  symbol: string,
  side: 'B' | 'S',
  qty: number,
  price: number,
): string {
  const payload = `${date}|${time}|${symbol}|${side}|${qty}|${price}`
  return 'wbd-' + createHash('sha1').update(payload).digest('hex').slice(0, 12)
}

export interface ParseWebullDesktopResult {
  executions: Execution[]
  skipped: number
  warnings: string[]
  trace: { row: number; outcome: 'kept' | 'skipped'; reason?: string; symbol?: string }[]
}

export async function parseWebullDesktopXlsx(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  sourceFile?: string,
): Promise<ParseWebullDesktopResult> {
  const wb = new ExcelJS.Workbook()
  // exceljs's load() accepts Buffer at the TS level but ArrayBuffer /
  // Uint8Array work fine at runtime. Loose cast so the parser is callable
  // from web contexts (Next.js File API) without a Buffer dependency,
  // and to bridge the @types/node Buffer<ArrayBufferLike> vs exceljs's
  // older Buffer-without-generic typing mismatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any)

  // Strict sheet-name match per v0.2.0 design. If a real user reports
  // a different sheet name (Orders / Trades / a locale variant), add
  // it here with a comment explaining when/why — don't silently accept.
  const ws = wb.getWorksheet(SHEET_NAME)
  if (!ws) {
    const found = wb.worksheets.map((w) => w.name).join(', ') || '(none)'
    throw new Error(
      `Webull Desktop XLSX: expected a sheet named "${SHEET_NAME}", found: ${found}`,
    )
  }

  // Build a header → column-number map for tolerant column lookup
  // (matches the normKey/pick pattern in the CSV parsers).
  const headerRow = ws.getRow(1)
  const headerMap = new Map<string, number>()
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const v = cell.value
    if (typeof v === 'string') {
      headerMap.set(normKey(v), col)
    }
  })

  const colOf = (name: string): number | undefined => headerMap.get(normKey(name))

  // Validate required columns up front. A malformed XLSX fails clearly
  // here instead of producing N "empty-symbol" skipped rows downstream.
  for (const c of REQUIRED_COLUMNS) {
    if (colOf(c) == null) {
      throw new Error(`Webull Desktop XLSX: missing required column "${c}"`)
    }
  }

  const cellVal = (row: ExcelJS.Row, name: string): unknown => {
    const col = colOf(name)
    if (col == null) return null
    return row.getCell(col).value
  }

  const executions: Execution[] = []
  const trace: ParseWebullDesktopResult['trace'] = []
  const warnings: string[] = []
  let skipped = 0

  for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
    const row = ws.getRow(rowNum)

    const symbolRaw = cellVal(row, COL.symbol)
    if (symbolRaw == null || symbolRaw === '') {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'empty-symbol' })
      continue
    }
    const symbol = String(symbolRaw).trim().toUpperCase()

    const status = String(cellVal(row, COL.status) ?? '').trim().toUpperCase()
    if (status !== 'FILLED') {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: `status:"${status}"`, symbol })
      continue
    }

    const side = normalizeWebullDesktopSide(cellVal(row, COL.side))
    if (!side) {
      skipped++
      trace.push({
        row: rowNum,
        outcome: 'skipped',
        reason: `bad-side:"${cellVal(row, COL.side)}"`,
        symbol,
      })
      continue
    }

    // Filled Qty over Total Qty — realized count, defensive against future
    // partial-fill exports. Same call as Mobile parser.
    const qty = Math.abs(num(cellVal(row, COL.filledQty)))
    if (qty <= 0) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'zero-qty', symbol })
      continue
    }

    // Filled Price over Limit Price / Average Price — realized fill,
    // semantic match for the broker-agnostic Execution model.
    const price = num(cellVal(row, COL.filledPrice))
    if (price <= 0) {
      skipped++
      trace.push({ row: rowNum, outcome: 'skipped', reason: 'zero-price', symbol })
      continue
    }

    const filledTimeRaw = String(cellVal(row, COL.filledTime) ?? '').trim()
    const ts = utcIsoToBareEastern(filledTimeRaw)
    if (!ts) {
      skipped++
      trace.push({
        row: rowNum,
        outcome: 'skipped',
        reason: `bad-time:"${filledTimeRaw}"`,
        symbol,
      })
      continue
    }

    const qtyRounded = Math.round(qty)
    const synth = synthId(ts.date, ts.time, symbol, side, qtyRounded, price)

    executions.push({
      // No per-fill ID in the source — both trade_id and order_id
      // collapse to the synthetic. Matches the Webull Mobile pattern.
      trade_id: synth,
      order_id: synth,
      symbol,
      side,
      // No SHORT column in the source. Shorts get inferred by
      // build-round-trips from sell-before-buy ordering within a
      // (symbol, account_name) bucket — same convention as Mobile and
      // the DAS trades_window parser.
      is_short: false,
      qty: qtyRounded,
      price,
      time: ts.time,
      date: ts.date,
      source_broker: 'Webull',
      // 'xlsx' is the SourceFormat slot for Webull Desktop per
      // shared/import-types.ts.
      source_format: 'xlsx',
      source_file: sourceFile,
      // is_paper intentionally NOT set — Track C's import-preview
      // toggle overlays it. In v0.2.0 the toggle disables Import on
      // paper, so this stays implicitly false (real account) for any
      // committed Webull Desktop import.
    })
    trace.push({ row: rowNum, outcome: 'kept', symbol })
  }

  return { executions, skipped, warnings, trace }
}
