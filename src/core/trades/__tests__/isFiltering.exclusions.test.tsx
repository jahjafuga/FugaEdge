// @vitest-environment jsdom
//
// v0.2.7 — isFiltering LEARNS ABOUT EXCLUSIONS. Written RED.
//
// The exclusion engine has been sound since it was built: beat 84 re-derived
// two hundred and ninety-eight losers, twenty-eight Chinese losers and two
// hundred and seventy excluding China through the real filter, and all three
// matched. What was never true is that a user could get rid of one.
//
// emptyFilters() DOES wipe every exclude field, arrays and the rest alike.
// The Clear button that calls it is gated on isFiltering (TradesFilters.tsx:59,
// :175), and isFiltering tested none of the seven — so with an exclusion as the
// only filter the control never rendered, and the only way out was to re-type a
// query. Two more symptoms share that one cause: the header reported the
// UNFILTERED count (Trades.tsx:499) and the Edge disc's "remembering" dot
// stayed dark (QueryBubble.tsx:649). Three consumers, one predicate.
//
// THE RULING WAS ALREADY IN THE FILE, written for ranges and never extended —
// tradesFilter.ts:280-281: "A range alone must surface the Clear control, or a
// user can narrow the table and find no way to widen it again."
//
// ONE TEST PER ARRAY, NOT ONE FOR THE BLOCK. Six covered and one silently
// missed is the exact shape of the defect being fixed, so a block assertion
// would reproduce it in the guard. RG2 is the discriminating companion: without
// it every RG1 case passes for a predicate hardcoded to true.

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import {
  applyTradesFilters,
  emptyFilters,
  isFiltering,
  type TradesFilterState,
} from '@/core/trades/tradesFilter'
import {
  excludeChips,
  removeExcluded,
  EXCLUDE_FIELDS,
  type ExcludeField,
} from '@/core/trades/excludeChips'
import { makeTrade } from '@/test/fixtures/trade'

// ─── RG1 : one per array ─────────────────────────────────────────────────────

/** Every exclude array, with a value shaped the way that field carries it.
 *
 *  EXTENDED, NOT FORKED. This one table now drives four different questions --
 *  does the predicate see it, does Clear empty it, what does its chip READ, and
 *  does its chip's X REMOVE it -- and it still asserts exhaustively against
 *  emptyFilters below. A second table would let an eighth array be added with a
 *  guard in one place and none in the other, which is the six-of-seven shape all
 *  of this exists to stop. */
/** The exclude fields that are NOT arrays of one value. Kept beside the table
 *  above rather than folded into it: a boolean and a map do not have a chip
 *  label, and pretending they do would make the table lie about the panel. */
const OTHER_SHAPES = [
  'excludeSymbols',
  'excludeSides',
  'excludeOutcomes',
  'excludeDurations',
  'excludeDateFrom',
  'excludeDateTo',
  'excludeMistakesOnly',
  'excludeAPlus',
  'excludeRanges',
] as const

/** One populated value per non-array shape, so each can be asserted alone. */
const NON_ARRAY_VALUE: Record<(typeof OTHER_SHAPES)[number], Partial<TradesFilterState>> = {
  excludeSymbols: { excludeSymbols: ['TSLA'] },
  excludeSides: { excludeSides: ['short'] },
  excludeOutcomes: { excludeOutcomes: ['losers'] },
  excludeDurations: { excludeDurations: ['under1m'] },
  excludeDateFrom: { excludeDateFrom: '2026-01-01' },
  excludeDateTo: { excludeDateTo: '2026-01-31' },
  excludeMistakesOnly: { excludeMistakesOnly: true },
  excludeAPlus: { excludeAPlus: true },
  excludeRanges: { excludeRanges: { mae: { min: 1, max: null } } },
}

const EXCLUDE_CASES: {
  field: ExcludeField
  /** A real value, and the label its chip must read. */
  value: unknown
  valueLabel: string
  /** The null bucket, and the EXISTING name the app already gives it. */
  nullLabel: string
}[] = [
  { field: 'excludePlaybookIds',   value: 4,                                            valueLabel: 'Momentum',     nullLabel: 'No playbook' },
  { field: 'excludeMistakeKeys',   value: { axis: 'technical', name: 'Chased extended' }, valueLabel: 'Chased extended', nullLabel: 'Chased extended' },
  { field: 'excludeCatalystTypes', value: 'Earnings',                                   valueLabel: 'Earnings',     nullLabel: 'No catalyst' },
  { field: 'excludeRegions',       value: 'China',                                      valueLabel: 'China',        nullLabel: 'Unknown' },
  { field: 'excludeCountries',     value: 'CN',                                         valueLabel: 'CN',           nullLabel: 'Unknown' },
  { field: 'excludeSectors',       value: 'Healthcare',                                 valueLabel: 'Healthcare',   nullLabel: 'Unknown' },
  { field: 'excludeIndustries',    value: 'Biotechnology',                              valueLabel: 'Biotechnology', nullLabel: 'Unknown' },
  // v0.2.7 -- THE EIGHTH. This row exists because the assertion below FIRED
  // when the MACD facet landed: it counted eight declared arrays against seven
  // covered and failed by name. That is the guard doing exactly what it was
  // built for, so the table is extended rather than the count relaxed.
  { field: 'excludeMacdStates',    value: 'positive',                                   valueLabel: 'positive',     nullLabel: 'Unknown' },
]

/** The rows the panel is handed. Carries a playbook NAME for id 4 so the chip
 *  can read one without fetching -- the list read already joins it
 *  (electron/trades/list.ts:252) and the panel gets the UNFILTERED book. */
const NAMED_ROWS: TradeListRow[] = [
  makeTrade({ id: 901, playbook_id: 4, playbook_name: 'Momentum' }),
]

/** mistakeKeys is the one field whose null bucket is not reachable -- it holds
 *  objects, never null -- so its null case reuses the value case. */
const hasNullBucket = (f: ExcludeField) => f !== 'excludeMistakeKeys'

describe('RG1 an exclusion ALONE surfaces the Clear control', () => {
  it.each(EXCLUDE_CASES)('$field alone counts as filtering', ({ field, value }) => {
    const state = { ...emptyFilters(), [field]: [value] } as TradesFilterState
    expect(
      isFiltering(state),
      `${String(field)} alone left isFiltering false — the Clear button will not render ` +
        'and the only way out is to re-type a query',
    ).toBe(true)
  })

  it('every exclude field is covered by this suite, none silently missing', () => {
    // EXTENDED BY BEAT ONE HUNDRED NINETY FIVE. WAS:
    //   it('all eight are covered by this suite, none silently missing')
    //   expect(covered, 'an exclude array exists with no guard').toEqual(declared)
    // The law is unchanged and it fired exactly as built when ten more
    // arrived. What changed is that not every exclude field is an ARRAY any
    // more: two are booleans, two are plain strings and one is a map, so a
    // single table keyed by "array of one value" can no longer cover them.
    // The second table below carries the other shapes, and the completeness
    // check is against the UNION -- which is the assertion that mattered.
    const covered = [...EXCLUDE_CASES.map((c) => c.field), ...OTHER_SHAPES].sort()
    const declared = Object.keys(emptyFilters())
      .filter((k) => k.startsWith('exclude'))
      .sort()
    expect(covered, 'an exclude field exists with no guard').toEqual(declared)
  })

  it.each(OTHER_SHAPES)('%s alone counts as filtering, in its own shape', (field) => {
    const state = { ...emptyFilters(), ...NON_ARRAY_VALUE[field] } as TradesFilterState
    expect(
      isFiltering(state),
      `${field} alone left isFiltering false, so the Clear control will not render`,
    ).toBe(true)
  })
})

// ─── RG2 : the discriminating companion ──────────────────────────────────────

describe('RG2 empty exclude arrays are NOT filtering', () => {
  it('a pristine state is not filtering', () => {
    expect(
      isFiltering(emptyFilters()),
      'the predicate is true for everything, which would surface Clear forever',
    ).toBe(false)
  })

  it('every exclude array present but empty is still not filtering', () => {
    const state = { ...emptyFilters() }
    for (const { field } of EXCLUDE_CASES) (state as never as Record<string, unknown[]>)[field] = []
    expect(isFiltering(state)).toBe(false)
  })
})

// ─── RG6 : SCOPE GUARD — the engine is untouched ─────────────────────────────

describe('RG6 applyTradesFilters is unchanged by this beat', () => {
  // Beat 84's three numbers came off the five-hundred-and-twenty-eight book,
  // which no unit test can reach. The RELATIONSHIP they encode is what matters
  // and it is reproduced here on a fixture with hand-computed counts: losers,
  // losers of one region, and losers excluding that region must still partition.
  const BOOK: TradeListRow[] = [
    makeTrade({ id: 1, net_pnl: -100, region: 'China' }),
    makeTrade({ id: 2, net_pnl: -200, region: 'China' }),
    makeTrade({ id: 3, net_pnl: -300, region: 'USA' }),
    makeTrade({ id: 4, net_pnl: -400, region: 'USA' }),
    makeTrade({ id: 5, net_pnl: -500, region: 'Hong Kong' }),
    makeTrade({ id: 6, net_pnl: 900, region: 'China' }),
  ]
  const n = (f: Partial<TradesFilterState>) =>
    applyTradesFilters(BOOK, { ...emptyFilters(), ...f }).length

  it('losers, region losers and excluded losers still partition', () => {
    const losers = n({ outcome: 'losers' })
    const chinese = n({ outcome: 'losers', regions: ['China'] })
    const exChina = n({ outcome: 'losers', excludeRegions: ['China'] })
    expect(losers).toBe(5)
    expect(chinese).toBe(2)
    expect(exChina).toBe(3)
    expect(losers - chinese, 'the exclusion stopped being the complement').toBe(exChina)
  })

  it('and a null-region row still SURVIVES an exclusion', () => {
    const rows = [makeTrade({ id: 1, region: "China" }), makeTrade({ id: 2, region: undefined })]
    expect(
      applyTradesFilters(rows, { ...emptyFilters(), excludeRegions: ['China'] }).map((t) => t.id),
    ).toEqual([2])
  })
})

// ─── RG3 : the Clear control ─────────────────────────────────────────────────

import TradesFilters from '@/components/trades/TradesFilters'

afterEach(() => cleanup())

describe('RG3 Clear renders for an exclusion, and empties it', () => {
  const withExclusion = { ...emptyFilters(), excludeRegions: ['China'] }

  it('the control is on screen', () => {
    render(
      <TradesFilters filters={withExclusion} onChange={() => {}} trades={[]} />,
    )
    expect(
      screen.getByText('Clear'),
      'an exclusion narrowed the book with no way to widen it again',
    ).toBeTruthy()
  })

  it('and clicking it empties every exclude array — asserted on the STATE', () => {
    const onChange = vi.fn()
    render(<TradesFilters filters={withExclusion} onChange={onChange} trades={[]} />)
    fireEvent.click(screen.getByText('Clear'))
    const next = onChange.mock.calls[0]![0] as TradesFilterState
    // The DOM half would pass for a control that merely disappeared.
    for (const { field } of EXCLUDE_CASES) {
      expect(
        (next as never as Record<string, unknown[]>)[field as string],
        `${String(field)} survived Clear`,
      ).toEqual([])
    }
  })
})

// ─── RG4 and RG5 : the other two consumers ───────────────────────────────────

vi.mock('@/lib/ipc', () => ({
  ipc: {
    tradesList: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
    playbooksList: vi.fn(),
    mistakeDefsGet: vi.fn(),
    catalystDefsGet: vi.fn(),
  },
}))
vi.mock('@/components/trades/TradesTable', () => ({
  default: (p: { trades: TradeListRow[] }) => (
    <div data-testid="table-stub">
      <span data-testid="row-count">{p.trades.length}</span>
    </div>
  ),
}))
vi.mock('@/components/trades/TradesViewToggle', () => ({ default: () => null }))
vi.mock('@/components/trades/TradeChartCard', () => ({ default: () => null }))
vi.mock('@/components/trades/TradeChartTile', () => ({ default: () => null }))
vi.mock('@/components/data-health/MigrationCollisionsBanner', () => ({ default: () => null }))

import Trades from '@/pages/Trades'
import { AccountScopeProvider } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { writeTradesFilters } from '@/lib/prefs/tradesFilters'

const m = vi.mocked(ipc)

const PAGE_BOOK: TradeListRow[] = [
  makeTrade({ id: 1, symbol: 'AAAA', region: 'China' }),
  makeTrade({ id: 2, symbol: 'BBBB', region: 'USA' }),
  makeTrade({ id: 3, symbol: 'CCCC', region: 'USA' }),
]

function installMockLocalStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  installMockLocalStorage()
  m.tradesList.mockResolvedValue(PAGE_BOOK)
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
  m.playbooksList.mockResolvedValue([])
  m.mistakeDefsGet.mockResolvedValue([])
  m.catalystDefsGet.mockResolvedValue([])
})

async function mountWithExclusion() {
  writeTradesFilters('all', { ...emptyFilters(), excludeRegions: ['China'] })
  render(
    <MemoryRouter>
      <AccountScopeProvider>
        <Trades />
      </AccountScopeProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByTestId('table-stub')).toBeTruthy())
}

describe('RG4 and RG5 the other two consumers of the predicate', () => {
  // ONE page mount for both. Two mounts measurably destabilised the FULL suite:
  // each brings up QueryBubble, which registers a window keydown listener, and
  // the added load surfaced a pre-existing Ctrl+K race in a NEIGHBOURING suite
  // (Trades.queryBubble K1) that is clean at HEAD and clean in isolation. That
  // race is not this beat's to fix, and both assertions here are about the SAME
  // committed state, so one mount was always sufficient.
  it('the header reports the FILTERED count, and the Edge dot is lit', async () => {
    await mountWithExclusion()
    // Two of the three survive excluding China; the subtitle must say so.
    await waitFor(() => expect(Number(screen.getByTestId('row-count').textContent)).toBe(2))
    expect(
      screen.getByText('of'),
      'the header reported the unfiltered count while the table showed fewer rows',
    ).toBeTruthy()
    const dot = document.querySelector('span.absolute.-right-0\\.5.-top-0\\.5')
    expect(dot, 'the "Edge remembering" dot stayed dark for an active exclusion').toBeTruthy()
  })
})

// ─── RS1 : THE LABEL, two cases per array ────────────────────────────────────

describe('RS1 every exclusion reads as a name', () => {
  it.each(EXCLUDE_CASES)('$field renders its VALUE as a label', ({ field, value, valueLabel }) => {
    const state = { ...emptyFilters(), [field]: [value] } as TradesFilterState
    const chips = excludeChips(state, NAMED_ROWS)
    expect(chips, `${field} produced no chip at all`).toHaveLength(1)
    expect(
      chips[0]!.label,
      `${field} rendered "${chips[0]!.label}" -- a user cannot act on that`,
    ).toBe(valueLabel)
    expect(chips[0]!.label, 'an object leaked into the label').not.toBe('[object Object]')
    expect(chips[0]!.label, 'a bare id reached the user').not.toMatch(/^\d+$/)
  })

  it.each(EXCLUDE_CASES)('$field renders its NULL bucket by its existing name', ({ field, nullLabel }) => {
    const raw = hasNullBucket(field) ? null : { axis: 'technical', name: 'Chased extended' }
    const state = { ...emptyFilters(), [field]: [raw] } as TradesFilterState
    const chips = excludeChips(state, NAMED_ROWS)
    expect(chips).toHaveLength(1)
    expect(
      chips[0]!.label,
      'the null bucket rendered blank, "null", or a second vocabulary for a name ' +
        'the app already has',
    ).toBe(nullLabel)
    expect(chips[0]!.label.trim()).not.toBe('')
    expect(chips[0]!.label).not.toBe('null')
  })

  it('the table covers every field the module itself declares', () => {
    // Ties the guard table to the module's own list, so an eighth array cannot
    // be added to one and not the other.
    expect(EXCLUDE_CASES.map((c) => c.field).sort()).toEqual([...EXCLUDE_FIELDS].sort())
  })
})

// ─── RS2 : EMPTY IS NOTHING ──────────────────────────────────────────────────

describe('RS2 no exclusions renders nothing at all', () => {
  it('the derivation is empty', () => {
    expect(excludeChips(emptyFilters(), NAMED_ROWS)).toEqual([])
  })

  it('and the panel renders no strip -- not an empty container, not a heading', () => {
    render(<TradesFilters filters={emptyFilters()} onChange={() => {}} trades={NAMED_ROWS} />)
    expect(screen.queryByTestId('exclusion-strip'), 'an empty strip rendered').toBeNull()
    expect(screen.queryByText('Excluding'), 'a heading rendered over nothing').toBeNull()
  })
})

// ─── RS3 : IT SURVIVES THE BUBBLE CLOSING ────────────────────────────────────

describe('RS3 the strip reads committed state, not draft text', () => {
  // THE DEFECT, asserted. The bubble's chips are a useMemo over `text`, and both
  // close() and doOpen() set it to empty -- so anything derived from text is
  // gone the moment the bubble is not being typed into. This renders the panel
  // with NO bubble present at all, which is the same condition.
  it('an exclusion is still named with no query text anywhere', () => {
    const state = { ...emptyFilters(), excludeRegions: ['China'] }
    render(<TradesFilters filters={state} onChange={() => {}} trades={NAMED_ROWS} />)
    expect(
      screen.getByTestId('exclusion-strip'),
      'the strip vanished with the draft text -- this is the original defect',
    ).toBeTruthy()
    expect(screen.getByText('China')).toBeTruthy()
  })
})

// ─── RS4 : REMOVAL, one case per array ───────────────────────────────────────

describe('RS4 a chip removes ITS value and nothing else', () => {
  it.each(EXCLUDE_CASES)('$field removes on the STATE, leaving the other six', ({ field, value }) => {
    // Every array populated, so "left the others alone" is a real claim.
    const state = { ...emptyFilters() } as TradesFilterState
    for (const c of EXCLUDE_CASES) (state as never as Record<string, unknown[]>)[c.field] = [c.value]

    const next = removeExcluded(state, field, value)

    expect(
      (next as never as Record<string, unknown[]>)[field],
      `${field}'s X did not remove its value -- the chip is decorative`,
    ).toEqual([])
    for (const other of EXCLUDE_CASES) {
      if (other.field === field) continue
      expect(
        (next as never as Record<string, unknown[]>)[other.field],
        `removing from ${field} also emptied ${other.field}`,
      ).toHaveLength(1)
    }
  })

  it('and the panel wires the X to that removal, asserted on the state', () => {
    // The DOM half alone would pass for a control that merely disappeared --
    // beat 76 measured exactly that. So the assertion is on what onChange got.
    const onChange = vi.fn()
    const state = { ...emptyFilters(), excludeRegions: ['China'], excludeSectors: ['Healthcare'] }
    render(<TradesFilters filters={state} onChange={onChange} trades={NAMED_ROWS} />)

    fireEvent.click(screen.getByLabelText('remove exclusion China'))

    const next = onChange.mock.calls[0]![0] as TradesFilterState
    expect(next.excludeRegions, 'the region survived its own X').toEqual([])
    expect(next.excludeSectors, 'an unrelated exclusion was cleared too').toEqual(['Healthcare'])
  })
})

// ─── RS5 : THE TRAP ──────────────────────────────────────────────────────────

describe('RS5 a mistake key removes by identity, not by reference', () => {
  // The house remover is `filter((x) => x !== value)` -- inline at
  // TradesFilters.tsx:457 and :910, both on POSITIVE arrays of primitives.
  // Copied here it would no-op on this field with no visible symptom: the chip
  // would render, the X would click, and nothing would change. After a round
  // trip through storage the state's object is NEVER the chip's object, so this
  // is the everyday case, not an edge one.
  it('a DIFFERENT object with the same axis and name still removes', () => {
    const stored = { axis: 'technical' as const, name: 'Chased extended' }
    const state = { ...emptyFilters(), excludeMistakeKeys: [stored] }
    const fromChip = { axis: 'technical' as const, name: 'Chased extended' }
    expect(fromChip, 'the test handed back the same reference, so it proves nothing').not.toBe(stored)

    const next = removeExcluded(state, 'excludeMistakeKeys', fromChip)

    expect(
      next.excludeMistakeKeys,
      'reference equality left the mistake in place -- the X does nothing and ' +
        'says nothing',
    ).toEqual([])
  })

  it('and it does NOT remove a same-named key on the other axis', () => {
    // The companion: without it, "removes by identity" would pass for a
    // comparator that matched on name alone, and the axes exist because the
    // same name can live on both.
    const state = {
      ...emptyFilters(),
      excludeMistakeKeys: [
        { axis: 'technical' as const, name: 'Chased extended' },
        { axis: 'psychological' as const, name: 'Chased extended' },
      ],
    }
    const next = removeExcluded(state, 'excludeMistakeKeys', {
      axis: 'technical' as const,
      name: 'Chased extended',
    })
    expect(next.excludeMistakeKeys).toEqual([
      { axis: 'psychological', name: 'Chased extended' },
    ])
  })
})

// ─── RS6 : NULL REMOVAL ──────────────────────────────────────────────────────

describe('RS6 removing a null chip removes the null', () => {
  it('not the first element, and not nothing', () => {
    const state = { ...emptyFilters(), excludeRegions: ['China', null, 'USA'] }
    const next = removeExcluded(state, 'excludeRegions', null)
    expect(
      next.excludeRegions,
      'a remover that treats null as "nothing to remove", or that removes by ' +
        'position, fails here and only here',
    ).toEqual(['China', 'USA'])
  })

  it('and a value chip does not take the null with it', () => {
    const state = { ...emptyFilters(), excludeRegions: ['China', null] }
    expect(removeExcluded(state, 'excludeRegions', 'China').excludeRegions).toEqual([null])
  })
})

// ─── RS7 : SCOPE GUARD — GREEN BEFORE THE CURE ───────────────────────────────

describe('RS7 the positive controls are untouched', () => {
  it('a positive filter still renders its own control, and no exclusion chip', () => {
    const state = { ...emptyFilters(), regions: ['China'] }
    render(<TradesFilters filters={state} onChange={() => {}} trades={NAMED_ROWS} />)
    expect(screen.getByText('Region')).toBeTruthy()
    expect(
      screen.queryByTestId('exclusion-strip'),
      'a POSITIVE filter rendered an EXCLUSION chip -- the two sides are crossed',
    ).toBeNull()
  })

  it('and the engine still partitions exactly as before', () => {
    // R79: removal shortens an array; nothing in the engine learns anything.
    const rows = [
      makeTrade({ id: 1, net_pnl: -100, region: 'China' }),
      makeTrade({ id: 2, net_pnl: -200, region: 'USA' }),
    ]
    const withEx = { ...emptyFilters(), excludeRegions: ['China'] }
    expect(applyTradesFilters(rows, withEx).map((t) => t.id)).toEqual([2])
    const after = removeExcluded(withEx, 'excludeRegions', 'China')
    expect(applyTradesFilters(rows, after).map((t) => t.id)).toEqual([1, 2])
  })
})
