import * as XLSX from 'xlsx'
import { createHash } from 'node:crypto'
import type {
  Execution,
  RoundTrip,
  RoundTripExecution,
  DaySummaryFeeRow,
} from '@shared/import-types'
import { hashFills, hashFillsByContent } from '@/core/import/build-round-trips'
import { localEasternToUtc } from '@/lib/format'

// Ocean One broker TRADES report (.xls, OLE2/BIFF — read via SheetJS; exceljs
// CANNOT read the legacy binary format, so this parser is the reason xlsx is a
// dependency). Structure: repeating day-blocks —
//   [ "M/D/YYYY" date line, a 21-column header row, N trade rows, an "Equities"
//     subtotal row, a blank spacer ].
// Each TRADE row is a COMPLETE round trip (Opened, Closed, Symbol, Type, Entry,
// Exit, Qty, Gross, 11 itemized fees, Net) — NOT individual fills. So this
// parser emits RoundTrips DIRECTLY rather than synthesizing fills for the
// netting builder (buildRoundTrips would merge two overlapping same-symbol round
// trips). It still computes the dual dedup hashes from two synthetic fills
// (entry + exit) via the shared hashFills / hashFillsByContent, so the emitted
// trip dedups identically to a builder-produced one.
//
// TIMEZONE: the Opened/Closed cells carry no explicit zone, and SheetJS's date
// coercion is machine-local (unreliable). We read the FORMATTED cell string and
// treat it as US/Eastern broker wall-clock — same convention as the DAS parsers
// (localEasternToUtc, DST-aware). Dave's pre-market times (05:37 / 07:00 / 08:03
// ET) fit Eastern pre-market momentum trading. CONFIRM the zone with the broker
// before this ships in the import UI.
//
// FEES — confirmed against the real fixture (residual Gross - Σfees - Net = 0):
//   Comm → commission (kept DISTINCT, Dave's ask), Ecn Fee → ecn_fee,
//   SEC → sec_fee, CAT → cat_fee, TAF → finra_fee (Trading Activity Fee),
//   ORF/OCC/NSCC/Acc/Clr/Misc → other_fees. Only Comm/Ecn/SEC/CAT/TAF/NSCC are
//   ever non-zero in the fixture; the rest are always 0. total_fees sums all 11,
//   so commission is preserved separately AND included in total_fees.

type FeeField = 'commission' | 'ecn_fee' | 'sec_fee' | 'cat_fee' | 'finra_fee' | 'other_fees'

const FEE_TO_FIELD: Record<string, FeeField> = {
  Comm: 'commission',
  'Ecn Fee': 'ecn_fee',
  SEC: 'sec_fee',
  CAT: 'cat_fee',
  TAF: 'finra_fee',
  ORF: 'other_fees',
  OCC: 'other_fees',
  NSCC: 'other_fees',
  Acc: 'other_fees',
  Clr: 'other_fees',
  Misc: 'other_fees',
}
const FEE_COLUMNS = Object.keys(FEE_TO_FIELD)
const REQUIRED_COLUMNS = ['Opened', 'Closed', 'Symbol', 'Type', 'Entry', 'Exit', 'Qty']
const DATE_LINE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/

// ── Format detection (beat 2) ───────────────────────────────────────────────
// The nine leading trade columns in order + the Comm/Net fee bookends uniquely
// identify an Ocean One TRADES sheet; no DAS/Webull export shares this shape.
const OO_LEAD_COLUMNS = ['Opened', 'Closed', 'Held', 'Symbol', 'Type', 'Entry', 'Exit', 'Qty', 'Gross']

/** Pure header-row matcher — exported so the signature has a fixture-independent
 *  CI test. Tolerant of surrounding whitespace on labels. */
export function matchesOceanOneHeader(labels: readonly unknown[]): boolean {
  const norm = labels.map((l) => String(l ?? '').trim())
  return (
    OO_LEAD_COLUMNS.every((h, i) => norm[i] === h) &&
    norm.includes('Comm') &&
    norm.includes('Net')
  )
}

/** Sheet sniff: does the first sheet carry an Ocean One header row near the top?
 *  The .xls import branch calls this to CONFIRM an Ocean One file before parsing,
 *  so a non-Ocean-One .xls fails as "unrecognized" rather than crashing the
 *  parser. Returns false on any unreadable / non-spreadsheet input. */
export function detectOceanOneXls(buffer: Buffer | ArrayBuffer | Uint8Array): boolean {
  try {
    const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
    const wb = XLSX.read(data, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) return false
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    })
    const limit = Math.min(12, rows.length)
    for (let i = 0; i < limit; i++) {
      if (matchesOceanOneHeader(rows[i])) return true
    }
    return false
  } catch {
    return false
  }
}

// Parenthesized-negative + currency-aware numeric parse: "(0.12)" → -0.12,
// "$1,234.50" → 1234.5, blank → 0.
function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let s = String(v ?? '').trim()
  if (!s) return 0
  let neg = false
  if (s.startsWith('(') && s.endsWith(')')) {
    neg = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[$,\s]/g, '')
  const n = Number.parseFloat(s)
  if (!Number.isFinite(n)) return 0
  return neg ? -n : n
}

const pad2 = (x: string) => x.padStart(2, '0')

// "5/1/2026 5:37:35.000" → { date: "2026-05-01", time: "05:37:35" }.
function parseOpened(raw: string): { date: string; time: string } | null {
  const m = raw
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/)
  if (!m) return null
  const [, mo, d, y, h, mi, s] = m
  return { date: `${y}-${pad2(mo)}-${pad2(d)}`, time: `${pad2(h)}:${pad2(mi)}:${pad2(s)}` }
}

// "05:38:20" → "05:38:20" (validate + zero-pad). The Closed column is time-only;
// the trading day comes from Opened.
function parseClock(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/)
  if (!m) return null
  const [, h, mi, s] = m
  return `${pad2(h)}:${pad2(mi)}:${pad2(s)}`
}

function parseSide(raw: string): 'long' | 'short' | null {
  const s = raw.trim().toLowerCase()
  if (s === 'long') return 'long'
  if (s === 'short') return 'short'
  return null
}

function synthId(parts: (string | number)[]): string {
  return 'oo-' + createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
// Half-away-from-zero 2dp round. Plain round2 (Math.round) rounds a half toward
// +Infinity, so a short's negative half-cent Gross (e.g. -6.445) would round its
// MAGNITUDE down to -6.44; the sign-aware nudge makes it -6.45, matching the
// broker's displayed number for both longs and shorts. The 1e-6 also rescues a
// positive half-cent that floats just under its boundary (1.005 -> 1.01), so
// reading a full-precision file value rounds the way the broker shows it.
function round2HalfAway(n: number): number {
  return Math.round((n + Math.sign(n) * 1e-6) * 100) / 100
}

/** Per-(date,symbol) day_fees ledger the Ocean One path emits so the fee
 *  allocator can land a superseded OO trip's fees on the surviving DAS trade.
 *  status/matchedTrips are added downstream by the import handler. */
export type OceanOneDayFee = Omit<DaySummaryFeeRow, 'status' | 'matchedTrips'>

export interface ParseOceanOneResult {
  roundTrips: RoundTrip[]
  /** SUMMED per (date, symbol) — one row even when a day has many OO trips. */
  dayFees: OceanOneDayFee[]
  skipped: number
  warnings: string[]
  trace: { row: number; outcome: 'kept' | 'skipped'; reason?: string; symbol?: string }[]
}

export function parseOceanOneXls(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  sourceFile?: string,
): ParseOceanOneResult {
  // Buffer IS a Uint8Array; wrap a bare ArrayBuffer. type:'array' covers all
  // three so the parser is callable from web contexts (no Buffer dependency).
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
  const wb = XLSX.read(data, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: '',
  })

  const roundTrips: RoundTrip[] = []
  const dayFeeByKey = new Map<string, OceanOneDayFee>()
  const trace: ParseOceanOneResult['trace'] = []
  const warnings: string[] = []
  let skipped = 0

  // The header row repeats every day-block; rebuild the column map on each one.
  let colMap: Map<string, number> | null = null
  const cell = (row: unknown[], label: string): string => {
    if (!colMap) return ''
    const i = colMap.get(label)
    return i == null ? '' : String(row[i] ?? '').trim()
  }
  const skip = (row: number, reason: string, symbol?: string) => {
    skipped++
    trace.push({ row, outcome: 'skipped', reason, symbol })
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const c0 = String(row[0] ?? '').trim()

    // Blank spacer between day-blocks.
    if (row.every((c) => String(c ?? '').trim() === '')) continue
    // Date section marker (date ONLY — trade rows carry a date+time in Opened).
    if (DATE_LINE_RE.test(c0)) continue
    // Equities subtotal row.
    if (c0.toLowerCase() === 'equities') continue
    // Column-header row — (re)build the column map and validate it.
    if (c0 === 'Opened') {
      colMap = new Map()
      row.forEach((v, idx) => {
        const k = String(v ?? '').trim()
        if (k) colMap!.set(k, idx)
      })
      for (const req of REQUIRED_COLUMNS) {
        if (!colMap.has(req)) {
          throw new Error(`Ocean One .xls: header row is missing required column "${req}"`)
        }
      }
      continue
    }

    // Otherwise a trade row.
    if (!colMap) {
      skip(i, 'trade-row-before-header')
      continue
    }
    const symbol = cell(row, 'Symbol').toUpperCase()
    if (!symbol) {
      skip(i, 'empty-symbol')
      continue
    }
    const side = parseSide(cell(row, 'Type'))
    if (!side) {
      skip(i, `bad-type:"${cell(row, 'Type')}"`, symbol)
      continue
    }
    const opened = parseOpened(cell(row, 'Opened'))
    if (!opened) {
      skip(i, `bad-opened:"${cell(row, 'Opened')}"`, symbol)
      continue
    }
    const closeClock = parseClock(cell(row, 'Closed'))
    if (!closeClock) {
      skip(i, `bad-closed:"${cell(row, 'Closed')}"`, symbol)
      continue
    }
    const entry = num(cell(row, 'Entry'))
    const exit = num(cell(row, 'Exit'))
    const qty = Math.round(num(cell(row, 'Qty')))
    if (entry <= 0 || exit <= 0 || qty <= 0) {
      skip(i, 'non-positive-price-or-qty', symbol)
      continue
    }

    const openTimeUtc = localEasternToUtc(opened.date, opened.time)
    const closeTimeUtc = localEasternToUtc(opened.date, closeClock)

    // Fees — map the 11 columns onto the model fields; commission stays distinct.
    let commission = 0
    let ecn = 0
    let sec = 0
    let cat = 0
    let finra = 0
    let other = 0
    for (const col of FEE_COLUMNS) {
      const v = num(cell(row, col))
      switch (FEE_TO_FIELD[col]) {
        case 'commission':
          commission += v
          break
        case 'ecn_fee':
          ecn += v
          break
        case 'sec_fee':
          sec += v
          break
        case 'cat_fee':
          cat += v
          break
        case 'finra_fee':
          finra += v
          break
        default:
          other += v
      }
    }
    const totalFees = round2(commission + ecn + sec + cat + finra + other)

    // Beat B: trust the file's AUTHORITATIVE Gross column instead of recomputing
    // from the (rounded-average) Entry/Exit prices. The recompute dropped
    // half-cents (6.445 -> 6.44 vs the broker's 6.45) and drifted up to ~$2 on
    // large-share trades. colMap already indexes Gross; the file value carries the
    // correct sign for shorts, so no side branch is needed, and round2HalfAway
    // matches the broker's displayed rounding on both signs. Net stays the derived
    // gross - fees: reading the file's Net column too would break the
    // net = gross - fees invariant on real trips (independent 2dp rounding).
    const grossPnl = round2HalfAway(num(cell(row, 'Gross')))
    const netPnl = round2(grossPnl - totalFees)

    // Two synthetic fills (entry + exit) — NOT run through buildRoundTrips; used
    // only to compute the dual dedup hashes and to back executions_json.
    const entrySide: 'B' | 'S' = side === 'long' ? 'B' : 'S'
    const exitSide: 'B' | 'S' = side === 'long' ? 'S' : 'B'
    const entryId = synthId([opened.date, openTimeUtc, symbol, entrySide, qty, entry])
    const exitId = synthId([opened.date, closeTimeUtc, symbol, exitSide, qty, exit])
    const mkFill = (
      id: string,
      s: 'B' | 'S',
      price: number,
      timeUtc: string,
    ): Execution => ({
      trade_id: id,
      order_id: id,
      symbol,
      side: s,
      is_short: side === 'short',
      qty,
      price,
      time: timeUtc,
      date: opened.date,
    })
    const fills: Execution[] = [
      mkFill(entryId, entrySide, entry, openTimeUtc),
      mkFill(exitId, exitSide, exit, closeTimeUtc),
    ]
    const rtExecs: RoundTripExecution[] = fills.map((f) => ({
      trade_id: f.trade_id,
      order_id: f.order_id,
      side: f.side,
      qty: f.qty,
      price: f.price,
      time: f.time,
    }))

    // Accumulate this trip's itemized fees into the (date, symbol) day_fees
    // ledger — SUMMED so a day with many OO trips yields ONE row that ties to
    // the day's total. htb has no Ocean One source (always 0).
    const feeKey = `${opened.date}|${symbol}`
    let df = dayFeeByKey.get(feeKey)
    if (!df) {
      df = {
        date: opened.date,
        symbol,
        fee_ecn: 0,
        fee_sec: 0,
        fee_finra: 0,
        fee_htb: 0,
        fee_cat: 0,
        fee_commission: 0,
        fee_other: 0,
        total_fees: 0,
      }
      dayFeeByKey.set(feeKey, df)
    }
    df.fee_ecn = round2(df.fee_ecn + ecn)
    df.fee_sec = round2(df.fee_sec + sec)
    df.fee_finra = round2(df.fee_finra + finra)
    df.fee_cat = round2(df.fee_cat + cat)
    df.fee_commission = round2(df.fee_commission + commission)
    df.fee_other = round2(df.fee_other + other)
    df.total_fees = round2(df.total_fees + totalFees)

    roundTrips.push({
      date: opened.date,
      symbol,
      side,
      open_time: openTimeUtc,
      close_time: closeTimeUtc,
      is_open: false,
      shares_bought: qty,
      avg_buy_price: round4(side === 'long' ? entry : exit),
      shares_sold: qty,
      avg_sell_price: round4(side === 'long' ? exit : entry),
      gross_pnl: grossPnl,
      total_fees: totalFees,
      net_pnl: netPnl,
      exec_hash: hashFills(fills),
      content_hash: hashFillsByContent(fills),
      executions: rtExecs,
      status: 'new',
      source_broker: 'OceanOne',
      // Beat 2: OO trips are summary-class so the (symbol,date) supersede dedups
      // them against covering DAS executions (no duplicate trade); their fees
      // reach the surviving DAS trade via the day_fees ledger above.
      source_format: 'summary',
      source_file: sourceFile,
      fees_reported: true,
      commission,
    })
    trace.push({ row: i, outcome: 'kept', symbol })
  }

  return { roundTrips, dayFees: Array.from(dayFeeByKey.values()), skipped, warnings, trace }
}
