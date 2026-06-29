import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseTradeZeroSummaryCsv } from '../parse-tradezero-summary'
import { detectFormat } from '../detect-format'

// Synthetic CSV — generic tickers, no PII. ACME = a winning day, ZZZZ = losing.
// Bought/Sold Value columns are exact (shares x avg) so the reconciliation is
// exact for the inline rows; the real fixture's avgs are rounded so its
// reconciliation reads the file's own Value columns (see fileValues()).
const SAMPLE_HEADER =
  'Trade Type,Symbol,Start of Day Position,Previous Day Close,End of Day Position,Start of Day Value,Bought Shares,Bought Average Price,Bought Value,Sold Shares,Sold Average Price,Sold Value,End of Day Closing Price,End of Day Value,Fees,Day Profit & Loss'

const SAMPLE = [
  SAMPLE_HEADER,
  'E,ACME,0,9.50,0,0,100,10.00,1000.00,100,12.00,1200.00,11.50,0,2.00,198.00',
  'E,ZZZZ,0,5.20,0,0,200,5.00,1000.00,200,4.50,900.00,4.80,0,1.00,-101.00',
].join('\n')

// June → EDT (UTC-4); 09:30 ET anchor → 13:30:00 UTC.
const DATE = '2026-06-15'

// Pull the file's own Bought/Sold Value columns for the reconciliation, so a
// rounded avg price doesn't introduce error.
function fileValues(csv: string): { boughtValue: number; soldValue: number }[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const c = line.split(',')
      return { boughtValue: Number(c[8]), soldValue: Number(c[11]) }
    })
}

describe('parseTradeZeroSummaryCsv — happy path', () => {
  it('builds one round-trip per data row', () => {
    const r = parseTradeZeroSummaryCsv(SAMPLE, DATE)
    expect(r.skipped).toBe(0)
    expect(r.roundTrips).toHaveLength(2)
    expect(r.roundTrips.map((t) => t.symbol)).toEqual(['ACME', 'ZZZZ'])
  })

  it('maps bought/sold/fee/P&L columns onto the RoundTrip', () => {
    const t = parseTradeZeroSummaryCsv(SAMPLE, DATE).roundTrips[0]
    expect(t.shares_bought).toBe(100)
    expect(t.avg_buy_price).toBeCloseTo(10, 4)
    expect(t.shares_sold).toBe(100)
    expect(t.avg_sell_price).toBeCloseTo(12, 4)
    expect(t.total_fees).toBeCloseTo(2, 2)
    expect(t.net_pnl).toBeCloseTo(198, 2) // = Day Profit & Loss
    expect(t.gross_pnl).toBeCloseTo(200, 2) // = net_pnl + total_fees
  })

  it('reconciles (Sold Value - Bought Value) ~ net_pnl + total_fees per row', () => {
    const trips = parseTradeZeroSummaryCsv(SAMPLE, DATE).roundTrips
    const vals = fileValues(SAMPLE)
    trips.forEach((t, i) => {
      expect(vals[i].soldValue - vals[i].boughtValue).toBeCloseTo(t.net_pnl + t.total_fees, 2)
      expect(t.gross_pnl).toBeCloseTo(t.net_pnl + t.total_fees, 2)
    })
  })

  it('carries a losing day as negative net/gross', () => {
    const z = parseTradeZeroSummaryCsv(SAMPLE, DATE).roundTrips[1]
    expect(z.symbol).toBe('ZZZZ')
    expect(z.net_pnl).toBeCloseTo(-101, 2)
    expect(z.gross_pnl).toBeCloseTo(-100, 2)
  })

  it('tags broker/format and the trip flags', () => {
    for (const t of parseTradeZeroSummaryCsv(SAMPLE, DATE, 'tz-summary.csv').roundTrips) {
      expect(t.source_broker).toBe('TradeZero')
      expect(t.source_format).toBe('summary')
      expect(t.source_file).toBe('tz-summary.csv')
      expect(t.is_open).toBe(false)
      expect(t.fees_reported).toBe(true)
      // Documented default — summary rows carry no direction signal.
      expect(t.side).toBe('long')
    }
  })

  it('applies the supplied date with a 0s hold (open_time === close_time)', () => {
    const t = parseTradeZeroSummaryCsv(SAMPLE, DATE).roundTrips[0]
    expect(t.date).toBe(DATE)
    expect(t.open_time).toBe('2026-06-15T13:30:00Z') // 09:30 ET → 13:30 UTC (EDT)
    expect(t.close_time).toBe(t.open_time) // honest "no real time data" signal
  })

  it('synthesizes tzs-prefixed fill IDs; hash is stable per date and date-sensitive', () => {
    const t = parseTradeZeroSummaryCsv(SAMPLE, DATE).roundTrips[0]
    expect(t.executions).toHaveLength(2)
    for (const e of t.executions) expect(e.trade_id).toMatch(/^tzs-[0-9a-f]{12}$/)
    const again = parseTradeZeroSummaryCsv(SAMPLE, DATE).roundTrips[0]
    expect(again.exec_hash).toBe(t.exec_hash)
    const other = parseTradeZeroSummaryCsv(SAMPLE, '2026-06-16').roundTrips[0]
    expect(other.exec_hash).not.toBe(t.exec_hash) // date is baked into the hash
  })
})

describe('parseTradeZeroSummaryCsv — empty / header-only', () => {
  it('returns no trips for a header-only file', () => {
    expect(parseTradeZeroSummaryCsv(SAMPLE_HEADER, DATE).roundTrips).toHaveLength(0)
  })
  it('returns no trips for an empty string (no throw)', () => {
    expect(parseTradeZeroSummaryCsv('', DATE).roundTrips).toHaveLength(0)
  })
})

describe('detectFormat routing — tradezero_summary', () => {
  it('routes the summary header to "tradezero_summary"', () => {
    expect(detectFormat(SAMPLE)).toBe('tradezero_summary')
  })

  it('does not collide with the other formats', () => {
    // File-1 TradeZero execution (Account-led)
    expect(
      detectFormat(
        'Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time\nACCT,06/15/2026,06/16/2026,USD,2,B,ACME,1,1,09:30:00',
      ),
    ).toBe('tradezero')
    // DAS daily-summary (Symbol-led)
    expect(detectFormat('Symbol,ECN,FINRA,HTB\nXYZ,1,0.1,0.5')).toBe('daily-summary')
  })

  it('returns "unknown" for a Trade-Type-led header missing the summary markers', () => {
    // Trade Type + Symbol but no "Day Profit & Loss" / "Bought Average Price".
    expect(detectFormat('Trade Type,Symbol,Qty\nE,ACME,100')).toBe('unknown')
  })
})

// Real sanitized fixture (gitignored, existsSync-guarded). Generic invariants
// only — no PII embedded. Skipped in CI / fresh clones.
const FIXTURE = resolve(__dirname, '../../../test-fixtures/tradezero-user-summary.csv')

describe('TradeZero summary real fixture — generic invariants only', () => {
  if (!existsSync(FIXTURE)) {
    it.skip('skipped: fixture not present', () => {})
    return
  }

  const csv = readFileSync(FIXTURE, 'utf8')
  const r = parseTradeZeroSummaryCsv(csv, '2026-06-15', 'tradezero-user-summary.csv')

  it('parses 3 round-trips (ASTC, SNYR, SPRC)', () => {
    expect(r.roundTrips).toHaveLength(3)
    expect(new Set(r.roundTrips.map((t) => t.symbol))).toEqual(
      new Set(['ASTC', 'SNYR', 'SPRC']),
    )
  })

  it('every trip is closed, balanced, positive, long, fees_reported, source-tagged', () => {
    for (const t of r.roundTrips) {
      expect(t.is_open).toBe(false)
      expect(t.shares_bought).toBe(t.shares_sold)
      expect(t.shares_bought).toBeGreaterThan(0)
      expect(t.avg_buy_price).toBeGreaterThan(0)
      expect(t.avg_sell_price).toBeGreaterThan(0)
      expect(t.side).toBe('long')
      expect(t.fees_reported).toBe(true)
      expect(t.source_broker).toBe('TradeZero')
      expect(t.source_format).toBe('summary')
      expect(t.date).toBe('2026-06-15')
      expect(t.open_time).toBe(t.close_time)
    }
  })

  it('reconciles (Sold Value - Bought Value) ~ net_pnl + total_fees on every trip', () => {
    const vals = fileValues(csv)
    // align by symbol order in the file
    r.roundTrips.forEach((t, i) => {
      expect(vals[i].soldValue - vals[i].boughtValue).toBeCloseTo(t.net_pnl + t.total_fees, 2)
    })
  })
})
