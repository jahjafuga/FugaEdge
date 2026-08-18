import { describe, expect, it } from 'vitest'
import { applyRanges, isRangeActive, matchesRange } from '../numericRange'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rows = [
  { id: 1, r: -1 }, { id: 2, r: 0 }, { id: 3, r: 1.5 },
  { id: 4, r: 3 }, { id: 5, r: null },
]
const pick = (ranges: Record<string, { min?: number | null; max?: number | null }>) =>
  applyRanges(rows, ranges, (row) => row.r).map((x) => x.id)

describe('numeric range filter — one idiom', () => {
  it('T13 min only, max only, and both together', () => {
    expect(pick({ r: { min: 1 } })).toEqual([3, 4])
    expect(pick({ r: { max: 0 } })).toEqual([1, 2])
    expect(pick({ r: { min: 0, max: 1.5 } })).toEqual([2, 3])
  })

  it('T13b both bounds are INCLUSIVE', () => {
    expect(pick({ r: { min: 1.5, max: 3 } })).toEqual([3, 4])
  })

  it('T14 min > max yields empty and does NOT throw', () => {
    expect(() => pick({ r: { min: 5, max: 1 } })).not.toThrow()
    expect(pick({ r: { min: 5, max: 1 } })).toEqual([])
  })

  it('T15 a NULL is EXCLUDED by an active range and INCLUDED when none is set', () => {
    // Excluded: an unmeasured value cannot honestly satisfy "between 1 and 2".
    expect(pick({ r: { min: 1 } })).not.toContain(5)
    expect(pick({ r: { max: 100 } })).not.toContain(5)
    // Included: a dormant filter must not silently drop unmeasured rows.
    expect(pick({})).toContain(5)
    expect(pick({ r: {} })).toContain(5)
    expect(pick({ r: { min: null, max: null } })).toContain(5)
    // And a null is NOT a zero: a range spanning zero still excludes it.
    expect(pick({ r: { min: -10, max: 10 } })).not.toContain(5)
    expect(pick({ r: { min: -10, max: 10 } })).toContain(2) // the real zero stays
  })

  it('T17 clearing a range restores the full set', () => {
    expect(pick({ r: { min: 2 } })).toEqual([4])
    expect(pick({ r: { min: null } })).toEqual([1, 2, 3, 4, 5])
  })

  it('T18 STAND-DOWN: no ranges set returns everything, order preserved', () => {
    expect(pick({})).toEqual([1, 2, 3, 4, 5])
  })

  it('ranges across columns AND together', () => {
    const two = [
      { id: 1, a: 5, b: 5 }, { id: 2, a: 5, b: 50 }, { id: 3, a: 50, b: 50 },
    ]
    const out = applyRanges(two, { a: { max: 10 }, b: { max: 10 } },
      (row, col) => (col === 'a' ? row.a : row.b))
    expect(out.map((x) => x.id)).toEqual([1])
  })

  it('non-finite bounds are treated as unset, never as a comparison', () => {
    expect(isRangeActive({ min: Number.NaN })).toBe(false)
    expect(matchesRange(null, { min: Number.NaN })).toBe(true)
  })

  it('T19 ONE idiom: no column defines its own range comparison', () => {
    const table = readFileSync(
      resolve(process.cwd(), 'src/components/trades/TradesTable.tsx'), 'utf8')
    expect(table).not.toMatch(/\.min\b.*<=|>=.*\.max\b/)
    const filter = readFileSync(
      resolve(process.cwd(), 'src/core/trades/tradesFilter.ts'), 'utf8')
    // the trades filter reaches for the shared helper rather than rolling its own
    expect(filter).toMatch(/matchesRange|applyRanges/)
  })
})

// T16 — composition with the EXISTING filters, through the real entry point.
import { applyTradesFilters, emptyFilters } from '../tradesFilter'
import { makeTrade } from '@/test/fixtures/trade'

describe('ranges compose with the existing filters', () => {
  const book = [
    makeTrade({ id: 1, symbol: 'VEEE', net_pnl: 100 }),
    makeTrade({ id: 2, symbol: 'VEEE', net_pnl: -50 }),
    makeTrade({ id: 3, symbol: 'AAPL', net_pnl: 100 }),
  ]
  it('T16 a symbol filter AND a range together', () => {
    const f = { ...emptyFilters(), symbol: 'VEEE', ranges: { net_pnl: { min: 0 } } }
    expect(applyTradesFilters(book, f).map((t) => t.id)).toEqual([1])
  })
  it('T18 STAND-DOWN: with no ranges the result is identical to today', () => {
    const before = applyTradesFilters(book, emptyFilters()).map((t) => t.id)
    expect(before).toEqual([1, 2, 3])
  })
})
