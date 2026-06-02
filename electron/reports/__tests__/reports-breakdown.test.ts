import { describe, it, expect, vi } from 'vitest'

// v0.2.3 Stage B — unit tests for the bySector / byIndustry breakdown builders.
//
// get.ts transitively imports ../db/database (better-sqlite3, whose native
// binary won't load under vitest). The builders under test are PURE — they only
// read fields off the trade objects and never open the DB — so we stub the
// db module with a throwing openDatabase: if a builder ever reaches for the DB,
// the test fails loudly instead of silently loading the native addon.
vi.mock('../../db/database', () => ({
  openDatabase: () => {
    throw new Error('openDatabase must not be called from builder unit tests')
  },
  getDbPath: () => ':memory:',
}))

import { buildBySector, buildByIndustry } from '../get'

// Element type of the builders' parameter — avoids exporting the internal
// TradeForReport type just for tests.
type Trade = Parameters<typeof buildBySector>[0][number]

function mk(over: Partial<Trade> = {}): Trade {
  return {
    date: '2026-05-01',
    symbol: 'AAA',
    side: 'long',
    open_time: '2026-05-01T13:30:00.000Z',
    close_time: '2026-05-01T14:00:00.000Z',
    avg_buy_price: 10,
    avg_sell_price: 11,
    shares_bought: 100,
    shares_sold: 100,
    net_pnl: 0,
    gross_pnl: 0,
    total_fees: 0,
    mae: null,
    mfe: null,
    country: 'US',
    region: 'North America',
    sector: null,
    industry: null,
    ...over,
  } as Trade
}

// Run the identical battery against both builders — they mirror buildByRegion
// exactly, just keyed on a different field.
const builders = [
  { name: 'buildBySector', fn: buildBySector, field: 'sector' as const },
  { name: 'buildByIndustry', fn: buildByIndustry, field: 'industry' as const },
]

for (const { name, fn, field } of builders) {
  describe(`${name} (Stage B)`, () => {
    it('empty input → []', () => {
      expect(fn([])).toEqual([])
    })

    it('single group, single trade → one bucket with correct stats', () => {
      const out = fn([mk({ [field]: 'Healthcare', net_pnl: 50, total_fees: 2 } as Partial<Trade>)])
      expect(out).toHaveLength(1)
      expect(out[0].key).toBe('Healthcare')
      expect(out[0].trade_count).toBe(1)
      expect(out[0].net_pnl).toBe(50)
      expect(out[0].total_fees).toBe(2)
      expect(out[0].winners).toBe(1)
      expect(out[0].losers).toBe(0)
      expect(out[0].win_rate).toBe(1)
    })

    it('multiple groups present, sorted by trade_count desc', () => {
      const out = fn([
        mk({ [field]: 'Tech', net_pnl: 1 } as Partial<Trade>),
        mk({ [field]: 'Tech', net_pnl: 1 } as Partial<Trade>),
        mk({ [field]: 'Energy', net_pnl: 1 } as Partial<Trade>),
      ])
      expect(out.map((b) => b.key)).toEqual(['Tech', 'Energy'])
      expect(out.find((b) => b.key === 'Tech')!.trade_count).toBe(2)
    })

    it('null → Unknown bucket sorted LAST regardless of trade count', () => {
      const out = fn([
        mk({ [field]: null, net_pnl: 1 } as Partial<Trade>),
        mk({ [field]: null, net_pnl: 1 } as Partial<Trade>),
        mk({ [field]: null, net_pnl: 1 } as Partial<Trade>), // Unknown has the MOST trades
        mk({ [field]: 'Healthcare', net_pnl: 1 } as Partial<Trade>),
      ])
      expect(out[out.length - 1].key).toBe('Unknown')
      expect(out.find((b) => b.key === 'Unknown')!.trade_count).toBe(3)
    })

    it('undefined/missing field also buckets as Unknown', () => {
      const t = mk({ net_pnl: 5 })
      delete (t as unknown as Record<string, unknown>)[field]
      const out = fn([t])
      expect(out).toHaveLength(1)
      expect(out[0].key).toBe('Unknown')
    })

    it('winners and losers in one bucket → computeStats >0/<0 convention', () => {
      const out = fn([
        mk({ [field]: 'Mixed', net_pnl: 100 } as Partial<Trade>),
        mk({ [field]: 'Mixed', net_pnl: -40 } as Partial<Trade>),
        mk({ [field]: 'Mixed', net_pnl: 0 } as Partial<Trade>), // scratch: neither winner nor loser
      ])
      const b = out[0]
      expect(b.trade_count).toBe(3)
      expect(b.winners).toBe(1)
      expect(b.losers).toBe(1)
      expect(b.win_rate).toBe(0.5) // 1 / (1 + 1); the scratch is excluded from "decided"
      expect(b.net_pnl).toBe(60)
      expect(b.profit_factor).toBe(2.5) // 100 / |−40|
    })

    it('sum of bucket net_pnl + trade_count equals the input totals (no rows dropped)', () => {
      const trades = [
        mk({ [field]: 'A', net_pnl: 10 } as Partial<Trade>),
        mk({ [field]: 'B', net_pnl: -5 } as Partial<Trade>),
        mk({ [field]: null, net_pnl: 3 } as Partial<Trade>),
        mk({ [field]: 'A', net_pnl: 7 } as Partial<Trade>),
      ]
      const out = fn(trades)
      expect(out.reduce((s, b) => s + b.net_pnl, 0)).toBe(trades.reduce((s, t) => s + t.net_pnl, 0))
      expect(out.reduce((s, b) => s + b.trade_count, 0)).toBe(trades.length)
    })

    it('aggregates across multiple symbols within the same group', () => {
      const out = fn([
        mk({ symbol: 'AAA', [field]: 'Healthcare', net_pnl: 10 } as Partial<Trade>),
        mk({ symbol: 'BBB', [field]: 'Healthcare', net_pnl: 20 } as Partial<Trade>),
      ])
      expect(out).toHaveLength(1)
      expect(out[0].key).toBe('Healthcare')
      expect(out[0].trade_count).toBe(2) // grouped by the dimension, not by symbol
      expect(out[0].net_pnl).toBe(30)
    })
  })
}
