// @vitest-environment jsdom
// v0.2.7 — FILTERING AND DISPLAY ARE SEPARATE CONCERNS.
//
// MEASURED, before this beat: 21 numeric columns have working range filters
// and rangeValueOf handles all 21 — but Trades.tsx gated the range INPUTS on
// column visibility, and 16 of the 21 are hidden by default. Float, RVOL, MAE,
// MFE, R-multiple, hold time, day change, confidence and eight more were built,
// tested, reachable by applyTradesFilters, and impossible to set.
//
// Worse, hiding a column DESTROYED any range already set on it. The stated
// reason was sound on its own terms — "a filter still narrowing the table from
// a control the user can no longer see is a trap" — but the premise is what was
// wrong. The control does not live in the table. It lives in the filter bar,
// which is a different surface with its own visibility.
//
// So: the range strip stops asking the table what it is showing. A column's
// presence in the TABLE and a column's availability as a FILTER are two
// questions, and only the second one belongs to the filter bar.

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { NUMERIC_COLUMN_IDS } from '@/lib/prefs/columns'
import { readTradesFilters } from '@/lib/prefs/tradesFilters'

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

// The table is stubbed, but it SURFACES the visibility callback so the
// clear-on-hide wiring is exercised through the real page.
vi.mock('@/components/trades/TradesTable', () => ({
  default: (p: {
    trades: TradeListRow[]
    columnVisibility: Record<string, boolean>
    onColumnVisibilityChange: (n: Record<string, boolean>) => void
  }) => (
    <div data-testid="table-stub">
      <span data-testid="row-count">{p.trades.length}</span>
      <button
        type="button"
        onClick={() => p.onColumnVisibilityChange({ ...p.columnVisibility, float: false })}
      >
        hide-float
      </button>
      <button
        type="button"
        onClick={() => p.onColumnVisibilityChange({ ...p.columnVisibility, float: true })}
      >
        show-float
      </button>
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

// Floats chosen so a 5M..50M range keeps exactly one of the three.
const BOOK: TradeListRow[] = [
  makeTrade({ id: 1, symbol: 'AAAA', float_shares: 2_000_000, rvol: 1, mae: -10, r_multiple: 0.5 } as Partial<TradeListRow>),
  makeTrade({ id: 2, symbol: 'BBBB', float_shares: 20_000_000, rvol: 5, mae: -50, r_multiple: 2.5 } as Partial<TradeListRow>),
  makeTrade({ id: 3, symbol: 'CCCC', float_shares: 900_000_000, rvol: 9, mae: -90, r_multiple: 4.5 } as Partial<TradeListRow>),
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

// ─── U1 ──────────────────────────────────────────────────────────────────────

describe('U1 a range on a HIDDEN column can be set, and it filters', () => {
  it('float is hidden by default, and its range input is still there', async () => {
    await mount()
    // float: false is in DEFAULT_COLUMN_VISIBILITY — the column is NOT in the
    // table, which must not stop the user filtering on it.
    const min = screen.getByLabelText('Float minimum')
    expect(min, 'no range input for a hidden column').toBeTruthy()

    fireEvent.change(min, { target: { value: '5000000' } })
    fireEvent.change(screen.getByLabelText('Float maximum'), { target: { value: '50000000' } })

    await waitFor(() => expect(rowCount()).toBe(1))
  })
})

// ─── U2 ──────────────────────────────────────────────────────────────────────

describe('U2 every one of the 21 numeric columns can carry a range', () => {
  it('all 21 render an input pair regardless of default visibility', async () => {
    await mount()
    const missing: string[] = []
    for (const id of NUMERIC_COLUMN_IDS) {
      if (!screen.queryByTestId(`range-${id}`)) missing.push(id)
    }
    expect(missing, `columns with no range input: ${missing.join(', ')}`).toEqual([])
    // NOT /^range-/ — that also matches the strip's own `range-filters`
    // container testid, which made this read 22.
    const groups = screen.getAllByTestId(/^range-/).filter(
      (el) => el.getAttribute('data-testid') !== 'range-filters',
    )
    expect(groups.length).toBe(NUMERIC_COLUMN_IDS.length)
  })
})

// ─── U3 ──────────────────────────────────────────────────────────────────────

describe('U3 hiding a column does NOT destroy a range set on it', () => {
  it('the range survives the column being hidden, and keeps filtering', async () => {
    await mount()
    fireEvent.change(screen.getByLabelText('Float minimum'), { target: { value: '5000000' } })
    fireEvent.change(screen.getByLabelText('Float maximum'), { target: { value: '50000000' } })
    await waitFor(() => expect(rowCount()).toBe(1))

    // The user hides the float COLUMN. They did not ask to stop filtering.
    fireEvent.click(screen.getByText('hide-float'))

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Float minimum') as HTMLInputElement).value,
        'hiding the column wiped the range',
      ).toBe('5000000')
    })
    expect(rowCount(), 'the filter stopped applying when the column was hidden').toBe(1)
  })

  it('and showing it again changes nothing further', async () => {
    await mount()
    fireEvent.change(screen.getByLabelText('Float minimum'), { target: { value: '5000000' } })
    await waitFor(() => expect(rowCount()).toBe(2))
    fireEvent.click(screen.getByText('hide-float'))
    fireEvent.click(screen.getByText('show-float'))
    await waitFor(() =>
      expect((screen.getByLabelText('Float minimum') as HTMLInputElement).value).toBe('5000000'),
    )
    expect(rowCount()).toBe(2)
  })
})

// ─── C3 ──────────────────────────────────────────────────────────────────────

describe('C3 a range on a hidden column survives a restart', () => {
  it('the persisted blob round-trips it, and the remount still filters', async () => {
    await mount()
    fireEvent.change(screen.getByLabelText('Float minimum'), { target: { value: '5000000' } })
    fireEvent.change(screen.getByLabelText('Float maximum'), { target: { value: '50000000' } })
    await waitFor(() => expect(rowCount()).toBe(1))
    // the page persists the DEFERRED state, so let the write settle
    await waitFor(() =>
      expect(readTradesFilters('all').ranges.float).toEqual({ min: 5_000_000, max: 50_000_000 }),
    )

    // restart: same storage, fresh mount
    cleanup()
    await mount()
    expect(
      (screen.getByLabelText('Float minimum') as HTMLInputElement).value,
      'the stored range did not come back',
    ).toBe('5000000')
    await waitFor(() => expect(rowCount()).toBe(1))
  })
})
