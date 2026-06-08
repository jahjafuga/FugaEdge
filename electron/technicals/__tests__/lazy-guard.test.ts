import { describe, it, expect } from 'vitest'
import { isTechnicalsCurrent, toTradeForTechnicals } from '../lazy-guard'
import { TECHNICALS_SCHEMA_VERSION } from '@/core/technicals/computeTradeTechnicals'

// NOTE: the DB-touching functions (getTradesForSymbolDate,
// runLazyGuardForPayload) are exercised via integration when Session 4's
// Technical Analysis tab lands — vitest can't load better-sqlite3 natively.

describe('lazy-guard — pure helpers', () => {
  it('(1) isTechnicalsCurrent: null existing → false', () => {
    expect(isTechnicalsCurrent(null)).toBe(false)
  })

  it('(2) isTechnicalsCurrent: data_complete false → false', () => {
    expect(
      isTechnicalsCurrent({ data_complete: false, schema_version: TECHNICALS_SCHEMA_VERSION }),
    ).toBe(false)
  })

  it('(3) isTechnicalsCurrent: stale schema_version → false', () => {
    expect(
      isTechnicalsCurrent({ data_complete: true, schema_version: TECHNICALS_SCHEMA_VERSION - 1 }),
    ).toBe(false)
  })

  it('(4) isTechnicalsCurrent: complete + current schema_version → true', () => {
    expect(
      isTechnicalsCurrent({ data_complete: true, schema_version: TECHNICALS_SCHEMA_VERSION }),
    ).toBe(true)
  })

  it('(5) isTechnicalsCurrent: future schema_version (>=, not ==) → true', () => {
    expect(
      isTechnicalsCurrent({ data_complete: true, schema_version: TECHNICALS_SCHEMA_VERSION + 1 }),
    ).toBe(true)
  })

  it('(6) toTradeForTechnicals: valid executions_json → parsed array + side passthrough', () => {
    const row = {
      id: 1,
      side: 'long' as const,
      executions_json:
        '[{"side":"B","qty":100,"price":10.5,"time":"2026-07-15T13:30:00Z"}]',
    }
    expect(toTradeForTechnicals(row)).toEqual({
      side: 'long',
      executions: [{ side: 'B', qty: 100, price: 10.5, time: '2026-07-15T13:30:00Z' }],
    })
  })

  it('(7) toTradeForTechnicals: null executions_json → empty executions', () => {
    const row = { id: 2, side: 'short' as const, executions_json: null }
    expect(toTradeForTechnicals(row)).toEqual({ side: 'short', executions: [] })
  })

  it('(8) toTradeForTechnicals: malformed JSON → empty executions (no throw)', () => {
    const row = { id: 3, side: 'long' as const, executions_json: 'not json{' }
    expect(toTradeForTechnicals(row)).toEqual({ side: 'long', executions: [] })
  })
})
