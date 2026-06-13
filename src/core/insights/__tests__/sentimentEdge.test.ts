import { describe, it, expect } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { runSentimentEdge } from '../rules'

// v0.2.5 sentiment-flip — locks the POST-FLIP polarity of the sentiment-edge
// insight. After the SCHEMA_VERSION 28→29 flip, the scale is intuitive:
// 5 = best/hottest market (most runners), 1 = worst/coldest. So the rule
// must read HOT = s>=4 and COLD = s<=2 (the inverse of the pre-flip
// s<=2 / s>=4). This test is the only guard on that direction — there was
// none before the flip beat.

function mkTrade(over: Partial<TradeListRow>): TradeListRow {
  return {
    id: 1, date: '2026-02-02', symbol: 'XYZ', side: 'long',
    open_time: '2026-02-02T09:30:00', close_time: '2026-02-02T09:35:00',
    is_open: false,
    shares_bought: 100, avg_buy_price: 10, shares_sold: 100, avg_sell_price: 11,
    gross_pnl: 100, total_fees: 0, net_pnl: 100,
    executions: [], note: null, entry_timeframe: null, entry_ema9_distance_pct: null,
    playbook_id: null, playbook_name: null, playbook_tier: null, confidence: null, mistakes: [],
    planned_risk: null, planned_stop_loss_price: null,
    risk_per_share: null, total_risk: null, r_multiple: null,
    float_shares: null, shares_outstanding: null, catalyst_type: null, days_since_catalyst: null,
    country: 'US', country_name: 'United States', region: 'USA', country_source: 'polygon',
    attachment_count: 0,
    deleted_at: null,
    mae: null, mfe: null,
    ...over,
  }
}

// Dates carry the day's sentiment via sentimentByDate. Post-flip:
//   s=5, s=4 → HOT ;  s=1, s=2 → COLD ;  s=3 → neutral (excluded).
const sentimentByDate = new Map<string, number>([
  ['2026-02-02', 5], // hot
  ['2026-02-03', 4], // hot
  ['2026-02-04', 1], // cold
  ['2026-02-05', 2], // cold
  ['2026-02-06', 3], // neutral — must be ignored
])

const input = (trades: TradeListRow[]) => ({
  trades, sentimentByDate, disciplineStreak: 0,
})

describe('runSentimentEdge — post-flip polarity (5=best, 1=worst)', () => {
  it('treats s>=4 as HOT and s<=2 as COLD; winners on hot days, losers on cold → negative tone', () => {
    // 5 HOT winners (s=5 / s=4) and 5 COLD losers (s=1 / s=2). If the rule
    // still read s<=2 as hot, the winners would land in COLD and the tone
    // branch (coldNet<0 && hotNet>0) would NOT fire — so this asserts the flip.
    const hot = [
      ...Array.from({ length: 3 }, () => mkTrade({ date: '2026-02-02', net_pnl: 100 })),
      ...Array.from({ length: 2 }, () => mkTrade({ date: '2026-02-03', net_pnl: 100 })),
    ]
    const cold = [
      ...Array.from({ length: 3 }, () => mkTrade({ date: '2026-02-04', net_pnl: -100 })),
      ...Array.from({ length: 2 }, () => mkTrade({ date: '2026-02-05', net_pnl: -100 })),
    ]
    const neutral = Array.from({ length: 4 }, () => mkTrade({ date: '2026-02-06', net_pnl: -100 }))

    const result = runSentimentEdge(input([...hot, ...cold, ...neutral]))
    expect(result).not.toBeNull()
    expect(result!.tone).toBe('negative')
    // Body must label hot as 4–5 and cold as 1–2 (the copy flips with the math).
    expect(result!.body).toContain('hot-market days (sentiment 4–5)')
    expect(result!.body).toContain('cold days (1–2)')
  })

  it('returns null below the 5-per-side sample floor', () => {
    const hot = Array.from({ length: 4 }, () => mkTrade({ date: '2026-02-02', net_pnl: 100 }))
    const cold = Array.from({ length: 5 }, () => mkTrade({ date: '2026-02-04', net_pnl: -100 }))
    expect(runSentimentEdge(input([...hot, ...cold]))).toBeNull()
  })

  it('ignores neutral (s=3) days entirely', () => {
    // Only s=3 trades → no hot, no cold → null.
    const neutral = Array.from({ length: 12 }, () => mkTrade({ date: '2026-02-06', net_pnl: 100 }))
    expect(runSentimentEdge(input(neutral))).toBeNull()
  })
})
