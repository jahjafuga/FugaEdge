// @vitest-environment jsdom
//
// v0.2.7 — PROVENANCE, AND CLICK-AWAY DISCARDS. Written RED, before the cure.
//
// Beat 74 gave Edge the right to switch a range on so it could never filter
// invisibly. It never said what switches one off, and the consequence showed up
// in the founder's own app: "float under ten million", then Clear, and the FLOAT
// pair stays on the strip forever — empty, harmless, permanent.
//
// THE RULINGS these guards enforce:
//   R10 CLICK-AWAY DISCARDS. The outside-mousedown path closes WITHOUT
//       committing. The bubble's footer has read "Enter applies - Esc cancels"
//       all along, describing behaviour the code did not have.
//   R11 A CHOICE CARRIES PROVENANCE: 'user' when ticked in the menu, 'auto'
//       when installed by Edge, the migration, or a scope load.
//   R12 A 'user' CHOICE IS PERMANENT until unticked. No filter action removes
//       it — not Clear, not emptying the boxes, not another query.
//   R13 AN 'auto' CHOICE LIVES ONLY AS LONG AS ITS VALUE. Dormant and absent
//       are the SAME state: { min: null, max: null } is not active, so it
//       expires. That equivalence is measured, not assumed (beat 75, A3).
//   R14 AUTO NEVER DOWNGRADES USER.
//   R15 ONE RECONCILE, called from ONE funnel.
//
// RD1 AND RD5 ARE THE ONES THAT MATTER. RD1 asserts on the stored state and the
// live count, never on the bubble closing — beat 74's P1 proved a DOM-only
// assertion cannot tell discarded from applied, because a control vanishing
// looks identical either way. RD5 is the discriminating pair that separates
// "not active" from "key absent", which is the whole of R13.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { readTradesFilters } from '@/lib/prefs/tradesFilters'
import { readRangeChoices } from '@/lib/prefs/rangeChoices'

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

import Trades from '../Trades'
import { AccountScopeProvider } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

// Floats and rvols chosen so each query keeps a different, hand-computable row.
const BOOK: TradeListRow[] = [
  makeTrade({ id: 1, symbol: 'AAAA', float_shares: 2_000_000, rvol: 1 } as Partial<TradeListRow>),
  makeTrade({ id: 2, symbol: 'BBBB', float_shares: 20_000_000, rvol: 5 } as Partial<TradeListRow>),
  makeTrade({ id: 3, symbol: 'CCCC', float_shares: 900_000_000, rvol: 9 } as Partial<TradeListRow>),
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
  m.tradesList.mockResolvedValue(BOOK)
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
  m.playbooksList.mockResolvedValue([])
  m.mistakeDefsGet.mockResolvedValue([])
  m.catalystDefsGet.mockResolvedValue([])
})

async function mount() {
  render(
    <MemoryRouter>
      <AccountScopeProvider>
        <Trades />
      </AccountScopeProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByTestId('table-stub')).toBeTruthy())
}

const rowCount = () => Number(screen.getByTestId('row-count').textContent)

const rangeIds = () =>
  Array.from(document.querySelectorAll('[data-testid^="range-"]'))
    .filter((el) => el.getAttribute('data-testid') !== 'range-filters')
    .map((el) => el.getAttribute('data-testid')!.replace('range-', ''))
    .sort()

function tickInMenu(id: string) {
  fireEvent.click(screen.getByTestId('ranges-button'))
  fireEvent.click(screen.getByTestId(`choose-range-${id}`).querySelector('input')!)
  fireEvent.click(screen.getByTestId('ranges-button'))
}

/** Type a query into the bubble. Leaves it OPEN and uncommitted. */
async function typeAsk(text: string) {
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  const input = await waitFor(() => screen.getByLabelText('Ask Edge'))
  fireEvent.change(input, { target: { value: text } })
  return input
}

async function askEdge(text: string) {
  const input = await typeAsk(text)
  fireEvent.keyDown(input, { key: 'Enter' })
}

const clearAll = () => fireEvent.click(screen.getByText('Clear'))

// ─── RD1 ─────────────────────────────────────────────────────────────────────

describe('RD1 click-away CANCELS', () => {
  it('an outside mousedown leaves the committed filters UNCHANGED', async () => {
    await mount()
    await typeAsk('float under 5 million')
    // The candidate is live on the table while the bubble is open.
    await waitFor(() => expect(rowCount()).toBe(1))

    fireEvent.mouseDown(document.body)

    // THE STATE, not the bubble. A closed bubble looks the same either way.
    await waitFor(() =>
      expect(
        readTradesFilters('all').ranges.float,
        'click-away committed the query instead of discarding it',
      ).toBeUndefined(),
    )
  })

  it('and the live count returns to the whole book', async () => {
    await mount()
    await typeAsk('float under 5 million')
    await waitFor(() => expect(rowCount()).toBe(1))
    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(rowCount(), 'the discarded query kept filtering').toBe(BOOK.length))
  })

  it('and it installs NO range choice', async () => {
    await mount()
    await typeAsk('float under 5 million')
    await waitFor(() => expect(rowCount()).toBe(1))
    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(rangeIds(), 'a discarded query left a chooser row').toEqual([]))
  })
})

// ─── RD2 ─────────────────────────────────────────────────────────────────────

describe('RD2 ESC still cancels and Enter still applies', () => {
  it('ESC leaves the filters untouched', async () => {
    await mount()
    const input = await typeAsk('float under 5 million')
    await waitFor(() => expect(rowCount()).toBe(1))
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(rowCount()).toBe(BOOK.length))
    expect(readTradesFilters('all').ranges.float).toBeUndefined()
  })

  it('Enter applies, and the range is on the strip', async () => {
    await mount()
    await askEdge('float under 5 million')
    await waitFor(() => expect(rowCount()).toBe(1))
    expect(rangeIds()).toEqual(['float'])
  })
})

// ─── RD3 ─────────────────────────────────────────────────────────────────────

describe('RD3 a MENU-ticked range survives Clear', () => {
  it('the box is still rendered after Clear', async () => {
    await mount()
    tickInMenu('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    fireEvent.change(screen.getByLabelText('Float maximum'), { target: { value: '5000000' } })
    await waitFor(() => expect(rowCount()).toBe(1))

    clearAll()

    await waitFor(() => expect(rowCount()).toBe(BOOK.length))
    expect(rangeIds(), 'Clear removed a range the user ticked').toEqual(['float'])
  })

  it('and it is rendered EMPTY, not carrying the cleared value', async () => {
    await mount()
    tickInMenu('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    fireEvent.change(screen.getByLabelText('Float maximum'), { target: { value: '5000000' } })
    await waitFor(() => expect(rowCount()).toBe(1))
    clearAll()
    await waitFor(() =>
      expect((screen.getByLabelText('Float maximum') as HTMLInputElement).value).toBe(''),
    )
  })

  it('and its provenance is user', async () => {
    await mount()
    tickInMenu('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    expect(readRangeChoices().float).toBe('user')
  })
})

// ─── RD4 ─────────────────────────────────────────────────────────────────────

describe('RD4 an EDGE-installed range is GONE after Clear', () => {
  it('the rendered pair disappears', async () => {
    await mount()
    await askEdge('float under 5 million')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))

    clearAll()

    await waitFor(() =>
      expect(rangeIds(), 'an Edge range outlived the value that installed it').toEqual([]),
    )
  })

  it('and the choice is gone from the stored prefs, not merely unrendered', async () => {
    await mount()
    await askEdge('float under 5 million')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    expect(readRangeChoices().float).toBe('auto')
    clearAll()
    await waitFor(() => expect(readRangeChoices().float).toBeUndefined())
  })
})

// ─── RD5 : THE DISCRIMINATING PAIR ───────────────────────────────────────────

describe('RD5 hand-emptying expires an AUTO choice but never a USER one', () => {
  it('emptying an Edge range expires it — dormant is the same as absent', async () => {
    await mount()
    await askEdge('float under 5 million')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))

    // Both boxes emptied by hand. The KEY survives as { min: null, max: null },
    // which isRangeActive reads as false — that is what must expire it.
    fireEvent.change(screen.getByLabelText('Float maximum'), { target: { value: '' } })

    await waitFor(() =>
      expect(rangeIds(), 'a dormant auto range kept its row').toEqual([]),
    )
  })

  it('but emptying a MENU-ticked range keeps it', async () => {
    await mount()
    tickInMenu('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    fireEvent.change(screen.getByLabelText('Float maximum'), { target: { value: '5000000' } })
    await waitFor(() => expect(rowCount()).toBe(1))

    fireEvent.change(screen.getByLabelText('Float maximum'), { target: { value: '' } })

    await waitFor(() => expect(rowCount()).toBe(BOOK.length))
    expect(rangeIds(), 'emptying the box unticked a user choice').toEqual(['float'])
  })
})

// ─── RD6 ─────────────────────────────────────────────────────────────────────

describe('RD6 auto never downgrades user', () => {
  it('a ticked range set by Edge afterwards survives the Clear', async () => {
    await mount()
    tickInMenu('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    expect(readRangeChoices().float).toBe('user')

    await askEdge('float under 5 million')
    await waitFor(() => expect(rowCount()).toBe(1))
    expect(readRangeChoices().float, 'Edge downgraded a user choice to auto').toBe('user')

    clearAll()

    await waitFor(() => expect(rowCount()).toBe(BOOK.length))
    expect(rangeIds(), 'the user tick was lost through Edge').toEqual(['float'])
  })
})

// ─── RD7 ─────────────────────────────────────────────────────────────────────

describe('RD7 a second query keeps the first only while the first still filters', () => {
  // PREMISE CORRECTED MID-BEAT. This was written to assert that a second query
  // RETIRES the first one's range. It does not, and it must not: the bubble
  // resolves against the committed state as its base (QueryBubble.tsx:271 hands
  // snapshot.current to resolveQuery, which builds on it at
  // queryResolver.ts:353), so Edge queries COMPOSE. After the second query the
  // float bound is still in the state and still narrowing the book — so its row
  // must stay on screen. Retiring it would hide a live filter, which is the
  // exact trap the whole chooser exists to prevent.
  //
  // What the founder was worried about — a strip that only ever grows — is cured
  // by RD4 and RD5, where the VALUE goes away. Not by the next question.
  it('both rows stay, because both bounds are still filtering', async () => {
    await mount()
    await askEdge('float under 5 million')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))

    await askEdge('rvol under 3')

    await waitFor(() => expect(rangeIds()).toEqual(['float', 'rvol']))
    // AAAA is the only float under five million and its rvol is one, so the
    // COMPOSED ask keeps exactly it. Both rows are on screen because both
    // bounds are still biting -- which is the reason neither may be retired.
    expect(rowCount()).toBe(1)
  })

  it('and ONE Clear retires both, since Edge installed both', async () => {
    await mount()
    await askEdge('float under 5 million')
    await askEdge('rvol under 3')
    await waitFor(() => expect(rangeIds()).toEqual(['float', 'rvol']))

    clearAll()

    await waitFor(() => expect(rangeIds(), 'an Edge range outlived its value').toEqual([]))
    expect(rowCount()).toBe(BOOK.length)
  })
})

// ─── RD8 ─────────────────────────────────────────────────────────────────────

describe('RD8 reconcile lives in ONE funnel', () => {
  const src = (p: string) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node:fs').readFileSync(p, 'utf8') as string
  }

  it('the page calls reconcile exactly once', () => {
    const page = src('src/pages/Trades.tsx')
    const calls = page.match(/reconcileRangeChoices\(/g) ?? []
    expect(calls.length, `reconcile is called ${calls.length} times, not once`).toBe(1)
  })

  it('and the R13 expiry rule is nowhere but the prefs module', () => {
    // If "not active means expire" is written anywhere else, the two copies
    // drift and a range dies in one path and lives in another.
    const page = src('src/pages/Trades.tsx')
    const bar = src('src/components/trades/TradesFilters.tsx')
    for (const [name, text] of [['Trades.tsx', page], ['TradesFilters.tsx', bar]] as const) {
      expect(text, `${name} decides range expiry itself`).not.toContain('isRangeActive')
    }
  })
})
