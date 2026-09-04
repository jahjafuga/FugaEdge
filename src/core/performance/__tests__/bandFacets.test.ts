// BEAT 306 -- the three band facets, guarded at the filter layer.
//
// NO BAND IS AUTHORED HERE OR IN THE CURE. Every boundary is imported from
// where it already lives, and G51 proves that by identity rather than by
// comparing numbers a copy would also satisfy:
//   time of day  TIME_OF_DAY_BUCKETS, core/technicals/timeOfDay.ts:60-66
//                (US/Eastern, via utcToEasternParts; left-inclusive edges)
//   price        PRICE_BUCKETS, core/performance/comparison.ts:358-365
//   float        floatBucket, core/insights/helpers.ts:119-133
//
// THE FLOAT SOURCE IS THE RULED ONE. A SECOND float band list exists in
// comparison.ts:389-397 with seven finer bands and different labels, itself
// mirroring electron/reports/get.ts. This beat uses the ruled insights/helpers
// definition and touches neither of the others.
import { describe, expect, it } from 'vitest'
import { applyFilters, emptyFilters } from '../filters'
import { computeOverviewSnapshot } from '../overviewSnapshot'
import { TIME_OF_DAY_BUCKETS } from '@/core/technicals/timeOfDay'
import { floatBucket, FLOAT_BUCKET_LABEL } from '@/core/insights/helpers'
import { PRICE_BUCKETS, priceBucketLabel, entryPrice } from '../comparison'
import {
  TIME_OF_DAY_FACET_BUCKETS,
  PRICE_FACET_BUCKETS,
  FLOAT_FACET_LABELS,
} from '../bandFacets'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

let nextId = 1

/** An ISO UTC instant for a given Eastern wall-clock time on a summer date.
 *  July is EDT (UTC-4), so 09:35 ET is 13:35Z. The fixture states the offset
 *  it relies on rather than hiding it. */
const etSummer = (hh: number, mm: number) =>
  `2026-07-15T${String(hh + 4).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`

const at = (hh: number, mm: number, over: Partial<TradeListRow> = {}) =>
  makeTrade({
    id: nextId++,
    side: 'long',
    net_pnl: 10,
    is_open: false,
    date: '2026-07-15',
    open_time: etSummer(hh, mm),
    close_time: etSummer(hh, mm + 5),
    ...over,
  })

describe('G51 the bands are imported, not authored', () => {
  it('each facet list is the SAME object the app already uses', () => {
    // Reference identity: a copied array with equal numbers would fail this.
    expect(TIME_OF_DAY_FACET_BUCKETS).toBe(TIME_OF_DAY_BUCKETS)
    expect(PRICE_FACET_BUCKETS).toBe(PRICE_BUCKETS)
    // floatBucket is a function, so identity is proved through it: every
    // facet label must be exactly what the shared bucketer labels a value in
    // that band, and the label map is the shared one.
    expect(FLOAT_FACET_LABELS).toEqual(
      (['nano', 'micro', 'small', 'mid'] as const).map((k) => FLOAT_BUCKET_LABEL[k]),
    )
    expect(FLOAT_BUCKET_LABEL[floatBucket(500_000)]).toBe(FLOAT_FACET_LABELS[0])
    expect(FLOAT_BUCKET_LABEL[floatBucket(3_000_000)]).toBe(FLOAT_FACET_LABELS[1])
    expect(FLOAT_BUCKET_LABEL[floatBucket(10_000_000)]).toBe(FLOAT_FACET_LABELS[2])
    expect(FLOAT_BUCKET_LABEL[floatBucket(50_000_000)]).toBe(FLOAT_FACET_LABELS[3])
  })
})

describe('G52 time of day filters on the Eastern bucket', () => {
  const book = () => [at(9, 35), at(10, 30), at(11, 30), at(14, 0)]

  it('one window, two windows, and none', () => {
    const rows = book()
    const openWindow = TIME_OF_DAY_BUCKETS[1].key // 9:30-10:00
    const second = TIME_OF_DAY_BUCKETS[2].key // 10:00-11:00

    const one = applyFilters(rows, { ...emptyFilters(), timeOfDay: [openWindow] })
    expect(one.map((t) => t.id)).toEqual([rows[0].id])

    const two = applyFilters(rows, { ...emptyFilters(), timeOfDay: [openWindow, second] })
    expect(two.map((t) => t.id)).toEqual([rows[0].id, rows[1].id])

    // Empty selection means NO filtering, exactly as playbooks behaves.
    expect(applyFilters(rows, { ...emptyFilters(), timeOfDay: [] }).length).toBe(4)
  })
})

describe('G53 the price band reads the ENTRY price, side-aware', () => {
  it('a long at 1.50 and a short at 7.00 land in different bands', () => {
    const long = makeTrade({
      id: nextId++, side: 'long', net_pnl: 5, is_open: false,
      avg_buy_price: 1.5, avg_sell_price: 1.8, date: '2026-07-15',
    })
    // THE TWO LEGS MUST LAND IN DIFFERENT BANDS. My first cut gave the short
    // 6.50 and 7.00, which share the $5-10 band, so a filter reading the
    // wrong leg looked identical and plant P54 passed. The cover leg now
    // sits under $2 while the entry sits at $7: only the correct pick can
    // put this trade in the $5-10 band.
    const short = makeTrade({
      id: nextId++, side: 'short', net_pnl: 5, is_open: false,
      avg_buy_price: 1.5, avg_sell_price: 7, date: '2026-07-15',
    })
    const rows = [long, short]
    // The band keys come from the shared list, looked up through the shared
    // classifier on the shared entry-price pick.
    const under2 = priceBucketLabel(entryPrice(long))!
    const fiveToTen = priceBucketLabel(entryPrice(short))!
    expect(under2).not.toBe(fiveToTen)

    expect(applyFilters(rows, { ...emptyFilters(), priceBands: [under2] }).map((t) => t.id))
      .toEqual([long.id])
    expect(applyFilters(rows, { ...emptyFilters(), priceBands: [fiveToTen] }).map((t) => t.id))
      .toEqual([short.id])
  })
})

describe('G54 the float band excludes rows with no float', () => {
  it('nulls are dropped when the facet is active, kept when it is not', () => {
    const rows: TradeListRow[] = []
    for (let i = 0; i < 3; i++) rows.push(at(10, 0, { float_shares: 500_000 }))
    for (let i = 0; i < 3; i++) rows.push(at(10, 0, { float_shares: 10_000_000 }))
    for (let i = 0; i < 3; i++) rows.push(at(10, 0, { float_shares: null }))

    const nano = FLOAT_BUCKET_LABEL.nano
    const picked = applyFilters(rows, { ...emptyFilters(), floatBands: [nano] })
    expect(picked.length, 'the nano band should hold three rows').toBe(3)
    expect(picked.every((t) => t.float_shares === 500_000)).toBe(true)

    // Selecting EVERY band still excludes the unmeasurable rows: that is the
    // honesty this facet trades for, and the coverage line names it.
    const all = applyFilters(rows, { ...emptyFilters(), floatBands: [...FLOAT_FACET_LABELS] })
    expect(all.length, 'a row with null float matched a band').toBe(6)

    expect(applyFilters(rows, { ...emptyFilters(), floatBands: [] }).length).toBe(9)
  })
})

describe('G55 ONE pass: the engine agrees with the filter', () => {
  it('all three facets plus a playbook and a side, in a single call', () => {
    const rows: TradeListRow[] = []
    for (let i = 0; i < 6; i++) {
      rows.push(at(9, 40, {
        side: i % 2 ? 'short' : 'long',
        net_pnl: i % 2 ? -7 : 13,
        avg_buy_price: 1.2, avg_sell_price: 1.4,
        float_shares: 500_000, playbook_name: 'Bull Flag',
      }))
    }
    for (let i = 0; i < 4; i++) {
      rows.push(at(14, 0, { net_pnl: 40, avg_buy_price: 25, avg_sell_price: 26, float_shares: 90_000_000, playbook_name: 'Other' }))
    }
    const filters = {
      ...emptyFilters(),
      playbooks: ['Bull Flag'],
      timeOfDay: [TIME_OF_DAY_BUCKETS[1].key],
      priceBands: [PRICE_BUCKETS[0].key],
      floatBands: [FLOAT_BUCKET_LABEL.nano],
    }
    const expected = computeOverviewSnapshot(rows, { ...filters, side: 'long' }).metrics.netPnL
    const manual = applyFilters(rows, { ...filters, side: 'long' })
      .reduce((s, t) => s + t.net_pnl, 0)
    expect(manual).toBeCloseTo(expected, 9)
    expect(manual, 'the fixture selected nothing, so the guard proves nothing').not.toBe(0)
  })
})
