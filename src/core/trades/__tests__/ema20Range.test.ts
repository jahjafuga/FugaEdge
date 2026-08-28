// v0.2.7 — THE TWENTY EMA, AS A NUMERIC RANGE.
//
// The column is stored, populated on all one hundred and forty demo trades and
// eighty-nine of the larger book, and the join it needs already exists — the
// read selected two of its neighbours and skipped this one. This is the second
// technicals column to be threaded, and it is deliberately the OTHER half of
// the machinery from the first: MACD needed a categorical facet with a null
// member, a kind slot and an exclude twin. A signed distance needs none of
// those. It is a range, and `ranges` is already a Record, so no state field is
// added and beat eighty-five's exhaustiveness guard must NOT move.
//
// ONE MINUTE ONLY. Both technicals fields already on the row are one-minute and
// this resolver has no notion of timeframe at all. A five-minute twin would
// make "vwap over ten" ambiguous the moment it landed, so the twins wait for a
// design that does not exist yet.
//
// THE BAND WORDS ARE REFUSED FOR THE TWENTY, and the evidence is the app's own
// spec rather than a preference. emaBuckets.ts calls its scheme "the 7 signed
// 9-EMA-distance buckets", labels two of them "Below 9 EMA" and "At 9 EMA", and
// quotes the spec as saying of the twenty: "20 EMA — binary crossover only".
// The edges were derived for the nine. Lending them to the twenty would invent
// a threshold, which is the one thing the band beat forbade.
//
// AND THE REFUSAL HAD TO BE MADE REAL. Before this beat "extended from the 20
// ema" did not refuse — it answered with the NINE's band and turned the twenty
// into a limit, because the band pass reads a bare "ema" as the nine and never
// looked at the number in front of it. A wrong indicator answered silently,
// which is worse than no answer. RK4 pins the refusal so it cannot drift back
// into working by accident.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { applyTradesFilters, emptyFilters, rangeValueOf } from '../tradesFilter'
import { NUMERIC_COLUMN_IDS, COLUMN_LABELS } from '@/lib/prefs/columns'
import type { TradeListRow } from '@shared/trades-types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const NOW = new Date('2026-08-22T15:00:00')

/** No playbook or mistake named for an indicator: the collisions are guarded
 *  elsewhere and must not leak into a measurement of the column itself. */
const BOOK: ResolverVocabulary = {
  symbols: ['NRVA'],
  regions: ['USA'],
  countries: [{ iso: 'US', name: 'United States' }],
  sectors: [],
  industries: [],
  playbooks: [],
  catalystTypes: [],
  mistakes: [],
} as unknown as ResolverVocabulary

const r = (text: string) => resolveQuery(text, BOOK, NOW, emptyFilters())
const ranges = (text: string) => r(text).state.ranges

/** Distances straddling zero and the five-per-cent mark. Chosen so no two
 *  answers share a count — a bound that reached the wrong rows would still be
 *  caught. */
const DISTANCES = [-9, -3, -0.4, 0, 0.6, 2, 4.9, 5, 8, 21]
const rowsAt = (col: 'tf_1m_ema20_dist_pct' | 'tf_1m_ema9_dist_pct') =>
  DISTANCES.map((d, i) => ({
    id: i + 1, date: '2026-08-20', symbol: 'NRVA', side: 'long', is_open: false,
    open_time: '2026-08-20T13:30:00Z', close_time: '2026-08-20T13:40:00Z',
    net_pnl: 10, playbook_id: null, mistakes: [], mistakeTags: [],
    catalyst_type: null, region: null, country: null, sector: null, industry: null,
    [col]: d,
  })) as unknown as TradeListRow[]

const count = (text: string, col: 'tf_1m_ema20_dist_pct' | 'tf_1m_ema9_dist_pct') =>
  applyTradesFilters(rowsAt(col), r(text).state).length

// --- RK1 : THE PHRASES THAT SURVIVED THE MEASUREMENT ------------------------

/** MEASURED with a scratch entry BEFORE any of them was added. A number-bearing
 *  key resolves only when an operator and a value are present -- the comparison
 *  pass runs before the bare-count pass -- so these seven work and the bare
 *  forms do not. Only the survivors were added. */
const SURVIVORS = [
  '20 ema over 5',
  'ema 20 over 5',
  'the 20 ema over 5',
  'ema20 over 5',
  'ema20 distance over 5',
  'ema20 dist over 5',
  '20 ema distance over 5',
]

describe('RK1 every surviving phrase reaches the twenty', () => {
  it.each(SURVIVORS)('%s resolves to ema20_dist_pct', (q) => {
    expect(ranges(q), `"${q}" did not reach the twenty`).toEqual({
      ema20_dist_pct: { min: 5, max: null },
    })
  })

  it('and the bare forms are still a COUNT, not a column', () => {
    // Not a defect, and not fixed here: a bare number is a limit everywhere in
    // this resolver, and changing that is parser work with its own beat.
    expect(r('20 ema').state.limit, 'a bare "20 ema" stopped being a count').toBe(20)
    expect(ranges('20 ema')).toEqual({})
  })
})

// --- RK2 : THE ROWS ---------------------------------------------------------

describe('RK2 the bound narrows the actual rows', () => {
  it('"ema20 over 5" keeps the rows at or above five', () => {
    // 5, 8, 21 -> three.
    expect(count('ema20 over 5', 'tf_1m_ema20_dist_pct')).toBe(3)
  })

  it('"ema20 under 0" keeps the rows at or below zero', () => {
    // -9, -3, -0.4, 0 -> four.
    expect(count('ema20 under 0', 'tf_1m_ema20_dist_pct')).toBe(4)
  })

  it('and neither is the whole set nor empty', () => {
    const over = count('ema20 over 5', 'tf_1m_ema20_dist_pct')
    expect(over).toBeGreaterThan(0)
    expect(over).toBeLessThan(DISTANCES.length)
  })

  it('the column is read from the TWENTY field, not the nine', () => {
    // The rows carry a value on ONE field only, so a resolution pointing at the
    // nine would match nothing at all. This is the assertion that catches a
    // phrase wired to the wrong column.
    expect(count('ema20 over 5', 'tf_1m_ema9_dist_pct')).toBe(0)
  })
})

// --- RK3 : THE ZERO RULE, AND THE SYMMETRY ---------------------------------

describe('RK3 a direction word with no value binds to zero here too', () => {
  // The twenty is the same kind of column as the nine and VWAP: a SIGNED
  // distance whose zero is the indicator itself. Shipping the column without
  // this would recreate exactly the asymmetry a whole beat was spent removing.
  it('"above the 20 ema" is min zero', () => {
    expect(ranges('above the 20 ema')).toEqual({ ema20_dist_pct: { min: 0, max: null } })
  })

  it('"below the 20 ema" is max zero', () => {
    expect(ranges('below the 20 ema')).toEqual({ ema20_dist_pct: { min: null, max: 0 } })
  })

  it('"above ema20" and "below ema20" read the same way', () => {
    expect(ranges('above ema20')).toEqual({ ema20_dist_pct: { min: 0, max: null } })
    expect(ranges('below ema20')).toEqual({ ema20_dist_pct: { min: null, max: 0 } })
  })

  it('AND THE NINE IS UNCHANGED BESIDE IT -- the symmetry is the point', () => {
    expect(ranges('above the 9 ema')).toEqual({ ema9_dist_pct: { min: 0, max: null } })
    expect(ranges('below the 9 ema')).toEqual({ ema9_dist_pct: { min: null, max: 0 } })
  })

  it('and a column with no meaningful zero still refuses', () => {
    // The scoping half: the rule admits signed DISTANCES, not every column.
    expect(ranges('above float')).toEqual({})
  })
})

// --- RK4 : THE BAND WORDS ARE REFUSED, DELIBERATELY -------------------------

describe('RK4 the twenty has no band words, and does not borrow the nine’s', () => {
  // BEFORE this beat these did not refuse -- they answered with the NINE's band
  // and read the twenty as a limit. A wrong indicator answering silently is the
  // disease this campaign exists to kill, so the refusal is asserted on the
  // STATE rather than on the absence of a complaint.
  it.each(['extended from the 20 ema', 'near the 20 ema', 'at the 20 ema'])(
    '%s writes NO range at all',
    (q) => {
      expect(ranges(q), `"${q}" was given a band the app never defined`).toEqual({})
    },
  )

  it('and specifically does NOT answer with the nine', () => {
    expect(
      ranges('extended from the 20 ema').ema9_dist_pct,
      'the twenty borrowed the nine’s band -- the wrong indicator, silently',
    ).toBeUndefined()
  })

  it('PROOF THIS CAN FIRE: the NINE still has its band words', () => {
    // The presence beside the absence. Without it this block would pass on a
    // resolver that had lost the band words entirely.
    expect(ranges('extended from the 9 ema')).toEqual({
      ema9_dist_pct: { min: 5, max: null },
    })
    expect(ranges('near the 9 ema')).toEqual({ ema9_dist_pct: { min: 0.5, max: 2 } })
  })
})

// --- RK5 : THE COLUMN IS OFFERED AND LABELLED -------------------------------

describe('RK5 the twenty is a first-class range column', () => {
  it('it is offered in the numeric column list', () => {
    expect((NUMERIC_COLUMN_IDS as readonly string[]).includes('ema20_dist_pct')).toBe(true)
  })

  it('and it has a human label, which the panel needs or it renders blank', () => {
    expect(COLUMN_LABELS['ema20_dist_pct']).toBeTruthy()
    expect(COLUMN_LABELS['ema20_dist_pct']).not.toBe('ema20_dist_pct')
  })

  it('and rangeValueOf reads it off the row', () => {
    const t = { tf_1m_ema20_dist_pct: 7.5 } as unknown as TradeListRow
    expect(rangeValueOf(t, 'ema20_dist_pct')).toBe(7.5)
  })

  it('reading it on a row that has no value gives null, not undefined', () => {
    expect(rangeValueOf({} as unknown as TradeListRow, 'ema20_dist_pct')).toBeNull()
  })
})

// --- RK6 : SCOPE GUARD — the nine and the rest are untouched ---------------

describe('RK6 nothing else moved', () => {
  it('the nine still resolves by every phrase it had', () => {
    expect(ranges('ema9 over 5')).toEqual({ ema9_dist_pct: { min: 5, max: null } })
    expect(ranges('9 ema over 5')).toEqual({ ema9_dist_pct: { min: 5, max: null } })
    expect(ranges('ema distance over 5')).toEqual({ ema9_dist_pct: { min: 5, max: null } })
  })

  it('VWAP is untouched', () => {
    expect(ranges('vwap over 10')).toEqual({ vwap_dist_pct: { min: 10, max: null } })
    expect(ranges('above vwap')).toEqual({ vwap_dist_pct: { min: 0, max: null } })
  })

  it('and a written negative bound still reads', () => {
    expect(ranges('ema20 under -0.5')).toEqual({ ema20_dist_pct: { min: null, max: -0.5 } })
  })

  it('R167: no exclude twin exists, because ranges have no exclude side', () => {
    const keys = Object.keys(emptyFilters()).filter((k) => k.startsWith('exclude'))
    expect(keys, 'a range grew an exclude array, which is the wrong shape').not.toContain(
      'excludeEma20',
    )
    expect(keys).toHaveLength(8)
  })
})

// --- RK5b : BOTH QUERY BUILDERS, ASSERTED SEPARATELY ------------------------
//
// list.ts holds TWO builders and they must move together: a half-landing makes
// the table filter correctly while the detail read returns undefined. The MACD
// column is guarded by RUNNING both builders through a capturing shim, which
// lives in the electron suite. Extending that file would be a SEVENTH file and
// the cap is six, so this beat asserts each builder from the SOURCE instead --
// weaker than executing them, and named as such rather than glossed. The
// mapper lines are asserted the same way for the same reason.

const listSrc = readFileSync(resolve(process.cwd(), 'electron/trades/list.ts'), 'utf8')
const bodyOf = (name: string) => {
  // The OPEN PAREN matters: without it "getTrade" prefix-matches
  // "getTradesByIdsForTechnicals", which is a different read entirely and
  // does not carry this column. The vacuity proof below caught exactly that.
  const i = listSrc.indexOf(`export function ${name}(`)
  const j = listSrc.indexOf('\nexport function ', i + 1)
  return i === -1 ? '' : listSrc.slice(i, j === -1 ? undefined : j)
}

describe('RK5b the column reaches BOTH read paths', () => {
  it('listTrades SELECTs it', () => {
    expect(bodyOf('listTrades'), 'listTrades never selected the twenty').toContain(
      'tt.tf_1m_ema20_dist_pct',
    )
  })

  it('getTrade SELECTs it too -- the builder that silently half-lands', () => {
    expect(bodyOf('getTrade'), 'getTrade never selected the twenty').toContain(
      'tt.tf_1m_ema20_dist_pct',
    )
  })

  it('and BOTH map it onto the row', () => {
    // Two occurrences of the assignment, one per builder. A single one would
    // mean the value is selected twice and threaded once.
    // The two MAPPER assignments specifically -- one builder threads it off
    // `r`, the other off `row`. Counting the bare field name would also count
    // its declaration on the db row interface and pass with a mapper missing.
    expect(listSrc, 'listTrades does not thread it onto the row').toContain(
      'tf_1m_ema20_dist_pct: r.tf_1m_ema20_dist_pct',
    )
    expect(listSrc, 'getTrade does not thread it onto the row').toContain(
      'tf_1m_ema20_dist_pct: row.tf_1m_ema20_dist_pct',
    )
  })

  it('PROOF THE SLICER WORKS: each body carries its own name and the NINE', () => {
    // Without this the three assertions above would pass on an empty string --
    // the vacuity a source-reading guard is most prone to.
    expect(bodyOf('listTrades')).toContain('listTrades')
    expect(bodyOf('getTrade')).toContain('getTrade')
    expect(bodyOf('listTrades')).toContain('tt.tf_1m_ema9_dist_pct')
    expect(bodyOf('getTrade')).toContain('tt.tf_1m_ema9_dist_pct')
  })
})
