// v0.2.2 Commit B — FMP-backed float enrichment wrapper.
//
// The wrapper replaces the legacy Polygon-shares-outstanding flow with real
// tradable float from FMP. These tests pin the LOAD-BEARING HONESTY RULES
// that justify the rename:
//
//   1. market_data.float gets REAL FMP floatShares — NOT outstandingShares.
//      (The whole point of the fix. If this regresses, "Float" still lies.)
//   2. market_data.shares_outstanding gets the FMP outstandingShares — a
//      separate column for the issued count.
//   3. LABT-case (float null, outstanding populated) writes float = NULL.
//      The Float UI shows "Unavailable" — NO silent fallback to
//      shares_outstanding in the data layer. This was the original bug.
//   4. The orchestrator counts the LABT-case as missing (float === null).
//
// Mocking strategy: same pattern as refresh-batch-cancel.test.ts and
// enrich-float-fmp's siblings — mock the FMP service module, the settings
// repo, the market repo, and the trades backfill primitives. Each test
// observes the inputs to upsertMarketRow + backfill calls.

import { describe, expect, it, vi } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/services/fmp', () => ({
  verifyFmp: vi.fn(),
  fetchSharesFloat: vi.fn(),
}))

vi.mock('../../settings/repo', () => ({
  getSettings: () => ({
    values: { fmp_api_key: 'test-key', polygon_api_key: '' },
    db_path: '',
  }),
}))

const persistedRows: unknown[] = []
vi.mock('../../market/repo', () => ({
  getMarketRow: () => null, // simulate first-time fetch
  upsertMarketRow: (row: unknown) => {
    persistedRows.push(row)
  },
}))

const backfillFloatSharesCalls: string[][] = []
const backfillSharesOutstandingCalls: string[][] = []
vi.mock('../repo', () => ({
  backfillFloatShares: (symbols?: string[]) => {
    backfillFloatSharesCalls.push(symbols ?? [])
    return 0
  },
  backfillSharesOutstanding: (symbols?: string[]) => {
    backfillSharesOutstandingCalls.push(symbols ?? [])
    return 0
  },
}))

import { fetchSharesFloat } from '@/services/fmp'
import { enrichFloatForImportedSymbols } from '../enrich-float'

type Row = {
  symbol: string
  float: number | null
  shares_outstanding: number | null
  market_cap: number | null
  sector: string | null
}

function lastRow(): Row {
  return persistedRows[persistedRows.length - 1] as Row
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('enrichFloatForImportedSymbols — FMP-backed (Commit B)', () => {
  it('HONESTY RULE 1: market_data.float gets FMP floatShares, NOT outstandingShares', async () => {
    persistedRows.length = 0
    ;(fetchSharesFloat as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      floatShares: 132507,         // real float — CLIK-shaped
      outstandingShares: 632201,   // issued count — DIFFERENT number
      freeFloatPercent: 20.96,
    })

    const result = await enrichFloatForImportedSymbols(['CLIK'])

    expect(persistedRows).toHaveLength(1)
    const row = lastRow()
    // Load-bearing: the .float column receives the float, not the outstanding.
    expect(row.float).toBe(132507)
    expect(row.float).not.toBe(632201)
    expect(result.fetched).toBe(1)
    expect(result.missing).toBe(0)
    expect(result.errored).toBe(0)
  })

  it('HONESTY RULE 2: market_data.shares_outstanding gets FMP outstandingShares (preserved separately)', async () => {
    persistedRows.length = 0
    ;(fetchSharesFloat as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      floatShares: 132507,
      outstandingShares: 632201,
      freeFloatPercent: 20.96,
    })

    await enrichFloatForImportedSymbols(['CLIK'])

    expect(lastRow().shares_outstanding).toBe(632201)
    // Both columns populated, distinctly — the schema-21 promise made good.
    expect(lastRow().float).not.toBe(lastRow().shares_outstanding)
  })

  it('HONESTY RULE 3 (LABT case): float null, outstanding populated → row.float = NULL, NO silent fallback', async () => {
    persistedRows.length = 0
    ;(fetchSharesFloat as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      floatShares: null,           // FMP has no float data for this ticker
      outstandingShares: 4689177,  // BUT issued count IS known
      freeFloatPercent: null,
    })

    const result = await enrichFloatForImportedSymbols(['LABT'])

    const row = lastRow()
    // CRITICAL: float column stays null. NO silent fallback to outstanding.
    // This is the bug being fixed — if this regresses, "Float" lies again.
    expect(row.float).toBeNull()
    expect(row.float).not.toBe(4689177)
    expect(row.float).not.toBe(0)
    // But outstanding IS preserved in its own column.
    expect(row.shares_outstanding).toBe(4689177)
    // HONESTY RULE 4: orchestrator counts as missing (gated on float, not
    // on outstanding). The "Unavailable" UI cue is driven by this counter.
    expect(result.fetched).toBe(0)
    expect(result.missing).toBe(1)
    expect(result.errored).toBe(0)
  })

  it('does NOT fetch market_cap or sector from FMP — those passenger fields stay null on this phase', async () => {
    // Commit B scope decision (carried from Commit A): keep Polygon as the
    // market_cap + sector source. FMP shares-float endpoint doesn't return
    // them. The market refresh button (separate path) populates them — we
    // don't double-dip API spend here. So persistFloat writes null for both.
    persistedRows.length = 0
    ;(fetchSharesFloat as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      floatShares: 132507,
      outstandingShares: 632201,
      freeFloatPercent: 20.96,
    })

    await enrichFloatForImportedSymbols(['CLIK'])

    expect(lastRow().market_cap).toBeNull()
    expect(lastRow().sector).toBeNull()
  })

  it('skips fetch when fmp_api_key is missing — counts symbols as missing without an API call', async () => {
    persistedRows.length = 0
    backfillFloatSharesCalls.length = 0
    backfillSharesOutstandingCalls.length = 0
    // Reset the FMP mock's call history so the "not called" assertion is
    // scoped to THIS test, not residual calls from prior cases in the file.
    ;(fetchSharesFloat as unknown as ReturnType<typeof vi.fn>).mockClear()
    const mod = await import('../../settings/repo')
    const original = mod.getSettings
    // Temporarily override settings to empty FMP key.
    ;(mod as unknown as { getSettings: () => unknown }).getSettings = () => ({
      values: { fmp_api_key: '', polygon_api_key: '' },
      db_path: '',
    })

    try {
      const result = await enrichFloatForImportedSymbols(['CLIK'])
      expect(result.fetched).toBe(0)
      expect(result.missing).toBe(1)
      expect(result.errored).toBe(0)
      expect(persistedRows).toHaveLength(0)
      expect(fetchSharesFloat).not.toHaveBeenCalled()
    } finally {
      ;(mod as unknown as { getSettings: () => unknown }).getSettings = original
    }
  })

  it('triggers the trades backfills for both columns after persist (so newly-imported trades see the data)', async () => {
    persistedRows.length = 0
    backfillFloatSharesCalls.length = 0
    backfillSharesOutstandingCalls.length = 0
    ;(fetchSharesFloat as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      floatShares: 132507,
      outstandingShares: 632201,
      freeFloatPercent: 20.96,
    })

    await enrichFloatForImportedSymbols(['CLIK'])

    // Each backfill receives the symbol list — the row's data propagates
    // to trades.float_shares + trades.shares_outstanding via the existing
    // backfill primitives.
    expect(backfillFloatSharesCalls).toEqual([['CLIK']])
    expect(backfillSharesOutstandingCalls).toEqual([['CLIK']])
  })
})
