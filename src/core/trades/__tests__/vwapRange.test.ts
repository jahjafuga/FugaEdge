// v0.2.7 — VWAP DISTANCE AT ENTRY BECOMES A RANGE COLUMN.
//
// The value has been in the schema since the technicals work —
// trade_technicals.tf_1m_vwap_dist_pct, in a table the trades read already
// LEFT JOINs for the 9EMA twin — and never SELECTed. One field in a join
// that already exists. The threading mirrors tf_1m_ema9_dist_pct exactly;
// the range registration mirrors market_cap (id, label, hidden by default,
// rangeValueOf), because the ema9 twin was never registered as a range and
// the fuller precedent is one beat old.

import { describe, expect, it } from 'vitest'
import { applyTradesFilters, emptyFilters, rangeValueOf } from '../tradesFilter'
import { NUMERIC_COLUMN_IDS, DEFAULT_COLUMN_VISIBILITY, COLUMN_LABELS } from '@/lib/prefs/columns'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

const t = (over: Partial<TradeListRow>): TradeListRow => makeTrade(over as never)

const BOOK: TradeListRow[] = [
  t({ id: 1, tf_1m_vwap_dist_pct: 2.5 }),
  t({ id: 2, tf_1m_vwap_dist_pct: -12.0 }),
  t({ id: 3, tf_1m_vwap_dist_pct: 40.0 }),
  t({ id: 4, tf_1m_vwap_dist_pct: null }),
]

describe('A3 vwap distance is a range column, hidden by default', () => {
  it('registered: id, label, rangeValueOf, and it ships hidden', () => {
    expect((NUMERIC_COLUMN_IDS as readonly string[]).includes('vwap_dist_pct')).toBe(true)
    expect(COLUMN_LABELS['vwap_dist_pct']).toBe('VWAP dist %')
    expect(DEFAULT_COLUMN_VISIBILITY.vwap_dist_pct).toBe(false)
    expect(rangeValueOf(BOOK[0], 'vwap_dist_pct')).toBe(2.5)
  })

  it('a range narrows with the column hidden; a null row never matches a bounded range', () => {
    const out = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      ranges: { vwap_dist_pct: { min: -20, max: 10 } },
    })
    // id 3 above the band, id 4 NULL — excluded by an active range, never matched.
    expect(out.map((x) => x.id)).toEqual([1, 2])
  })

  it('rangeValueOf treats an absent field as null, not undefined', () => {
    const bare = t({ id: 9 })
    delete (bare as unknown as Record<string, unknown>).tf_1m_vwap_dist_pct
    expect(rangeValueOf(bare, 'vwap_dist_pct')).toBeNull()
  })
})
