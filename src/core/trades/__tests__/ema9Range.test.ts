// v0.2.7 — EMA9 DISTANCE JOINS THE RANGE REGISTRY, closing the technicals pair.
//
// The field has ridden the row since the technicals work — for the detail
// tile, never for filtering. The inventory manifest called it filterable; it
// was not, and registering its VWAP twin as a range column is what exposed
// the gap. This is the twin's registration, mirrored exactly.

import { describe, expect, it } from 'vitest'
import { applyTradesFilters, emptyFilters, rangeValueOf } from '../tradesFilter'
import { NUMERIC_COLUMN_IDS, DEFAULT_COLUMN_VISIBILITY, COLUMN_LABELS } from '@/lib/prefs/columns'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

const t = (over: Partial<TradeListRow>): TradeListRow => makeTrade(over as never)

const BOOK: TradeListRow[] = [
  t({ id: 1, tf_1m_ema9_dist_pct: 1.2 }),
  t({ id: 2, tf_1m_ema9_dist_pct: -8.0 }),
  t({ id: 3, tf_1m_ema9_dist_pct: 25.0 }),
  t({ id: 4, tf_1m_ema9_dist_pct: null }),
]

describe('ema9 distance is a range column, hidden by default', () => {
  it('registered: id, label, rangeValueOf, hidden', () => {
    expect((NUMERIC_COLUMN_IDS as readonly string[]).includes('ema9_dist_pct')).toBe(true)
    expect(COLUMN_LABELS['ema9_dist_pct']).toBe('EMA9 dist %')
    expect(DEFAULT_COLUMN_VISIBILITY.ema9_dist_pct).toBe(false)
    expect(rangeValueOf(BOOK[0], 'ema9_dist_pct')).toBe(1.2)
  })

  it('a range narrows with the column hidden; a null row never matches a bounded range', () => {
    const out = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      ranges: { ema9_dist_pct: { min: -10, max: 10 } },
    })
    expect(out.map((x) => x.id)).toEqual([1, 2])
  })
})
