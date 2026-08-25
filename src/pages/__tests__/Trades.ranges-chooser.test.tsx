// @vitest-environment jsdom
//
// v0.2.7 — THE RANGES CHOOSER. Written RED, before the feature.
//
// The ungate beat made all twenty-four ranges reachable, which was right and
// which put twenty-four input pairs on the Trades tab permanently. Edge exists
// so that clutter is not the price of reach: the ranges you want are switched
// on, and everyone else asks in words.
//
// THE RULINGS these guards enforce, numbered as the founder gave them:
//   R1 Unchoosing DELETES the key from filters.ranges. Not hides — deletes.
//      applyRanges iterates the STATE's own keys (numericRange.ts:62), so a
//      hidden-but-present key would filter with no control on screen. Deleting
//      is the only path that leaves the filter engine untouched; teaching
//      applyRanges about the chosen set would put the decision in two places.
//   R2 The chooser persists GLOBALLY, one key, like COLUMNS — not per-account
//      like the filters. Which inputs are on screen is layout; what is typed
//      into them is already per-account.
//   R3 DEFAULT IS ZERO CHOSEN. A fresh install renders no range inputs.
//   R4 RESET restores exactly six: float, net_pnl, pnl_gain_pct, shares,
//      hold_time, first_entry — chosen on coverage, every one 521/528 or
//      better on the real book, so none silently drops rows.
//   R6 MIGRATION: on first run under this build, any range ALREADY HOLDING A
//      VALUE is auto-chosen. Nobody loses a filter they set. Once.
//   R7 EDGE AUTO-CHOOSES. A range Edge commits on an unchosen id becomes
//      chosen — an Edge-set range is never invisible.
//
// RC3 IS THE ONE THAT MATTERS. It asserts on filters.ranges itself and on the
// row count, never on the DOM alone: a DOM-only assertion cannot tell a
// deleted key from a hidden one, and hidden is the failure mode.

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { readTradesFilters, writeTradesFilters } from '@/lib/prefs/tradesFilters'
import { emptyFilters } from '@/core/trades/tradesFilter'
import { RESET_RANGE_IDS, RANGE_CHOICE_PREFS_KEY } from '@/lib/prefs/rangeChoices'

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

// Floats chosen so a 5M..50M window keeps exactly one of the three.
const BOOK: TradeListRow[] = [
  makeTrade({ id: 1, symbol: 'AAAA', float_shares: 2_000_000 } as Partial<TradeListRow>),
  makeTrade({ id: 2, symbol: 'BBBB', float_shares: 20_000_000 } as Partial<TradeListRow>),
  makeTrade({ id: 3, symbol: 'CCCC', float_shares: 900_000_000 } as Partial<TradeListRow>),
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

/** Every rendered range pair, excluding the strip's own container testid. */
const rangeGroups = () =>
  Array.from(document.querySelectorAll('[data-testid^="range-"]')).filter(
    (el) => el.getAttribute('data-testid') !== 'range-filters',
  )

const rangeIds = () =>
  rangeGroups().map((el) => el.getAttribute('data-testid')!.replace('range-', '')).sort()

function toggleChoice(id: string) {
  fireEvent.click(screen.getByTestId('ranges-button'))
  fireEvent.click(screen.getByTestId(`choose-range-${id}`).querySelector('input')!)
  fireEvent.click(screen.getByTestId('ranges-button'))
}

// ─── RC1 ─────────────────────────────────────────────────────────────────────

describe('RC1 a fresh profile renders ZERO range inputs', () => {
  it('no range pair is on screen', async () => {
    await mount()
    expect(rangeIds(), `a fresh profile rendered ranges: ${rangeIds().join(', ')}`).toEqual([])
  })

  it('and the strip container itself is absent, not merely empty', async () => {
    await mount()
    expect(screen.queryByTestId('range-filters')).toBeNull()
  })

  it('but the chooser is there to switch them on', async () => {
    await mount()
    expect(screen.getByTestId('ranges-button')).toBeTruthy()
  })

  it('and it offers all twenty-four, including the three absent from the column registry', async () => {
    await mount()
    fireEvent.click(screen.getByTestId('ranges-button'))
    for (const id of ['market_cap', 'vwap_dist_pct', 'ema9_dist_pct']) {
      expect(screen.getByTestId(`choose-range-${id}`), `${id} is not offered`).toBeTruthy()
    }
    expect(document.querySelectorAll('[data-testid^="choose-range-"]').length).toBe(24)
  })
})

// ─── RC2 ─────────────────────────────────────────────────────────────────────

describe('RC2 choosing float renders exactly one pair', () => {
  it('one group, and it is float', async () => {
    await mount()
    toggleChoice('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
  })

  it('labelled Float, with both inputs', async () => {
    await mount()
    toggleChoice('float')
    await waitFor(() => expect(screen.getByLabelText('Float minimum')).toBeTruthy())
    expect(screen.getByLabelText('Float maximum')).toBeTruthy()
  })

  it('and it filters', async () => {
    await mount()
    toggleChoice('float')
    await waitFor(() => expect(screen.getByLabelText('Float minimum')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Float minimum'), { target: { value: '5000000' } })
    fireEvent.change(screen.getByLabelText('Float maximum'), { target: { value: '50000000' } })
    await waitFor(() => expect(rowCount()).toBe(1))
  })
})

// ─── RC3 ─────────────────────────────────────────────────────────────────────

describe('RC3 unchoosing a range that holds a value DELETES the key', () => {
  it('the key is GONE from filters.ranges, not merely unrendered', async () => {
    await mount()
    toggleChoice('float')
    await waitFor(() => expect(screen.getByLabelText('Float minimum')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Float minimum'), { target: { value: '5000000' } })
    await waitFor(() => expect(readTradesFilters('all').ranges.float).toBeTruthy())

    toggleChoice('float')

    // The DOM half would pass for a HIDE. This is the half that cannot.
    await waitFor(() =>
      expect(
        readTradesFilters('all').ranges.float,
        'the range was hidden, not deleted -- it is still in the state and still filtering',
      ).toBeUndefined(),
    )
  })

  it('and the row count RETURNS to unfiltered', async () => {
    await mount()
    toggleChoice('float')
    await waitFor(() => expect(screen.getByLabelText('Float minimum')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Float minimum'), { target: { value: '5000000' } })
    fireEvent.change(screen.getByLabelText('Float maximum'), { target: { value: '50000000' } })
    await waitFor(() => expect(rowCount()).toBe(1))

    toggleChoice('float')

    await waitFor(() =>
      expect(rowCount(), 'a hidden range kept narrowing the book').toBe(BOOK.length),
    )
  })

  it('and its input is gone from the strip', async () => {
    await mount()
    toggleChoice('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    toggleChoice('float')
    await waitFor(() => expect(rangeIds()).toEqual([]))
  })
})

// ─── RC4 ─────────────────────────────────────────────────────────────────────

describe('RC4 reset restores exactly the six', () => {
  it('no more, no fewer', async () => {
    await mount()
    toggleChoice('rvol')
    await waitFor(() => expect(rangeIds()).toEqual(['rvol']))

    fireEvent.click(screen.getByTestId('ranges-button'))
    fireEvent.click(screen.getByTestId('ranges-reset'))

    await waitFor(() => expect(rangeIds()).toEqual([...RESET_RANGE_IDS].sort()))
  })

  it('the six are the coverage six, named', async () => {
    expect([...RESET_RANGE_IDS].sort()).toEqual(
      ['first_entry', 'float', 'hold_time', 'net_pnl', 'pnl_gain_pct', 'shares'].sort(),
    )
  })

  it('and reset is NOT the initial state -- a fresh profile is still empty', async () => {
    await mount()
    expect(rangeIds()).toEqual([])
  })
})

// ─── RC5 ─────────────────────────────────────────────────────────────────────

describe('RC5 the choice is GLOBAL and survives a remount', () => {
  it('it comes back after a restart', async () => {
    await mount()
    toggleChoice('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))

    cleanup()
    await mount()
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
  })

  it('and switching account scope does NOT change it', async () => {
    await mount()
    toggleChoice('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))

    // Same storage, a DIFFERENT account scope. The filters are per-account and
    // will differ; which inputs are on screen must not.
    cleanup()
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 7 } as never))
    m.accountsList.mockResolvedValue([{ id: 7, name: 'Second', account_type: 'live' }] as never)
    await mount()
    await waitFor(() =>
      expect(rangeIds(), 'the chooser was stored per-account').toEqual(['float']),
    )
  })

  it('under ONE key that carries no account id', async () => {
    await mount()
    toggleChoice('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    expect(window.localStorage.getItem(RANGE_CHOICE_PREFS_KEY)).toBeTruthy()
    expect(RANGE_CHOICE_PREFS_KEY).not.toContain('acct')
  })
})

// ─── RC6 ─────────────────────────────────────────────────────────────────────

describe('RC6 migration auto-chooses a range that already holds a value', () => {
  it('a stored float range with NO chooser prefs comes up CHOSEN', async () => {
    writeTradesFilters('all', {
      ...emptyFilters(),
      ranges: { float: { min: 5_000_000, max: 50_000_000 } },
    })
    expect(window.localStorage.getItem(RANGE_CHOICE_PREFS_KEY)).toBeNull()

    await mount()

    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    expect(rowCount(), 'the migrated range stopped filtering').toBe(1)
  })

  it('and it is a ONE-TIME fold -- unchoosing afterwards sticks', async () => {
    writeTradesFilters('all', {
      ...emptyFilters(),
      ranges: { float: { min: 5_000_000, max: 50_000_000 } },
    })
    await mount()
    await waitFor(() => expect(rangeIds()).toEqual(['float']))

    toggleChoice('float')
    await waitFor(() => expect(rangeIds()).toEqual([]))

    cleanup()
    await mount()
    await waitFor(() => expect(screen.getByTestId('table-stub')).toBeTruthy())
    expect(rangeIds(), 'the migration re-fired and re-chose it').toEqual([])
  })

  it('an EMPTY stored range is not auto-chosen -- it holds no value', async () => {
    writeTradesFilters('all', {
      ...emptyFilters(),
      ranges: { float: { min: null, max: null } },
    })
    await mount()
    expect(rangeIds()).toEqual([])
  })
})

// ─── RC7 ─────────────────────────────────────────────────────────────────────

describe('RC7 Edge auto-chooses the id it sets a range on', () => {
  it('an Edge-set range is never invisible', async () => {
    await mount()
    expect(rangeIds()).toEqual([])

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = await waitFor(() => screen.getByLabelText('Ask Edge'))
    fireEvent.change(input, { target: { value: 'float under 5 million' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(
        rangeIds(),
        'Edge set a range on an id with no control on screen',
      ).toContain('float'),
    )
  })

  it('and the range it set is actually in the inputs', async () => {
    await mount()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = await waitFor(() => screen.getByLabelText('Ask Edge'))
    fireEvent.change(input, { target: { value: 'float under 5 million' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect((screen.getByLabelText('Float maximum') as HTMLInputElement).value).toBe('5000000'),
    )
  })
})
