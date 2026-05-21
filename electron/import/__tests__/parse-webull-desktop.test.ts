import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import ExcelJS from 'exceljs'
import {
  parseWebullDesktopXlsx,
  normalizeWebullDesktopSide,
  utcIsoToBareEastern,
} from '../parse-webull-desktop'
import { formatEastern } from '@/lib/format'

// All 19 columns of the Webull Desktop XLSX, in the same order the
// audit observed in the real fixture. Used by makeXlsx() to assemble
// synthetic test workbooks with the exact column shape the parser
// validates.
const HEADERS = [
  'User ID',
  'Symbol',
  'Name',
  'Ticker Type',
  'Side',
  'Total Qty',
  'Filled Qty',
  'Stop Price',
  'Limit Price',
  'Average Price',
  'Order Type',
  'Time In Force',
  'Trading Allowed Time Period',
  'Placed Time',
  'Filled Time',
  'Execute Status',
  'Filled Price',
  'Filled Amount',
  'Create Time',
] as const

type RowOverrides = Partial<Record<(typeof HEADERS)[number], unknown>>

function baseRow(overrides: RowOverrides = {}): Record<string, unknown> {
  return {
    'User ID': '100000000',
    'Symbol': 'ACME',
    'Name': 'Acme Corp',
    'Ticker Type': 'EQUITY',
    'Side': 'BUY',
    'Total Qty': 100,
    'Filled Qty': 100,
    'Stop Price': null,
    'Limit Price': '10.00',
    'Average Price': '10.00',
    'Order Type': 'LMT',
    'Time In Force': 'DAY',
    'Trading Allowed Time Period': 'Support for overall board',
    'Placed Time': '2026-05-14T10:37:03.153+0000',
    'Filled Time': '2026-05-14T10:37:03.153+0000',
    'Execute Status': 'FILLED',
    'Filled Price': '10.00',
    'Filled Amount': '1000.00',
    'Create Time': '2026-05-14T10:37:03.153+0000',
    ...overrides,
  }
}

async function makeXlsx(
  rows: Record<string, unknown>[],
  options: { sheetName?: string; headers?: readonly string[] } = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(options.sheetName ?? 'Order')
  const headers = options.headers ?? HEADERS
  ws.addRow(headers as string[])
  for (const r of rows) {
    ws.addRow(headers.map((h) => r[h] ?? null))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await wb.xlsx.writeBuffer()) as any as Buffer
}

describe('parseWebullDesktopXlsx — happy path', () => {
  it('parses each row into an Execution', async () => {
    const buf = await makeXlsx([
      baseRow({ Side: 'BUY', 'Filled Qty': 100, 'Filled Price': '10.00' }),
      baseRow({ Side: 'SELL', 'Filled Qty': 50, 'Filled Price': '10.50' }),
    ])
    const r = await parseWebullDesktopXlsx(buf, 'webull-desktop.xlsx')
    expect(r.skipped).toBe(0)
    expect(r.executions).toHaveLength(2)
    expect(r.executions[0].symbol).toBe('ACME')
    expect(r.executions[0].side).toBe('B')
    expect(r.executions[0].qty).toBe(100)
    expect(r.executions[0].price).toBe(10)
    // Source Filled Time is 10:37:03 UTC — stored as true UTC. `date` is the
    // Eastern trading day (06:37:03 ET — same calendar day for this fixture).
    expect(r.executions[0].time).toBe('2026-05-14T10:37:03Z')
    expect(r.executions[0].date).toBe('2026-05-14')
  })

  it('marks source_broker=Webull and source_format=xlsx', async () => {
    const buf = await makeXlsx([baseRow()])
    const r = await parseWebullDesktopXlsx(buf, 'webull-desktop.xlsx')
    for (const e of r.executions) {
      expect(e.source_broker).toBe('Webull')
      expect(e.source_format).toBe('xlsx')
    }
  })

  it('propagates source_file when filename is passed', async () => {
    const buf = await makeXlsx([baseRow()])
    const r = await parseWebullDesktopXlsx(buf, 'webull-desktop.xlsx')
    for (const e of r.executions) {
      expect(e.source_file).toBe('webull-desktop.xlsx')
    }
  })

  it('synthesizes wbd-prefixed IDs in the expected shape', async () => {
    const buf = await makeXlsx([baseRow()])
    const r = await parseWebullDesktopXlsx(buf, 'webull-desktop.xlsx')
    for (const e of r.executions) {
      expect(e.trade_id).toMatch(/^wbd-[0-9a-f]{12}$/)
      // No source order ID → trade_id and order_id collapse.
      expect(e.order_id).toBe(e.trade_id)
    }
  })

  it('does not set is_paper at the parser level (Track C UI overlays it)', async () => {
    const buf = await makeXlsx([baseRow()])
    const r = await parseWebullDesktopXlsx(buf)
    for (const e of r.executions) {
      expect(e.is_paper).toBeUndefined()
    }
  })

  it('is_short defaults to false (shorts inferred by buildRoundTrips)', async () => {
    const buf = await makeXlsx([baseRow({ Side: 'SELL' })])
    const r = await parseWebullDesktopXlsx(buf)
    for (const e of r.executions) {
      expect(e.is_short).toBe(false)
    }
  })

  it('coerces numeric Filled Qty cells (XLSX integer cells come through as JS numbers)', async () => {
    // baseRow() uses 100 as a JS number — confirms num() handles that path.
    const buf = await makeXlsx([baseRow({ 'Filled Qty': 250 })])
    const r = await parseWebullDesktopXlsx(buf)
    expect(r.executions[0].qty).toBe(250)
  })
})

describe('parseWebullDesktopXlsx — structural failures (throw, not skip)', () => {
  it('throws when the sheet name does not match', async () => {
    const buf = await makeXlsx([baseRow()], { sheetName: 'Trades' })
    await expect(parseWebullDesktopXlsx(buf)).rejects.toThrow(
      /expected a sheet named "Order".*found.*Trades/,
    )
  })

  it('throws when a required column is missing', async () => {
    // Drop "Filled Price" from the headers; parser should reject the
    // structurally-invalid file rather than try to parse it row-by-row.
    const reducedHeaders = HEADERS.filter((h) => h !== 'Filled Price')
    const buf = await makeXlsx([baseRow()], { headers: reducedHeaders })
    await expect(parseWebullDesktopXlsx(buf)).rejects.toThrow(
      /missing required column "Filled Price"/,
    )
  })

  it('throws on an empty buffer', async () => {
    await expect(parseWebullDesktopXlsx(Buffer.alloc(0))).rejects.toThrow()
  })

  it('throws on a non-XLSX buffer (plain text)', async () => {
    await expect(
      parseWebullDesktopXlsx(Buffer.from('not an xlsx file', 'utf8')),
    ).rejects.toThrow()
  })
})

describe('parseWebullDesktopXlsx — row-level skips (trace, not throw)', () => {
  it('skips rows with empty Symbol', async () => {
    const buf = await makeXlsx([baseRow({ Symbol: '' })])
    const r = await parseWebullDesktopXlsx(buf)
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(r.trace[0]).toMatchObject({ outcome: 'skipped', reason: 'empty-symbol' })
  })

  it('skips rows whose Execute Status is not FILLED', async () => {
    const buf = await makeXlsx([
      baseRow({ 'Execute Status': 'CANCELLED' }),
      baseRow({ 'Execute Status': 'PARTIAL_FILLED' }),
    ])
    const r = await parseWebullDesktopXlsx(buf)
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(2)
    expect(r.trace.every((t) => t.outcome === 'skipped' && t.reason?.startsWith('status:'))).toBe(
      true,
    )
  })

  it('skips rows with an invalid Side value', async () => {
    const buf = await makeXlsx([baseRow({ Side: 'HOLD' })])
    const r = await parseWebullDesktopXlsx(buf)
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(r.trace[0].reason).toMatch(/^bad-side:/)
  })

  it('skips rows with zero qty', async () => {
    const buf = await makeXlsx([baseRow({ 'Filled Qty': 0 })])
    const r = await parseWebullDesktopXlsx(buf)
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(r.trace[0].reason).toBe('zero-qty')
  })

  it('skips rows with zero price', async () => {
    const buf = await makeXlsx([baseRow({ 'Filled Price': '0' })])
    const r = await parseWebullDesktopXlsx(buf)
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(r.trace[0].reason).toBe('zero-price')
  })

  it('skips rows with an unparseable Filled Time', async () => {
    const buf = await makeXlsx([baseRow({ 'Filled Time': 'not-a-time' })])
    const r = await parseWebullDesktopXlsx(buf)
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(r.trace[0].reason).toMatch(/^bad-time:/)
  })
})

describe('parseWebullDesktopXlsx — synthetic ID stability', () => {
  it('same row tuple → same ID across re-parses', async () => {
    const buf1 = await makeXlsx([baseRow()])
    const buf2 = await makeXlsx([baseRow()])
    const a = await parseWebullDesktopXlsx(buf1)
    const b = await parseWebullDesktopXlsx(buf2)
    expect(a.executions[0].trade_id).toBe(b.executions[0].trade_id)
  })

  it('changing the qty produces a different ID', async () => {
    const a = await parseWebullDesktopXlsx(await makeXlsx([baseRow()]))
    const b = await parseWebullDesktopXlsx(await makeXlsx([baseRow({ 'Filled Qty': 99 })]))
    expect(a.executions[0].trade_id).not.toBe(b.executions[0].trade_id)
  })

  it('changing the price produces a different ID', async () => {
    const a = await parseWebullDesktopXlsx(await makeXlsx([baseRow()]))
    const b = await parseWebullDesktopXlsx(
      await makeXlsx([baseRow({ 'Filled Price': '10.01' })]),
    )
    expect(a.executions[0].trade_id).not.toBe(b.executions[0].trade_id)
  })

  it('changing the time produces a different ID', async () => {
    const a = await parseWebullDesktopXlsx(await makeXlsx([baseRow()]))
    const b = await parseWebullDesktopXlsx(
      await makeXlsx([baseRow({ 'Filled Time': '2026-05-14T10:37:04.153+0000' })]),
    )
    expect(a.executions[0].trade_id).not.toBe(b.executions[0].trade_id)
  })
})

describe('normalizeWebullDesktopSide', () => {
  it('maps BUY → B', () => {
    expect(normalizeWebullDesktopSide('BUY')).toBe('B')
  })

  it('maps SELL → S', () => {
    expect(normalizeWebullDesktopSide('SELL')).toBe('S')
  })

  it('is case-insensitive after trim', () => {
    expect(normalizeWebullDesktopSide('  buy  ')).toBe('B')
    expect(normalizeWebullDesktopSide('Sell')).toBe('S')
  })

  it('rejects DAS-style raw codes (B / S) — those are NOT a Webull side', () => {
    expect(normalizeWebullDesktopSide('B')).toBeNull()
    expect(normalizeWebullDesktopSide('S')).toBeNull()
  })

  it('returns null on garbage and null input', () => {
    expect(normalizeWebullDesktopSide('HOLD')).toBeNull()
    expect(normalizeWebullDesktopSide('')).toBeNull()
    expect(normalizeWebullDesktopSide(null)).toBeNull()
    expect(normalizeWebullDesktopSide(undefined)).toBeNull()
  })
})

describe('utcIsoToBareEastern', () => {
  it('converts a summer UTC timestamp to EDT (UTC-4)', () => {
    // 2026-05-14 is inside DST (DST starts March 8, ends Nov 1).
    const r = utcIsoToBareEastern('2026-05-14T10:37:03.153+0000')
    expect(r).toEqual({
      date: '2026-05-14',
      time: '2026-05-14T06:37:03',
    })
  })

  it('converts a winter UTC timestamp to EST (UTC-5)', () => {
    const r = utcIsoToBareEastern('2026-12-15T14:30:00.000+0000')
    expect(r).toEqual({
      date: '2026-12-15',
      time: '2026-12-15T09:30:00',
    })
  })

  it('handles the EDT → EST DST transition (Nov 1 2026, 2am local)', () => {
    // 2026-11-01T05:30:00Z is 01:30 EDT (still summer, UTC-4).
    const beforeFallback = utcIsoToBareEastern('2026-11-01T05:30:00.000+0000')
    expect(beforeFallback?.time).toBe('2026-11-01T01:30:00')
    // 2026-11-01T07:30:00Z is 02:30 EST (winter, UTC-5).
    const afterFallback = utcIsoToBareEastern('2026-11-01T07:30:00.000+0000')
    expect(afterFallback?.time).toBe('2026-11-01T02:30:00')
  })

  it('normalizes a midnight result so the hour is "00", never "24"', () => {
    // 2026-05-14T04:00:00Z is midnight EDT. Older Node Intl
    // implementations emit "24:00:00" for this; the parser must return
    // "00:00:00" regardless of platform behavior.
    const r = utcIsoToBareEastern('2026-05-14T04:00:00.000+0000')
    expect(r?.time).toBe('2026-05-14T00:00:00')
    expect(r?.time.includes('T24:')).toBe(false)
  })

  it('returns null on a malformed UTC string', () => {
    expect(utcIsoToBareEastern('not-a-timestamp')).toBeNull()
    expect(utcIsoToBareEastern('')).toBeNull()
  })

  it('accepts the trailing Z form as well as +0000', () => {
    const r = utcIsoToBareEastern('2026-05-14T10:37:03.153Z')
    expect(r).toEqual({
      date: '2026-05-14',
      time: '2026-05-14T06:37:03',
    })
  })
})

// Generic real-fixture invariants — NO identifying strings asserted.
// Skipped automatically when the fixture isn't present (CI / fresh clone).
const WEBULL_DESKTOP_FIXTURE = resolve(
  __dirname,
  '../../../test-fixtures/webull-desktop-paper-2026-05-14.xlsx',
)

describe('Webull desktop real fixture — generic invariants only', () => {
  if (!existsSync(WEBULL_DESKTOP_FIXTURE)) {
    it.skip('skipped: fixture not present', () => {})
    return
  }

  // Read once, parse once, then assert invariants. Saves the test suite
  // a dozen redundant XLSX-decompression passes.
  const buffer = readFileSync(WEBULL_DESKTOP_FIXTURE)

  it('parses all 12 rows as executions with zero skipped', async () => {
    const r = await parseWebullDesktopXlsx(buffer, 'webull-desktop-paper-2026-05-14.xlsx')
    expect(r.executions).toHaveLength(12)
    expect(r.skipped).toBe(0)
  })

  it('every row tags source_broker=Webull and source_format=xlsx', async () => {
    const r = await parseWebullDesktopXlsx(buffer)
    for (const e of r.executions) {
      expect(e.source_broker).toBe('Webull')
      expect(e.source_format).toBe('xlsx')
    }
  })

  it('every side is B or S', async () => {
    const r = await parseWebullDesktopXlsx(buffer)
    for (const e of r.executions) {
      expect(['B', 'S']).toContain(e.side)
    }
  })

  it('every qty and price is strictly positive', async () => {
    const r = await parseWebullDesktopXlsx(buffer)
    for (const e of r.executions) {
      expect(e.qty).toBeGreaterThan(0)
      expect(e.price).toBeGreaterThan(0)
    }
  })

  it('every synthetic ID matches /^wbd-[0-9a-f]{12}$/ and is unique', async () => {
    const r = await parseWebullDesktopXlsx(buffer)
    const ids = new Set<string>()
    for (const e of r.executions) {
      expect(e.trade_id).toMatch(/^wbd-[0-9a-f]{12}$/)
      expect(e.order_id).toBe(e.trade_id)
      ids.add(e.trade_id)
    }
    expect(ids.size).toBe(r.executions.length)
  })

  it('every timestamp is stored as true UTC whose Eastern day matches `date`', async () => {
    const r = await parseWebullDesktopXlsx(buffer)
    for (const e of r.executions) {
      // Day 8.5 Commit B — Execution.time is true UTC (ISO 8601, Z suffix).
      expect(e.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // `date` is the Eastern trading day. The naive time.slice(0,10) === date
      // invariant no longer holds — UTC and Eastern calendar days can differ
      // (an after-hours fill rolls into the next UTC day). The real invariant:
      // the Eastern calendar day of the UTC time reproduces `date`.
      expect(formatEastern(e.time, { withDate: true }).slice(0, 10)).toBe(e.date)
    }
  })

  it('all timestamps fall on 2026-05-14 in Eastern wall-clock', async () => {
    const r = await parseWebullDesktopXlsx(buffer)
    for (const e of r.executions) {
      expect(e.date).toBe('2026-05-14')
    }
  })

  it('is_paper is unset on every parsed row (parser-level invariant)', async () => {
    const r = await parseWebullDesktopXlsx(buffer)
    for (const e of r.executions) {
      expect(e.is_paper).toBeUndefined()
    }
  })
})
