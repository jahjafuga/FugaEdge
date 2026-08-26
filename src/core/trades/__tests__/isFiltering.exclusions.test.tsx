// @vitest-environment jsdom
//
// v0.2.7 — isFiltering LEARNS ABOUT EXCLUSIONS. Written RED.
//
// The exclusion engine has been sound since it was built: beat 84 re-derived
// two hundred and ninety-eight losers, twenty-eight Chinese losers and two
// hundred and seventy excluding China through the real filter, and all three
// matched. What was never true is that a user could get rid of one.
//
// emptyFilters() DOES wipe all seven exclude arrays (tradesFilter.ts:223-229).
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
import { makeTrade } from '@/test/fixtures/trade'

// ─── RG1 : one per array ─────────────────────────────────────────────────────

/** Every exclude array, with a value shaped the way that field carries it. */
const EXCLUDE_CASES: [keyof TradesFilterState, unknown[]][] = [
  ['excludePlaybookIds', [4]],
  ['excludeMistakeKeys', [{ axis: 'technical', name: 'Chased extended' }]],
  ['excludeCatalystTypes', ['Earnings']],
  ['excludeRegions', ['China']],
  ['excludeCountries', ['CN']],
  ['excludeSectors', ['Healthcare']],
  ['excludeIndustries', ['Biotechnology']],
]

describe('RG1 an exclusion ALONE surfaces the Clear control', () => {
  it.each(EXCLUDE_CASES)('%s alone counts as filtering', (field, value) => {
    const state = { ...emptyFilters(), [field]: value } as TradesFilterState
    expect(
      isFiltering(state),
      `${String(field)} alone left isFiltering false — the Clear button will not render ` +
        'and the only way out is to re-type a query',
    ).toBe(true)
  })

  it('all seven are covered by this suite, none silently missing', () => {
    // The defect being fixed is "six of seven handled". A count assertion here
    // means adding an eighth array without a case fails loudly.
    const covered = EXCLUDE_CASES.map(([f]) => f).sort()
    const declared = Object.keys(emptyFilters())
      .filter((k) => k.startsWith('exclude'))
      .sort()
    expect(covered, 'an exclude array exists with no guard').toEqual(declared)
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
    for (const [field] of EXCLUDE_CASES) (state as never as Record<string, unknown[]>)[field] = []
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
    for (const [field] of EXCLUDE_CASES) {
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
