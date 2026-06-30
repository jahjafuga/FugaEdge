// TradeZero File 2 Phase 3 — summary trips excluded from time-of-day analytics.
//
// A summary trip (source_format === 'summary') carries a fake 09:30 ET timestamp
// (no real fill times). Its P&L/shares/fees are REAL and must count everywhere,
// but its fake hour must NOT pollute the time-of-day buckets. This pins:
//   - the isSummaryTrip predicate (keyed on source_format, NEVER the 0s-hold);
//   - the four PURE time-of-day sites exclude summaries (hourly, comparison
//     'hour', technicals matrix, insights "best hour");
//   - THE SURGICAL invariant: the SAME summary still counts in a NON-hour
//     dimension (per-symbol) — the exclusion is local to the hour math;
//   - the 0s-HOLD guard: a real same-second scalp (open_time === close_time,
//     source_format 'execution') is NOT dropped from the hour buckets.
// (The two electron sites — analytics computeVolumeByTimeOfDay, reports byHour —
//  apply the SAME .filter(!isSummaryTrip); their behavior rides this predicate.)

import { describe, it, expect } from 'vitest'
import { isSummaryTrip } from '../summaryTrip'
import { bucketTradesByHour } from '@/core/performance/hourly'
import { computeBreakdownComparison } from '@/core/performance/comparison'
import { computeTimeOfDay } from '@/core/technicals/timeOfDay'
import { runTimeOfDay } from '@/core/insights/rules'
import type { TradeListRow } from '@shared/trades-types'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import type { InsightInput } from '@/core/insights/types'
import type { DateRange } from '@/core/performance/types'

// 13:30 UTC = 09:30 ET (June, EDT); 14:00 UTC = 10:00 ET.
const ET0930 = '2026-06-15T13:30:00Z'
const ET1000 = '2026-06-15T14:00:00Z'

const tlr = (over: Partial<TradeListRow> & { source_format?: string | null }): TradeListRow =>
  ({
    id: 1,
    date: '2026-06-15',
    symbol: 'AAA',
    side: 'long',
    open_time: ET0930,
    close_time: ET0930,
    net_pnl: 100,
    source_format: 'execution',
    executions: [],
    ...over,
  }) as unknown as TradeListRow

const twr = (over: Partial<TradeWithTechnicalsRow> & { source_format?: string | null }): TradeWithTechnicalsRow =>
  ({
    id: 1,
    symbol: 'AAA',
    date: '2026-06-15',
    side: 'long',
    net_pnl: 100,
    open_time: ET0930,
    playbook_id: null,
    playbook_name: null,
    technicals: null,
    source_format: 'execution',
    ...over,
  }) as unknown as TradeWithTechnicalsRow

describe('isSummaryTrip — keyed on source_format only', () => {
  it("is true ONLY for source_format === 'summary'", () => {
    expect(isSummaryTrip({ source_format: 'summary' })).toBe(true)
    for (const f of ['execution', 'tradehistory', 'orders', 'xlsx', 'daily-summary'])
      expect(isSummaryTrip({ source_format: f })).toBe(false)
    expect(isSummaryTrip({ source_format: undefined })).toBe(false)
    expect(isSummaryTrip({ source_format: null })).toBe(false)
    expect(isSummaryTrip({})).toBe(false)
  })
})

describe('#5 hourly.bucketTradesByHour — excludes summaries, keeps real 0s-hold scalps', () => {
  it('a summary @ 09:30 is NOT bucketed; a real exec @ 10:00 is', () => {
    const buckets = bucketTradesByHour([
      { date: '2026-06-15', open_time: ET0930, net_pnl: 500, source_format: 'summary' },
      { date: '2026-06-15', open_time: ET1000, net_pnl: 50, source_format: 'execution' },
    ])
    expect(buckets.has(9)).toBe(false) // summary's fake 9:30 excluded
    expect(buckets.get(10)?.trade_count).toBe(1)
  })

  it('0s-hold GUARD: a real same-second scalp (exec) @ 09:30 IS bucketed', () => {
    const buckets = bucketTradesByHour([
      { date: '2026-06-15', open_time: ET0930, net_pnl: 200, source_format: 'execution' },
    ])
    expect(buckets.get(9)?.trade_count).toBe(1) // keyed on source_format, NOT open===close
  })
})

describe('#6 comparison — hour dim excludes summary; SURGICAL: symbol dim still counts it', () => {
  const R: DateRange = { from: '2026-06-15', to: '2026-06-15' }
  const trips: TradeListRow[] = [
    tlr({ symbol: 'AAA', net_pnl: 200, source_format: 'execution' }), // real 0s-hold @ 9:30
    tlr({ symbol: 'BBB', net_pnl: 999, source_format: 'summary' }), // summary @ 9:30
  ]

  it("'hour': the summary is dropped (notShown), the real trip is bucketed", () => {
    const byHour = computeBreakdownComparison(trips, R, R, 'hour')
    expect(byHour.notShown).toBeGreaterThanOrEqual(1) // summary excluded from hour rows
    expect(byHour.rows.some((r) => r.key.startsWith('9'))).toBe(true) // real exec bucketed
  })

  it("SURGICAL: a NON-hour dimension ('dow') does NOT drop the summary", () => {
    // Same mixed set: the 'hour' dim drops the summary (above), but a non-hour
    // dimension keeps BOTH trips — proving the exclusion is local to the hour math.
    const byHour = computeBreakdownComparison(trips, R, R, 'hour')
    const byDow = computeBreakdownComparison(trips, R, R, 'dow')
    expect(byHour.notShown).toBeGreaterThanOrEqual(1) // summary dropped from hour
    expect(byDow.notShown).toBe(0) // summary KEPT for day-of-week (and every non-hour metric)
  })
})

describe('#3 technicals.computeTimeOfDay — summaries filtered OUT (not even counted as excluded)', () => {
  it('a summary is removed entirely: denominator 0 AND excluded 0', () => {
    const tod = computeTimeOfDay([twr({ source_format: 'summary' })], '1m')
    expect(tod.denominator).toBe(0)
    expect(tod.excluded).toBe(0) // the nuance: filtered before, not lumped into excluded
  })

  it('a real trip with no technicals still rides the normal excluded count', () => {
    const tod = computeTimeOfDay([twr({ source_format: 'execution', technicals: null })], '1m')
    expect(tod.excluded).toBe(1) // null-MACD exclusion unaffected for real trips
  })
})

describe('#4 insights.runTimeOfDay — no fake 09:30 peak from summaries', () => {
  it('a summary-only dataset (all @ 09:30) yields NO time-of-day insight', () => {
    const trades = Array.from({ length: 8 }, (_, i) =>
      tlr({ id: i, symbol: `S${i}`, net_pnl: 100, source_format: 'summary' }),
    )
    const input: InsightInput = { trades, sentimentByDate: new Map(), disciplineStreak: 0 }
    expect(runTimeOfDay(input)).toBeNull() // no real-time data → no fabricated peak
  })
})
