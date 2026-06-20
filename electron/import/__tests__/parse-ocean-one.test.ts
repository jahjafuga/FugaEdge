import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseOceanOneXls } from '../parse-ocean-one'

// Generic real-fixture invariants — NO identifying strings/values asserted
// (real account data: account number, symbols, $ amounts). Skipped automatically
// when the fixture isn't present (CI / fresh clone), mirroring the Webull desktop
// real-fixture test. The exact column/fee/structure confirmation lives in the
// throwaway scripts/probe-oo.cjs (not committed); this test asserts only
// broker-agnostic invariants that prove the parser is correct without embedding
// Dave's data.
const OCEAN_ONE_FIXTURE = resolve(
  __dirname,
  '../../../test-fixtures/dtsm-dave-ocean-one-trades-may-2026.xls',
)

describe('Ocean One .xls parser — real fixture, generic invariants only', () => {
  if (!existsSync(OCEAN_ONE_FIXTURE)) {
    it.skip('skipped: fixture not present', () => {})
    return
  }

  const buffer = readFileSync(OCEAN_ONE_FIXTURE)

  it('parses exactly 135 round-trips (date-headers, column-headers, Equities subtotals, blanks all skipped)', () => {
    const r = parseOceanOneXls(buffer, 'ocean-one.xls')
    expect(r.roundTrips).toHaveLength(135)
    // No non-trade row leaked through as a "symbol".
    for (const t of r.roundTrips) {
      expect(t.symbol.toUpperCase()).not.toBe('EQUITIES')
      expect(t.symbol.toUpperCase()).not.toBe('OPENED')
      expect(t.symbol).toMatch(/^[A-Z][A-Z.]*$/)
    }
  })

  it('every round-trip is a balanced, closed trip with positive prices/qty', () => {
    const r = parseOceanOneXls(buffer)
    for (const t of r.roundTrips) {
      expect(t.is_open).toBe(false)
      expect(t.shares_bought).toBe(t.shares_sold)
      expect(t.shares_bought).toBeGreaterThan(0)
      expect(t.avg_buy_price).toBeGreaterThan(0)
      expect(t.avg_sell_price).toBeGreaterThan(0)
      expect(['long', 'short']).toContain(t.side)
    }
  })

  it('net_pnl = gross_pnl - total_fees on every trip (fees + parenthesized-negative signs are coherent)', () => {
    const r = parseOceanOneXls(buffer)
    for (const t of r.roundTrips) {
      expect(t.net_pnl).toBeCloseTo(t.gross_pnl - t.total_fees, 2)
    }
  })

  it('commission is preserved as a distinct, non-negative number on every trip', () => {
    const r = parseOceanOneXls(buffer)
    for (const t of r.roundTrips) {
      expect(typeof t.commission).toBe('number')
      expect(t.commission as number).toBeGreaterThanOrEqual(0)
    }
    // Commission is actually parsed (every Ocean One trade carries a Comm),
    // not silently zero/undefined. NOTE: total_fees can go NEGATIVE on ECN-rebate
    // trades (a parenthesized Ecn Fee), so it is deliberately NOT asserted
    // positive — the sibling `net_pnl = gross_pnl - total_fees` test proves fee
    // coherence across rebates.
    expect(r.roundTrips.every((t) => (t.commission as number) > 0)).toBe(true)
  })

  it('parenthesized losses parse negative (at least one losing trip)', () => {
    const r = parseOceanOneXls(buffer)
    expect(r.roundTrips.some((t) => t.net_pnl < 0)).toBe(true)
  })

  it('every trip carries a 40-hex exec_hash + content_hash, and content_hashes are unique', () => {
    const r = parseOceanOneXls(buffer)
    const seen = new Set<string>()
    for (const t of r.roundTrips) {
      expect(t.exec_hash).toMatch(/^[0-9a-f]{40}$/)
      expect(t.content_hash).toMatch(/^[0-9a-f]{40}$/)
      seen.add(t.content_hash)
    }
    expect(seen.size).toBe(r.roundTrips.length)
  })

  it('tags source_broker=OceanOne and fees_reported=true on every trip', () => {
    const r = parseOceanOneXls(buffer)
    for (const t of r.roundTrips) {
      expect(t.source_broker).toBe('OceanOne')
      expect(t.fees_reported).toBe(true)
    }
  })

  it('times are UTC (Z suffix), open before close, with an ISO Eastern trading day', () => {
    const r = parseOceanOneXls(buffer)
    for (const t of r.roundTrips) {
      expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(t.open_time).toMatch(/Z$/)
      expect(t.close_time).toMatch(/Z$/)
      expect(t.open_time < (t.close_time as string)).toBe(true)
    }
  })

  it('re-parsing the same file yields identical content_hashes (dedup-stable)', () => {
    const a = parseOceanOneXls(buffer)
    const b = parseOceanOneXls(buffer)
    expect(a.roundTrips.map((t) => t.content_hash)).toEqual(
      b.roundTrips.map((t) => t.content_hash),
    )
  })
})
