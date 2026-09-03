// BEAT 283 -- long vs short, the core guards. G1..G7 (G8 does not exist: the
// tab list is module-private, Analytics.tsx exports only the component).
//
// RED-FIRST DISCIPLINE: the direction module, the wording file and the two
// threaded exports do not exist when this file first runs. Guards that drive
// them load them DYNAMICALLY inside the test body, so each such guard goes red
// with "Cannot find module" -- recorded, and it proves little. G2 is the one
// guard on EXISTING code: it imports computePeriodMetrics statically and must
// go red for its OWN declared reason -- expectancy is undefined on
// PeriodMetrics -- before the cure threads it.
import { describe, expect, it } from 'vitest'
import { computePeriodMetrics } from '../metrics'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

// The not-yet modules, loaded per guard so file collection never dies on them.
const loadDirection = () => import('../direction')
const loadWording = () => import('@shared/direction-wording')
const loadTechTypes = () => import('@/core/technicals/types')
const loadFullStats = () => import('../fullStats')

let nextId = 1
/** n rows on one side whose net P&L alternates mean+spread / mean-spread, so
 *  for even n the sample mean is EXACTLY `mean` and the spread controls the
 *  band width. The test derives every expected sum from these rows itself --
 *  nothing below is hardcoded against the builder's arithmetic. */
function rowsFor(side: 'long' | 'short', n: number, mean: number, spread: number): TradeListRow[] {
  const out: TradeListRow[] = []
  for (let i = 0; i < n; i++) {
    const pnl = i % 2 === 0 ? mean + spread : mean - spread
    out.push(
      makeTrade({
        id: nextId++,
        side,
        net_pnl: pnl,
        gross_pnl: pnl,
        total_fees: 0,
        is_open: false,
        date: `2026-07-${String((i % 20) + 1).padStart(2, '0')}`,
      }),
    )
  }
  return out
}

describe('G1 the split feeds each side its own rows', () => {
  it('9 long + 4 short -> n 9 / n 4, and each side nets its own fixture sum', async () => {
    const { computeDirectionComparison } = await loadDirection()
    const longs = [110, -40, 60, -70, 25, 90, -15, 30, -10].map((p, i) =>
      makeTrade({ id: nextId++, side: 'long', net_pnl: p, is_open: false, date: `2026-07-${String(i + 1).padStart(2, '0')}` }),
    )
    const shorts = [50, -20, 35, -5].map((p, i) =>
      makeTrade({ id: nextId++, side: 'short', net_pnl: p, is_open: false, date: `2026-07-${String(i + 1).padStart(2, '0')}` }),
    )
    // POSITIVE CONTROL: the expected sums come from the fixture itself.
    const longSum = longs.reduce((s, t) => s + t.net_pnl, 0)
    const shortSum = shorts.reduce((s, t) => s + t.net_pnl, 0)

    const d = computeDirectionComparison([...longs, ...shorts])
    expect(d.long.n).toBe(9)
    expect(d.short.n).toBe(4)
    expect(d.long.n + d.short.n).toBe(13)
    expect(d.long.snapshot.metrics.netPnL).toBeCloseTo(longSum, 9)
    expect(d.short.snapshot.metrics.netPnL).toBeCloseTo(shortSum, 9)
  })
})

describe('G2 expectancy is threaded onto PeriodMetrics', () => {
  it('equals winRate x avgWinner - lossRate x |avgLoser|, and netPnL/trades with no scratches', () => {
    // No scratch trades: every pnl is decisively win or loss.
    const pnls = [120, -60, 80, -40, 200, -100, 50, -25]
    const rows = pnls.map((p, i) =>
      makeTrade({ id: nextId++, side: 'long', net_pnl: p, is_open: false, date: `2026-07-${String(i + 1).padStart(2, '0')}` }),
    )
    const m = computePeriodMetrics(rows, { from: '2026-07-01', to: '2026-07-31' })

    // Recomputed here FROM THE FIXTURE, not read back from the result.
    const wins = pnls.filter((p) => p > 0)
    const losses = pnls.filter((p) => p < 0)
    const wr = wins.length / (wins.length + losses.length)
    const avgW = wins.reduce((s, v) => s + v, 0) / wins.length
    const avgL = losses.reduce((s, v) => s + v, 0) / losses.length
    const expected = wr * avgW - (1 - wr) * Math.abs(avgL)

    // DECLARED RED REASON: expectancy is undefined on PeriodMetrics.
    expect(m.expectancy, 'expectancy is not threaded onto PeriodMetrics').toBeTypeOf('number')
    expect(m.expectancy).toBeCloseTo(expected, 9)
    // With zero scratches the dollar expectancy IS the mean trade.
    const net = pnls.reduce((s, v) => s + v, 0)
    expect(m.expectancy).toBeCloseTo(net / pnls.length, 9)
  })
})

describe('G3 the identity read is earned by sample', () => {
  const read = async (
    ln: number, lMean: number, lSpread: number,
    sn: number, sMean: number, sSpread: number,
  ) => {
    const { computeDirectionComparison } = await loadDirection()
    const d = computeDirectionComparison([
      ...rowsFor('long', ln, lMean, lSpread),
      ...rowsFor('short', sn, sMean, sSpread),
    ])
    return d.read
  }

  it('both under 30 -> insufficient, verdict null, shortfall names both', async () => {
    const r = await read(20, 10, 2, 10, 10, 2)
    expect(r.tier).toBe('insufficient')
    expect(r.verdict).toBe(null)
    expect(r.shortfall.long).toBe(10)
    expect(r.shortfall.short).toBe(20)
  })

  it('long 40 / short 12 -> insufficient, shortfall short 18', async () => {
    const r = await read(40, 10, 2, 12, 10, 2)
    expect(r.tier).toBe('insufficient')
    expect(r.verdict).toBe(null)
    expect(r.shortfall.long).toBe(0)
    expect(r.shortfall.short).toBe(18)
  })

  it('40/40 with overlapping bands -> preliminary, balanced', async () => {
    const r = await read(40, 10, 4, 40, 10, 4)
    expect(r.tier).toBe('preliminary')
    expect(r.verdict).toBe('balanced')
  })

  it('120/120 overlapping -> reliable, balanced', async () => {
    const r = await read(120, 10, 4, 120, 10, 4)
    expect(r.tier).toBe('reliable')
    expect(r.verdict).toBe('balanced')
  })

  it('40/40 disjoint bands, long higher -> preliminary, long', async () => {
    const r = await read(40, 50, 2, 40, 10, 2)
    expect(r.tier).toBe('preliminary')
    expect(r.verdict).toBe('long')
  })

  it('120/120 disjoint, short higher -> reliable, short', async () => {
    const r = await read(120, 10, 2, 120, 50, 2)
    expect(r.tier).toBe('reliable')
    expect(r.verdict).toBe('short')
  })

  it('120/40 disjoint -> preliminary: either side under 100 caps the tier', async () => {
    const r = await read(120, 50, 2, 40, 10, 2)
    expect(r.tier).toBe('preliminary')
    expect(r.verdict).toBe('long')
  })
})

describe('G4 the band is mean +/- 1.96 * sd / sqrt(n)', () => {
  it('on a 30-row fixture, both bounds to 1e-9, sd from the shared helper', async () => {
    const { computeDirectionComparison } = await loadDirection()
    const { sampleStdDev } = await loadFullStats()
    const rows = rowsFor('long', 30, 10, 3)
    const values = rows.map((t) => t.net_pnl)
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    const sd = sampleStdDev(values)
    expect(sd, 'the Q6 helper is not exported').toBeTypeOf('number')
    const half = (1.96 * (sd as number)) / Math.sqrt(30)

    const d = computeDirectionComparison(rows)
    expect(d.long.band, 'no band on a 30-row side').not.toBe(null)
    expect(d.long.band!.lo).toBeCloseTo(mean - half, 9)
    expect(d.long.band!.hi).toBeCloseTo(mean + half, 9)
  })
})

describe('G5 mergeCurves unions, forward fills, zero before first', () => {
  it('long 1,2,4 + short 2,3 -> union 1..4; short 0 on day 1, carried on day 4; long carried on day 3', async () => {
    const { mergeCurves } = await loadDirection()
    const longEq = [
      { date: '2026-07-01', daily_pnl: 10, cumulative: 10 },
      { date: '2026-07-02', daily_pnl: 15, cumulative: 25 },
      { date: '2026-07-04', daily_pnl: 15, cumulative: 40 },
    ]
    const shortEq = [
      { date: '2026-07-02', daily_pnl: -5, cumulative: -5 },
      { date: '2026-07-03', daily_pnl: -3, cumulative: -8 },
    ]
    const merged = mergeCurves(longEq, shortEq)
    expect(merged.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'])
    expect(merged[0].short, 'short must be 0 before its first point').toBe(0)
    expect(merged[0].long).toBe(10)
    expect(merged[2].long, 'long on day 3 carries its day-2 value').toBe(25)
    expect(merged[2].short).toBe(-8)
    expect(merged[3].short, 'short on day 4 carries its day-3 value').toBe(-8)
    expect(merged[3].long).toBe(40)
  })
})

describe('G6 the wording is complete and clean', () => {
  it('every exported string is non-empty and carries no U+2014', async () => {
    const { DirectionWording } = await loadWording()
    const emDash = String.fromCharCode(8212)
    const flat: string[] = []
    for (const v of Object.values(DirectionWording)) {
      if (typeof v === 'string') flat.push(v)
      else if (v && typeof v === 'object') flat.push(...Object.values(v as Record<string, string>))
    }
    expect(flat.length).toBeGreaterThan(0)
    for (const s of flat) {
      expect(s.length, 'an empty wording string').toBeGreaterThan(0)
      expect(s.includes(emDash), 'an em dash in wording: ' + s).toBe(false)
    }
  })

  it('every (tier, verdict) combination the type allows maps to a sentence', async () => {
    const { DirectionWording, directionSentenceKey } = await loadWording()
    const combos: [string, string | null][] = [
      ['insufficient', null],
      ['preliminary', 'long'], ['preliminary', 'short'], ['preliminary', 'balanced'],
      ['reliable', 'long'], ['reliable', 'short'], ['reliable', 'balanced'],
    ]
    for (const [tier, verdict] of combos) {
      const key = directionSentenceKey(tier as never, verdict as never)
      const s = (DirectionWording as unknown as Record<string, string>)[key]
      expect(typeof s, `no sentence for (${tier}, ${verdict})`).toBe('string')
      expect(s.length).toBeGreaterThan(0)
    }
  })
})

describe('G23 PIN: the P&L ratio is PeriodMetrics own winLossRatio', () => {
  it('avg winner 300 / avg loser -150 reads 2; one-sided books read null', () => {
    // USE, not THREAD: winLossRatio has been on PeriodMetrics since before
    // this beat (types.ts:105, computed metrics.ts:255-258). This pins the
    // math the plRatio row reads; the row itself never computes.
    const mixed = [300, 300, -150, -150].map((p, i) =>
      makeTrade({ id: nextId++, side: 'long', net_pnl: p, is_open: false, date: `2026-07-0${i + 1}` }),
    )
    const m = computePeriodMetrics(mixed, { from: '2026-07-01', to: '2026-07-31' })
    expect(m.winLossRatio).toBeCloseTo(2, 9)

    const winsOnly = [10, 20].map((p, i) =>
      makeTrade({ id: nextId++, side: 'long', net_pnl: p, is_open: false, date: `2026-07-0${i + 1}` }),
    )
    expect(computePeriodMetrics(winsOnly, { from: '2026-07-01', to: '2026-07-31' }).winLossRatio).toBe(null)

    const lossesOnly = [-10, -20].map((p, i) =>
      makeTrade({ id: nextId++, side: 'long', net_pnl: p, is_open: false, date: `2026-07-0${i + 1}` }),
    )
    expect(computePeriodMetrics(lossesOnly, { from: '2026-07-01', to: '2026-07-31' }).winLossRatio).toBe(null)
  })
})

describe('G13 leaders are polarity-aware facts, earned by sample', () => {
  // Minimal SideStats shapes: leaderFor reads only lowSample/empty (through
  // showLeaders) from the stats, so the rest of the record is not built.
  const stats = (over: Record<string, unknown> = {}) =>
    ({ lowSample: false, empty: false, n: 40, ...over }) as never

  it('the seven ruled cases', async () => {
    const mod = await loadDirection()
    const leaderFor = (mod as Record<string, unknown>).leaderFor as (
      k: string, lv: number | null, sv: number | null, l: never, s: never,
    ) => string | null
    // DECLARED RED REASON: leaderFor is not exported.
    expect(leaderFor, 'leaderFor is not exported').toBeTypeOf('function')

    const L = stats()
    const S = stats()
    const S4 = stats({ lowSample: true, n: 4 })
    expect(leaderFor('netPnL', 10, 5, L, S)).toBe('long')
    expect(leaderFor('maxDrawdown', 300, 100, L, S), 'lower wins on drawdown').toBe('short')
    expect(leaderFor('avgLoser', -5, -9, L, S), 'less negative wins on avgLoser').toBe('long')
    expect(leaderFor('trades', 9, 4, L, S), 'trades has no polarity').toBe(null)
    expect(leaderFor('winRate', 0.6, 0.5, L, S4), 'a lowSample side earns no leader').toBe(null)
    expect(leaderFor('netPnL', 10, 10, L, S), 'a tie has no leader').toBe(null)
    expect(leaderFor('netPnL', null, 5, L, S), 'a null value has no leader').toBe(null)
  })
})

describe('G7 the per-side floor is the technicals constant', () => {
  it('n=4 lowSample, n=5 not, n=0 empty and not lowSample; the constant is 5', async () => {
    const { computeDirectionComparison } = await loadDirection()
    const { LOW_SAMPLE_N } = await loadTechTypes()
    expect(LOW_SAMPLE_N, 'the technicals floor is not exported by name').toBe(5)

    const base = rowsFor('long', 6, 10, 2)
    const at = (k: number) => computeDirectionComparison([...base, ...rowsFor('short', k, 5, 1)]).short
    const s4 = at(4)
    expect(s4.lowSample).toBe(true)
    expect(s4.empty).toBe(false)
    const s5 = at(5)
    expect(s5.lowSample).toBe(false)
    const s0 = at(0)
    expect(s0.empty).toBe(true)
    expect(s0.lowSample).toBe(false)
  })
})
