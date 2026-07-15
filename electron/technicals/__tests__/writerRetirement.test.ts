// BEAT 2 — ENTRY vs 9EMA: CLOBBER-GONE (structural).
//
// After the recompute heals the tile column, NO code path may write a
// day-only/degraded value over it. The retired writer (backfillAllEma9Distances
// → setTradeEma9Distance) SELECTed every trade with no WHERE and overwrote any
// differing value — union-seeded since "beat B" but degrading to day-only
// whenever warmup was absent (force-refresh wipe; the warmup-blind chart-open
// trigger). Leaving any fire point alive re-poisons the healed column on the
// next boot/refresh.
//
// Grep-on-code-lines assertion (the Beat-1 mutation-check idiom, made standing):
// the writer fn and its four fire points are GONE from the source, and the ONE
// remaining tile-column writer is the dual-write inside technicals/repo.ts.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('the day-only writer machinery is retired — all four fire points', () => {
  it('intraday.ts: writer + compute + launch arm + setter import are gone (refresh fire points 3 & 4 un-armed)', () => {
    const text = src('../../market/intraday.ts')
    expect(text).not.toMatch(/backfillAllEma9Distances/)
    expect(text).not.toMatch(/computeEma9Distance/)
    expect(text).not.toMatch(/runLaunchEma9Backfill/)
    expect(text).not.toMatch(/setTradeEma9Distance/)
  })

  it('main/index.ts: the launch fire point (setImmediate arm) is gone', () => {
    expect(src('../../main/index.ts')).not.toMatch(/runLaunchEma9Backfill/)
  })

  it('bars-get.ts: the warmup-blind chart-open fire point is gone', () => {
    expect(src('../../market/bars-get.ts')).not.toMatch(/backfillAllEma9Distances/)
  })

  it('market/repo.ts: the orphaned setter is deleted — no ownerless tile writer survives', () => {
    expect(src('../../market/repo.ts')).not.toMatch(/setTradeEma9Distance/)
    expect(src('../../market/repo.ts')).not.toMatch(/entry_ema9_distance_pct/)
  })

  it('the ONE remaining tile-column writer is the dual-write in technicals/repo.ts', () => {
    expect(src('../repo.ts')).toMatch(/UPDATE\s+trades\s+SET\s+entry_ema9_distance_pct/)
  })
})
