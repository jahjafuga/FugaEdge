import { describe, it, expect } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import { runDayOfWeek } from '../rules'
import { runAllInsightRules } from '../index'
import { selectHeroCards } from '../heroCards'
import type { InsightInput } from '../types'

// 2026-06-01 is a Monday, 2026-06-03 a Wednesday (distinct weekday buckets).
const MON = '2026-06-01'
const WED = '2026-06-03'

let _id = 5000
// `count` trades on `date` summing to exactly `total` — the first trade carries
// the whole sum, the rest are breakeven; runDayOfWeek only reads the net sum +
// trade_count, so this controls both precisely.
function dayBucket(date: string, total: number, count: number): TradeListRow[] {
  return Array.from({ length: count }, (_, i) =>
    makeTrade({
      id: _id++,
      date,
      symbol: 'AAA',
      net_pnl: i === 0 ? total : 0,
      open_time: `${date}T13:35:00.000Z`,
      close_time: `${date}T13:45:00.000Z`,
    }),
  )
}
const input = (trades: TradeListRow[]): InsightInput => ({
  trades,
  sentimentByDate: new Map(),
  disciplineStreak: 0,
})

describe('runDayOfWeek — splits into two correctly-toned insights (RED#a)', () => {
  it('best day strongly positive + worst day slightly negative → ONE positive + ONE negative', () => {
    const trades = [...dayBucket(MON, 1280, 29), ...dayBucket(WED, -47, 9)]
    const out = runDayOfWeek(input(trades))

    expect(out).toHaveLength(2)

    const pos = out.find((i) => i.tone === 'positive')
    const neg = out.find((i) => i.tone === 'negative')
    expect(pos).toBeDefined()
    expect(neg).toBeDefined()

    // Strongest day: positive tone, the best day's POSITIVE money, best-day n.
    expect(pos!.metric).toBe('+$1,280')
    expect(pos!.title).toMatch(/strongest day/)
    expect(pos!.n).toBe(29)

    // Weakest day: negative tone, the worst day's ACTUAL loss (Unicode minus).
    expect(neg!.metric).toBe('−$47')
    expect(neg!.title).toMatch(/weakest day/)
    expect(neg!.n).toBe(9)
  })

  it('priority comes from each insight’s OWN magnitude (not the best-worst gap)', () => {
    const trades = [...dayBucket(MON, 1280, 29), ...dayBucket(WED, -47, 9)]
    const out = runDayOfWeek(input(trades))
    const pos = out.find((i) => i.tone === 'positive')!
    const neg = out.find((i) => i.tone === 'negative')!
    // best-day-driven positive priority >> tiny-loss negative priority
    expect(pos.priority).toBeGreaterThan(neg.priority)
    expect(pos.priority).toBe(1280 + 29 * 10)
    expect(neg.priority).toBe(47 + 9 * 10)
  })
})

describe('runDayOfWeek — no manufactured leak when every day is green (RED#d)', () => {
  it('all days net positive → ONLY the positive strongest-day, no negative', () => {
    const trades = [...dayBucket(MON, 500, 12), ...dayBucket(WED, 120, 12)]
    const out = runDayOfWeek(input(trades))
    expect(out).toHaveLength(1)
    expect(out[0].tone).toBe('positive')
    expect(out.some((i) => i.tone === 'negative')).toBe(false)
  })

  it('flat week (gap < 150) → emits nothing', () => {
    const trades = [...dayBucket(MON, 200, 10), ...dayBucket(WED, 150, 10)]
    expect(runDayOfWeek(input(trades))).toHaveLength(0)
  })
})

describe('full pipeline — the leak slot is a genuine loss, not the strong day (RED#f)', () => {
  it('runAllInsightRules → selectHeroCards puts the loss in the leak, the strong day in the edge', () => {
    const trades = [...dayBucket(MON, 1280, 20), ...dayBucket(WED, -400, 12)]
    const insights = runAllInsightRules(input(trades))
    const { edge, leak } = selectHeroCards(insights)

    expect(edge).not.toBeNull()
    expect(edge!.tone).toBe('positive')
    expect(edge!.title).toMatch(/strongest day/)

    expect(leak).not.toBeNull()
    expect(leak!.tone).toBe('negative')
    // the inversion: a positive-money insight must NEVER be the leak
    expect(leak!.metric?.startsWith('+')).not.toBe(true)
    expect(leak!.id).not.toBe('day-of-week-best')
  })
})
