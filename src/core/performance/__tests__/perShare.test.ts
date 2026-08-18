// v0.2.7 Feature 2, Commit 2 — cents per share, on the basis that already existed.
//
// fullStats has divided net P&L by Σ max(shares_bought, shares_sold) since the
// per-share family shipped, and Compare surfaces five metrics on that basis. Adding a
// second, side-aware denominator for the tier table would have put two definitions of
// "per share" in one product — agreeing on fully-closed trips and drifting apart on
// unequal legs. So the existing basis is EXTRACTED and reused; nothing is redefined.
//
// T13 guards that at the source level: the tier path must perform no division of its
// own. It is the same shape as the equity single-impl guard, and for the same reason.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { netPerShare, positionShares } from '../perShare'
import { aggregateTierPerformance } from '@/core/playbook/tiers'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

const t = (o: Partial<TradeListRow>) => makeTrade(o)
const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('netPerShare — the one per-share basis', () => {
  it('T7 known net over known shares', () => {
    // 100 shares, +$7.06 net -> 0.0706 dollars/share -> 7.06c
    const r = netPerShare([t({ shares_bought: 100, shares_sold: 100, net_pnl: 7.06 })])
    expect(r).toBeCloseTo(0.0706, 6)
  })

  it('T8 a SHORT resolves through max(bought, sold) — legs deliberately DIFFER', () => {
    // A short that opened 500 and has only bought back 200. max() is 500; a naive
    // shares_bought denominator would give 200 and inflate the figure by 2.5x.
    const short = t({ side: 'short', shares_sold: 500, shares_bought: 200, net_pnl: 50 })
    expect(positionShares(short)).toBe(500)
    expect(netPerShare([short])).toBeCloseTo(50 / 500, 6)
    expect(netPerShare([short])).not.toBeCloseTo(50 / 200, 6)
  })

  it('T10 zero shares -> null, never NaN, never Infinity', () => {
    const r = netPerShare([t({ shares_bought: 0, shares_sold: 0, net_pnl: 25 })])
    expect(r).toBeNull()
    expect(netPerShare([])).toBeNull()
  })

  it('T9 a tier is total net over total shares, NOT the average of its children', () => {
    // Two playbooks of deliberately unequal size in ONE tier:
    //   Big:   1000 shares, +$100  -> 0.10 /share
    //   Small:   10 shares, +$10   -> 1.00 /share
    // aggregate = 110 / 1010 = 0.1089...   average of children = 0.55
    const trades: TradeListRow[] = [
      t({ id: 1, playbook_id: 1, playbook_name: 'Big', playbook_tier: 'A+',
          shares_bought: 1000, shares_sold: 1000, net_pnl: 100 }),
      t({ id: 2, playbook_id: 2, playbook_name: 'Small', playbook_tier: 'A+',
          shares_bought: 10, shares_sold: 10, net_pnl: 10 }),
    ]
    const tier = aggregateTierPerformance(trades)[0]
    const aggregate = 110 / 1010
    const averageOfChildren = (100 / 1000 + 10 / 10) / 2
    expect(tier.net_per_share).toBeCloseTo(aggregate, 6)
    expect(tier.net_per_share).not.toBeCloseTo(averageOfChildren, 3)
    // and each child carries its own, on the same basis
    expect(tier.playbooks.find((p) => p.name === 'Big')!.net_per_share).toBeCloseTo(0.1, 6)
    expect(tier.playbooks.find((p) => p.name === 'Small')!.net_per_share).toBeCloseTo(1, 6)
  })

  it('T12 STAND-DOWN: the other tier values are unchanged by the addition', () => {
    const trades: TradeListRow[] = [
      t({ id: 1, playbook_id: 1, playbook_name: 'Bull Flag', playbook_tier: 'A+', net_pnl: 100 }),
      t({ id: 2, playbook_id: 1, playbook_name: 'Bull Flag', playbook_tier: 'A+', net_pnl: -50 }),
    ]
    const tier = aggregateTierPerformance(trades)[0]
    expect(tier.net_pnl).toBe(50)
    expect(tier.trades).toBe(2)
    expect(tier.winners).toBe(1)
    expect(tier.losers).toBe(1)
    expect(tier.win_rate).toBeCloseTo(0.5, 6)
    expect(tier.setups).toBe(1)
  })

  it('T13 NO SECOND FORMULA: the tier path performs no per-share division of its own', () => {
    const tiers = src('src/core/playbook/tiers.ts')
    expect(tiers).toMatch(/netPerShare/) // it reaches for the shared basis
    // ...and never divides by a share count itself.
    expect(tiers).not.toMatch(/\/\s*(totalPositionShares|positionShares|shares_bought|shares_sold)/)
    expect(tiers).not.toMatch(/Math\.max\(\s*t\.shares_bought/)

    // fullStats must use the SAME extracted helper, not its own inline copy.
    const full = src('src/core/performance/fullStats.ts')
    expect(full).toMatch(/positionShares|netPerShare/)
  })
})
