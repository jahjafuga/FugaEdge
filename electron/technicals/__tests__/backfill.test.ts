// Wiring test for the electron backfill wrapper. No real DB (better-sqlite3's
// native binary won't load under vitest), so mock the four repo/cache modules
// the wrapper wires into the pure runBackfillCore. The core + compute run for
// REAL — these tests verify the wrapper's wiring and the bumpDataVersion gate,
// not the orchestration (that's covered in runBackfillCore.test.ts).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TECHNICALS_SCHEMA_VERSION } from '@/core/technicals/computeTradeTechnicals'

const {
  getStaleTradeIds,
  upsertTradeTechnicals,
  getTradesByIdsForTechnicals,
  getIntradayRow,
  bumpDataVersion,
} = vi.hoisted(() => ({
  getStaleTradeIds: vi.fn(),
  upsertTradeTechnicals: vi.fn(),
  getTradesByIdsForTechnicals: vi.fn(),
  getIntradayRow: vi.fn(),
  bumpDataVersion: vi.fn(),
}))

vi.mock('../repo', () => ({ getStaleTradeIds, upsertTradeTechnicals }))
vi.mock('../../trades/list', () => ({ getTradesByIdsForTechnicals }))
vi.mock('../../market/repo', () => ({ getIntradayRow }))
vi.mock('../../lib/cache', () => ({ bumpDataVersion }))

import { runTradeTechnicalsBackfill } from '../backfill'

beforeEach(() => {
  vi.clearAllMocks()
  getStaleTradeIds.mockReturnValue([])
  getTradesByIdsForTechnicals.mockReturnValue([])
  getIntradayRow.mockReturnValue(null)
})

describe('runTradeTechnicalsBackfill', () => {
  // (a)
  it('passes TECHNICALS_SCHEMA_VERSION to getStaleTradeIds', async () => {
    getStaleTradeIds.mockReturnValue([])
    await runTradeTechnicalsBackfill()
    expect(getStaleTradeIds).toHaveBeenCalledWith(TECHNICALS_SCHEMA_VERSION)
  })

  // (b)
  it('wires hydrateTradeChunk to getTradesByIdsForTechnicals + parseExecutions', async () => {
    getStaleTradeIds.mockReturnValue([42])
    getTradesByIdsForTechnicals.mockReturnValue([
      {
        id: 42,
        symbol: 'AAA',
        date: '2026-06-01',
        side: 'long',
        executions_json:
          '[{"side":"B","qty":100,"price":50,"time":"2026-06-01T13:30:00Z"}]',
      },
    ])
    getIntradayRow.mockReturnValue(null)
    await runTradeTechnicalsBackfill()
    expect(getTradesByIdsForTechnicals).toHaveBeenCalledWith([42])
    expect(upsertTradeTechnicals).toHaveBeenCalledTimes(1)
    expect(upsertTradeTechnicals.mock.calls[0][0]).toBe(42)
  })

  // (c)
  it('wires loadBarsForKey to getIntradayRow with (symbol, date)', async () => {
    getStaleTradeIds.mockReturnValue([42])
    getTradesByIdsForTechnicals.mockReturnValue([
      { id: 42, symbol: 'AAA', date: '2026-06-01', side: 'long', executions_json: '[]' },
    ])
    getIntradayRow.mockReturnValue(null)
    await runTradeTechnicalsBackfill()
    expect(getIntradayRow).toHaveBeenCalledTimes(1)
    expect(getIntradayRow).toHaveBeenCalledWith('AAA', '2026-06-01')
  })

  // (d)
  it('wires persistTechnicals to upsertTradeTechnicals', async () => {
    getStaleTradeIds.mockReturnValue([42])
    getTradesByIdsForTechnicals.mockReturnValue([
      { id: 42, symbol: 'AAA', date: '2026-06-01', side: 'long', executions_json: '[]' },
    ])
    getIntradayRow.mockReturnValue(null)
    await runTradeTechnicalsBackfill()
    expect(upsertTradeTechnicals).toHaveBeenCalledTimes(1)
    const [id, technicals] = upsertTradeTechnicals.mock.calls[0]
    expect(id).toBe(42)
    expect(technicals).toMatchObject({
      tf_1m: expect.anything(),
      tf_5m: expect.anything(),
      data_complete: expect.any(Boolean),
      computed_at: expect.any(String),
      schema_version: expect.any(Number),
    })
  })

  // (e)
  it('calls bumpDataVersion when computed + placeholders > 0', async () => {
    getStaleTradeIds.mockReturnValue([42])
    getTradesByIdsForTechnicals.mockReturnValue([
      { id: 42, symbol: 'AAA', date: '2026-06-01', side: 'long', executions_json: '[]' },
    ])
    getIntradayRow.mockReturnValue(null)
    await runTradeTechnicalsBackfill()
    expect(bumpDataVersion).toHaveBeenCalledTimes(1)
  })

  // (f)
  it('does NOT call bumpDataVersion when all counts are zero', async () => {
    getStaleTradeIds.mockReturnValue([])
    await runTradeTechnicalsBackfill()
    expect(bumpDataVersion).not.toHaveBeenCalled()
  })

  // (g)
  it('yieldBetweenChunks resolves via setImmediate', async () => {
    // 60 ids → chunks of 50 → [50, 10] → 1 yield between the 2 chunks.
    getStaleTradeIds.mockReturnValue(Array.from({ length: 60 }, (_, i) => i + 1))
    getTradesByIdsForTechnicals.mockReturnValue([])
    const spy = vi.spyOn(global, 'setImmediate')
    await runTradeTechnicalsBackfill()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
