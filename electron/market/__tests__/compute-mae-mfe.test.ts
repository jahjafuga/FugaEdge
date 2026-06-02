import { describe, expect, it, vi } from 'vitest'

// v0.2.3 — the α=120s sub-resolution hold guard in computeMaeMfe. computeMaeMfe
// is pure, but '../intraday' transitively imports better-sqlite3 (via
// '../../db/database' and './repo'), whose native binary won't load under
// vitest. So we mock the db + settings modules — same approach the existing
// intraday-refresh-*.test.ts files use — then import the pure function.

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: () => ({ all: () => [], get: () => undefined, run: () => ({ changes: 0 }) }),
  }),
}))

vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { polygon_api_key: 'test-key' } }),
}))

import { computeMaeMfe } from '../intraday'
import type { IntradayBar } from '../massive'

const OPEN = '2026-05-01T14:00:00.000Z'
const entryMs = Date.parse(OPEN)

// Two 1-minute bars inside the window. Long entry 10.00 →
//   mae = entry - lowMin  = 10.00 - 9.50  = 0.50
//   mfe = highMax - entry = 10.50 - 10.00 = 0.50
function windowBars(): IntradayBar[] {
  return [
    { t: entryMs, o: 10, h: 10.5, l: 9.8, c: 10.1, v: 1000 },
    { t: entryMs + 60_000, o: 10, h: 10.3, l: 9.5, c: 9.9, v: 1000 },
  ]
}

function longTrade(closeTime: string | null) {
  return {
    side: 'long' as const,
    avg_buy_price: 10,
    avg_sell_price: 0,
    open_time: OPEN,
    close_time: closeTime,
  }
}

describe('computeMaeMfe — sub-resolution hold guard (v0.2.3, α = 120s)', () => {
  it('hold = 119999ms returns null/null (below threshold)', () => {
    // close = entry + 119999ms
    const r = computeMaeMfe(longTrade('2026-05-01T14:01:59.999Z'), windowBars())
    expect(r).toEqual({ mae: null, mfe: null })
  })

  it('hold = 120000ms computes (exact threshold is allowed)', () => {
    // close = entry + 120000ms
    const r = computeMaeMfe(longTrade('2026-05-01T14:02:00.000Z'), windowBars())
    expect(r.mae).toBeCloseTo(0.5, 5)
    expect(r.mfe).toBeCloseTo(0.5, 5)
  })

  it('boundary ±1ms: 119999 → null, 120000 → computes, 120001 → computes', () => {
    expect(computeMaeMfe(longTrade('2026-05-01T14:01:59.999Z'), windowBars())).toEqual({
      mae: null,
      mfe: null,
    })
    expect(computeMaeMfe(longTrade('2026-05-01T14:02:00.000Z'), windowBars()).mae).not.toBeNull()
    expect(computeMaeMfe(longTrade('2026-05-01T14:02:00.001Z'), windowBars()).mae).not.toBeNull()
  })

  it('open trade (no close_time) computes as today — guard skipped (holdMs not finite)', () => {
    const r = computeMaeMfe(longTrade(null), windowBars())
    expect(r.mae).toBeCloseTo(0.5, 5)
    expect(r.mfe).toBeCloseTo(0.5, 5)
  })

  it('empty bars still returns null/null regardless of hold length', () => {
    expect(computeMaeMfe(longTrade('2026-05-01T15:00:00.000Z'), [])).toEqual({
      mae: null,
      mfe: null,
    })
  })
})
