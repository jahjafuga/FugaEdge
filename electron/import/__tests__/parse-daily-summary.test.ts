import { describe, expect, it } from 'vitest'
import { parseDailySummaryCsv } from '../parse-daily-summary'

// DAS daily-summary CSV. Per decision B, this parser stays fee-only for
// v0.2.0 Day 1 — it does NOT synthesize Execution[] from Bought/Sold/Avg
// columns. These tests pin that contract.
const SAMPLE = [
  'Symbol,Trades,Bought Shares,B Avg Price,Sold Shares,S Avg Price,Net Share,Current Price,Day-trade P&L,OverNight Position,OverNight AvgCost,Yesterday Close,ECN,SEC,FINRA,HTB Fee,CAT Fee',
  'AAPL,1,100,150.00,100,151.00,0,150.50,100.00,0,0,150.00,0.30,0.02,0.05,0.00,0.01',
  'MSFT,2,200,300.00,200,302.00,0,301.00,400.00,0,0,300.00,0.50,0.04,0.07,0.10,0.02',
  'TOTALS,3,300,,300,,0,,500.00,0,,,0.80,0.06,0.12,0.10,0.03',
].join('\n')

describe('parseDailySummaryCsv', () => {
  it('returns one fee row per data symbol and skips the TOTALS row', () => {
    const result = parseDailySummaryCsv(SAMPLE)
    expect(result.rows).toHaveLength(2)
    expect(result.skipped).toBe(1)
    const symbols = result.rows.map((r) => r.symbol).sort()
    expect(symbols).toEqual(['AAPL', 'MSFT'])
  })

  it('extracts ECN/SEC/FINRA/HTB/CAT into separate fields and sums into total_fees', () => {
    const result = parseDailySummaryCsv(SAMPLE)
    const aapl = result.rows.find((r) => r.symbol === 'AAPL')!
    expect(aapl.fee_ecn).toBe(0.3)
    expect(aapl.fee_sec).toBe(0.02)
    expect(aapl.fee_finra).toBe(0.05)
    expect(aapl.fee_htb).toBe(0)
    expect(aapl.fee_cat).toBe(0.01)
    expect(aapl.total_fees).toBeCloseTo(0.38, 2)
  })

  it('uppercases the symbol column', () => {
    const csv = [
      'Symbol,ECN,SEC,FINRA,HTB Fee,CAT Fee',
      'aapl,0.10,0.01,0.02,0.00,0.00',
    ].join('\n')
    const result = parseDailySummaryCsv(csv)
    expect(result.rows[0].symbol).toBe('AAPL')
  })
})

// Day 3 of v0.2.0: ECN can be NEGATIVE (maker rebate when the trader adds
// liquidity). v0.1.6 stripped sign via Math.abs(), which destroyed the
// rebate before it ever reached the DB. These tests pin the new sign-
// preserving contract — rebates must survive parse and reduce total_fees.
describe('parseDailySummaryCsv — negative ECN rebates (sign-preserving)', () => {
  it('preserves the negative sign on an ECN rebate', () => {
    const csv = [
      'Symbol,ECN,SEC,FINRA,HTB Fee,CAT Fee',
      'AAPL,-0.50,0.02,0.05,0.00,0.01',
    ].join('\n')
    const result = parseDailySummaryCsv(csv)
    const aapl = result.rows[0]
    expect(aapl.fee_ecn).toBe(-0.5)
  })

  it('nets a negative ECN against positive components in total_fees', () => {
    // 0.02 + 0.05 + 0 + 0.01 = 0.08 of debits, minus 0.50 rebate = -0.42 net.
    // A negative total means the trader earned more from rebates than they
    // paid in fees — net_pnl downstream gets BOOSTED, not reduced.
    const csv = [
      'Symbol,ECN,SEC,FINRA,HTB Fee,CAT Fee',
      'AAPL,-0.50,0.02,0.05,0.00,0.01',
    ].join('\n')
    const result = parseDailySummaryCsv(csv)
    expect(result.rows[0].total_fees).toBeCloseTo(-0.42, 2)
  })

  it('preserves sign on parenthesized negatives like "(0.50)"', () => {
    // Some DAS exports represent negatives with accounting-style parentheses
    // instead of leading minus. num() already handles this; the test pins
    // that we don't accidentally undo it with another Math.abs() somewhere.
    const csv = [
      'Symbol,ECN,SEC,FINRA,HTB Fee,CAT Fee',
      'AAPL,(0.50),0.02,0.05,0.00,0.01',
    ].join('\n')
    const result = parseDailySummaryCsv(csv)
    expect(result.rows[0].fee_ecn).toBe(-0.5)
  })
})
