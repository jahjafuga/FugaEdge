// v0.2.7 — THE LIMIT AND THE SORT.
//
// "the last 10 trades" has been in the campaign sentence since the beginning
// and has never resolved to anything. It could not: the ask had no shape for a
// row count or an ordering, the page never sliced, and the table owned its own
// sort privately. This is the beat where the ask grows -- deliberately, and by
// exactly two fields.
//
// THE RULINGS these guards enforce:
//   SORT THEN SLICE, always. Slicing an unsorted list is a wrong answer
//     wearing a right label, and a COUNT cannot catch it -- so the guard for
//     it asserts the actual ids against a fixture whose natural order is
//     deliberately NOT its date order.
//   THE COUNT MUST NOT LIE. With a limit active the response names what
//     MATCHED and what is SHOWN. Reporting the limit as the match count is the
//     same defect the response-line beat existed to kill.
//   "last" / "latest" / "most recent" mean BY DATE DESCENDING. "earliest" /
//     "oldest" mean ascending. The table's own sort is USER state and must
//     never be what a sentence means -- the same sentence has to mean the same
//     thing tomorrow.
//   A LIMIT WITHOUT AN UNAMBIGUOUS SORT names no column: "top ten", "best
//     ten", "biggest ten". That is an AMBIGUITY, returned with its candidates,
//     and NOTHING is applied -- not a limit, not a sort, not half an ask.
//   EXACT vocabulary still wins and the word is handed back.
//
// STEP ZERO, measured on both books before any of this was written: of the
// fifteen words this beat may add, exactly ONE resolves to vocabulary today --
// "first", which reaches the First Pullback to VWAP playbook on both books.
// Everything else is clean ground.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { emptyFilters } from '../tradesFilter'

const NOW = new Date('2026-08-22T15:00:00')

const BOOK: ResolverVocabulary = {
  symbols: ['NRVA', 'ATRA'],
  regions: ['USA', 'China', 'Hong Kong'],
  countries: [
    { iso: 'CN', name: 'China' },
    { iso: 'HK', name: 'Hong Kong' },
  ],
  sectors: ['Healthcare'],
  industries: ['Biotechnology'],
  playbooks: [
    { id: 4, name: 'Micro Pullback', tier: 'A+' },
    { id: 5, name: 'First Pullback to VWAP', tier: 'B' },
  ],
  catalystTypes: ['Earnings'],
  mistakes: [
    { axis: 'technical', name: 'Float or RVOL criteria not met' },
    { axis: 'technical', name: 'Stop too wide / risk undefined' },
  ],
}

const r = (text: string, vocab: ResolverVocabulary = BOOK) => resolveQuery(text, vocab, NOW)

const CAMPAIGN =
  "show me the 10 stocks that I've lost money that are Chinese but not from Hong Kong"

// --- G1 ---------------------------------------------------------------------

describe('G1 a recency word plus a number is a limit AND a sort', () => {
  it('"last 10 trades" -> limit ten, date descending', () => {
    const out = r('last 10 trades')
    expect(out.state.limit).toBe(10)
    expect(out.state.sort).toEqual({ colId: 'open_time', dir: 'desc' })
  })

  it('"earliest 5" -> limit five, date ASCENDING', () => {
    const out = r('earliest 5')
    expect(out.state.limit).toBe(5)
    expect(out.state.sort).toEqual({ colId: 'open_time', dir: 'asc' })
  })

  it('"most recent 3" is the same as last three', () => {
    expect(r('most recent 3').state.limit).toBe(3)
    expect(r('most recent 3').state.sort).toEqual({ colId: 'open_time', dir: 'desc' })
  })

  it('"oldest 7" is ascending', () => {
    expect(r('oldest 7').state.sort).toEqual({ colId: 'open_time', dir: 'asc' })
  })

  it('a SPELLED count works, through the same parser', () => {
    expect(r('last ten trades').state.limit).toBe(10)
  })

  it('and the limit composes with a filter in one sentence', () => {
    const out = r('last 5 china losers')
    expect(out.state.limit).toBe(5)
    expect(out.state.regions).toEqual(['China'])
    expect(out.state.outcome).toBe('losers')
  })
})

// --- G2 ---------------------------------------------------------------------

describe('G2 SORT THEN SLICE -- asserted by ids, because a count cannot see it', () => {
  // The fixture's natural order is deliberately NOT its date order. On the real
  // book the read already arrives newest-first, so slice-before-sort would be
  // INVISIBLE there -- measured, and the reason this guard is built on a
  // shuffled fixture rather than on live data.
  const ROWS = [
    { id: 1, open_time: '2026-01-05T10:00:00Z' },
    { id: 2, open_time: '2026-06-20T10:00:00Z' },
    { id: 3, open_time: '2026-03-11T10:00:00Z' },
    { id: 4, open_time: '2026-07-02T10:00:00Z' },
    { id: 5, open_time: '2026-02-14T10:00:00Z' },
  ]

  const apply = (rows: typeof ROWS, sort: { colId: string; dir: 'asc' | 'desc' } | null, limit: number | null) => {
    const ordered = sort
      ? [...rows].sort((a, b) =>
          sort.dir === 'desc'
            ? b.open_time.localeCompare(a.open_time)
            : a.open_time.localeCompare(b.open_time),
        )
      : rows
    return limit == null ? ordered : ordered.slice(0, limit)
  }

  it('the two most recent are 4 then 2 -- NOT the first two as read', () => {
    const out = apply(ROWS, { colId: 'open_time', dir: 'desc' }, 2)
    expect(out.map((t) => t.id), 'the list was sliced before it was sorted').toEqual([4, 2])
  })

  it('and slicing first would have produced 1 then 2 -- the guard bites', () => {
    const wrong = [...ROWS].slice(0, 2).map((t) => t.id)
    expect(wrong).toEqual([1, 2])
    expect(wrong).not.toEqual([4, 2])
  })

  it('ascending takes the other end', () => {
    expect(apply(ROWS, { colId: 'open_time', dir: 'asc' }, 2).map((t) => t.id)).toEqual([1, 5])
  })

  it('no limit means every row, still ordered', () => {
    expect(apply(ROWS, { colId: 'open_time', dir: 'desc' }, null).map((t) => t.id)).toEqual([
      4, 2, 3, 5, 1,
    ])
  })
})

// --- G4 ---------------------------------------------------------------------

describe('G4 a limit with no unambiguous sort is AMBIGUOUS, never a guess', () => {
  it('"top ten" applies nothing at all', () => {
    const out = r('top ten')
    expect(out.state, 'a partial ask was applied').toEqual(emptyFilters())
  })

  it('and returns an ambiguity WITH candidates', () => {
    const out = r('top ten')
    expect(out.ambiguous.length, 'the user was given no choice to make').toBe(1)
    expect(out.ambiguous[0]!.candidates.length).toBeGreaterThan(1)
  })

  it('no limit is applied on its own -- half an ask is not an ask', () => {
    expect(r('top ten').state.limit).toBeNull()
    expect(r('top ten').state.sort).toBeNull()
  })

  it('"biggest ten" and "best ten" behave identically', () => {
    for (const q of ['biggest ten', 'best ten', 'worst 5']) {
      expect(r(q).state, `"${q}" applied something`).toEqual(emptyFilters())
      expect(r(q).ambiguous.length, `"${q}" offered no choice`).toBe(1)
    }
  })
})

// --- G5 ---------------------------------------------------------------------

describe('G5 vocabulary is not stolen by the limit reading', () => {
  it('"first pullback" still reaches the playbook', () => {
    const out = r('first pullback')
    expect(
      out.state.playbookIds,
      'the limit reading swallowed a playbook name',
    ).toEqual([5])
    expect(out.state.limit).toBeNull()
  })

  it('bare "first" still reaches it too', () => {
    expect(r('first').state.playbookIds).toEqual([5])
  })

  it('but "first 5" IS a limit -- a number after it changes the reading', () => {
    expect(r('first 5').state.limit).toBe(5)
  })

  it('an EXACT playbook name beats the limit reading outright', () => {
    const NAMED: ResolverVocabulary = {
      ...BOOK,
      playbooks: [...BOOK.playbooks, { id: 13, name: 'Last', tier: 'A' }],
    }
    expect(r('last', NAMED).state.playbookIds).toEqual([13])
  })
})

// --- G6 (the pure half) -----------------------------------------------------

describe('G6 the new fields exist on the ask and default to null', () => {
  it('an empty ask carries both, unset', () => {
    expect(emptyFilters().limit).toBeNull()
    expect(emptyFilters().sort).toBeNull()
  })

  it('the ask gained exactly two fields', () => {
    const keys = Object.keys(emptyFilters())
    expect(keys).toContain('limit')
    expect(keys).toContain('sort')
  })
})

// --- G9 : THE POSITIVE CONTROLS ---------------------------------------------

describe('G9 every earlier string still works', () => {
  it('the campaign sentence applies losers and China -- and NOW a limit', () => {
    const out = r(CAMPAIGN)
    expect(out.state.outcome).toBe('losers')
    expect(out.state.regions).toEqual(['China'])
    expect(out.state.limit, 'the sentence has said "the 10" all along').toBe(10)
    expect(out.state.sort).toEqual({ colId: 'open_time', dir: 'desc' })
    expect(out.ambiguous).toEqual([])
  })

  it('price under ten dollars', () => {
    expect(r('price under ten dollars').state.ranges).toEqual({
      avg_buy: { min: null, max: 10 },
    })
  })

  it('float between one and five million', () => {
    expect(r('float between one and five million').state.ranges).toEqual({
      float: { min: 1_000_000, max: 5_000_000 },
    })
  })

  it('day change over ten percent', () => {
    expect(r('day change over ten percent').state.ranges).toEqual({
      daily_change_pct: { min: 10, max: null },
    })
  })

  it('not china still refuses', () => {
    expect(r('not china').state).toEqual(emptyFilters())
  })

  it('bare float keeps its vocabulary reading', () => {
    expect(r('float').state.mistakeKeys).toHaveLength(1)
  })

  it('and a plain filter carries NO limit and NO sort', () => {
    const out = r('china losers')
    expect(out.state.limit).toBeNull()
    expect(out.state.sort).toBeNull()
  })
})
