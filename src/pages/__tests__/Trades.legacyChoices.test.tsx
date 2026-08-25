// @vitest-environment jsdom
//
// v0.2.7 — THE LEGACY BLOB. Written RED, before the flip.
//
// The chooser's first version stored a choice as a bare boolean. Provenance
// arrived a beat later and had to decide what an unstamped `true` means. It
// guessed 'user', on the reasoning that preserving too much is recoverable by
// unticking while discarding is not — and that reasoning assumed a shipped key
// with real users. It is one dev profile, and the guess is what leaves a stale
// FLOAT row that Clear will not touch.
//
// THE RULINGS:
//   R17 AN UNSTAMPED LEGACY CHOICE READS AS 'auto'. We cannot know who chose
//       it. Guessing auto costs one re-tick; guessing user leaves a row
//       removable only by hunting the menu. Self-cleaning beats sticky when the
//       answer is unknowable.
//   R20 A GENUINE 'user' STAMP STILL SURVIVES CLEAR. The flip must not flatten
//       everything to auto, and these guards must be able to DISAGREE about
//       that — RE1 and RE3 are the pair that proves it.
//   R21 A RANGE THAT IS ACTIVELY FILTERING KEEPS ITS CONTROL. The stale row
//       goes because its value is gone, not because it was installed by a
//       machine. A legacy choice whose range still bites stays on screen.
//
// BEAT 77 MEASURED THIS BRANCH AT ZERO COVERAGE: written, reasoned about in
// prose, never once exercised. Every readRangeChoices assertion in the tree ran
// against a blob this build had just written. That is why the flip gets a suite
// rather than a one-line edit.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { readTradesFilters, writeTradesFilters } from '@/lib/prefs/tradesFilters'
import { emptyFilters } from '@/core/trades/tradesFilter'
import { RANGE_CHOICE_PREFS_KEY, readRangeChoices } from '@/lib/prefs/rangeChoices'

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

/** Write a raw blob under the chooser key, exactly as an older build left it. */
const seedRaw = (blob: unknown) =>
  window.localStorage.setItem(RANGE_CHOICE_PREFS_KEY, JSON.stringify(blob))

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

async function askEdge(text: string) {
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  const input = await waitFor(() => screen.getByLabelText('Ask Edge'))
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

const clearAll = () => fireEvent.click(screen.getByText('Clear'))

// ─── RE1 ─────────────────────────────────────────────────────────────────────

describe('RE1 a legacy true reads as AUTO', () => {
  it('float is chosen', () => {
    seedRaw({ float: true })
    expect(readRangeChoices().float, 'a legacy stamp was dropped entirely').toBeTruthy()
  })

  it('and its provenance is auto, not user', () => {
    seedRaw({ float: true })
    expect(
      readRangeChoices().float,
      'an unstamped choice claims to be the user’s doing',
    ).toBe('auto')
  })

  it('a whole legacy map converts, every true alike', () => {
    seedRaw({ float: true, net_pnl: true, rvol: false })
    const c = readRangeChoices()
    expect(c.float).toBe('auto')
    expect(c.net_pnl).toBe('auto')
  })
})

// ─── RE2 ─────────────────────────────────────────────────────────────────────

describe('RE2 a legacy false is UNCHOSEN', () => {
  it('float is absent, not stored as some off marker', () => {
    seedRaw({ float: false })
    expect(readRangeChoices().float).toBeUndefined()
  })

  it('and the map carries no entry for it at all', () => {
    seedRaw({ float: false, net_pnl: false })
    expect(Object.keys(readRangeChoices())).toEqual([])
  })
})

// ─── RE3 : THE DISCRIMINATING COMPANION ──────────────────────────────────────

describe('RE3 a real user stamp is still user', () => {
  // RE1 and RE3 must be able to DISAGREE. Flipping the legacy branch back to
  // 'user' reddens RE1 and leaves this green; flattening everything to 'auto'
  // reddens this and leaves RE1 green. A change that satisfied both regardless
  // would mean the pair proves nothing.
  it('a stamped user survives the read unchanged', () => {
    seedRaw({ float: 'user' })
    expect(readRangeChoices().float, 'the flip flattened a real tick to auto').toBe('user')
  })

  it('a stamped auto survives the read unchanged', () => {
    seedRaw({ float: 'auto' })
    expect(readRangeChoices().float).toBe('auto')
  })

  it('a mixed blob keeps both apart', () => {
    seedRaw({ float: 'user', net_pnl: 'auto', shares: true })
    const c = readRangeChoices()
    expect(c.float).toBe('user')
    expect(c.net_pnl).toBe('auto')
    expect(c.shares, 'the legacy entry did not convert').toBe('auto')
  })
})

// ─── RE4 : THE SHAPE OF THE REPORT ───────────────────────────────────────────

describe('RE4 a legacy float retires the way Edge-installed ones do', () => {
  it('an Edge range on a legacy float is GONE from the state after Clear', async () => {
    seedRaw({ float: true })
    await mount()

    await askEdge('float under 5 million')
    await waitFor(() => expect(rowCount()).toBe(1))
    expect(rangeIds()).toEqual(['float'])

    clearAll()

    // THE STATE, not only the strip. A hidden key and a deleted one look the
    // same on screen and behave nothing alike.
    await waitFor(() =>
      expect(
        readTradesFilters('all').ranges.float,
        'the range was hidden rather than removed',
      ).toBeUndefined(),
    )
    expect(rangeIds(), 'a legacy stamp kept its row through Clear').toEqual([])
    expect(rowCount()).toBe(BOOK.length)
  })

  it('and a legacy float with NO value retires on the very first mount', async () => {
    // This is the founder's actual complaint: an empty FLOAT pair sitting on the
    // strip from a query long since cleared. Nothing is filtering, so nothing
    // earns the row.
    seedRaw({ float: true })
    await mount()
    await waitFor(() => expect(rangeIds(), 'the stale row survived the mount').toEqual([]))
  })

  it('but a legacy float that IS still filtering keeps its row (R21)', async () => {
    // The retirement is about the VALUE, never about who installed it. A legacy
    // choice whose range still bites must stay on screen — suppressing it would
    // hide a live filter, which is the trap this whole area exists to prevent.
    seedRaw({ float: true })
    writeTradesFilters('all', {
      ...emptyFilters(),
      ranges: { float: { min: null, max: 5_000_000 } },
    })
    await mount()
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    expect(rowCount(), 'the surviving row was not actually filtering').toBe(1)
  })
})

// ─── RE5 : THE MIRROR ────────────────────────────────────────────────────────

describe('RE5 a menu tick still survives the same Clear', () => {
  it('the box stays, rendered and empty', async () => {
    await mount()
    tickInMenu('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    fireEvent.change(screen.getByLabelText('Float maximum'), { target: { value: '5000000' } })
    await waitFor(() => expect(rowCount()).toBe(1))

    clearAll()

    await waitFor(() => expect(rowCount()).toBe(BOOK.length))
    expect(rangeIds(), 'the flip made every choice ephemeral').toEqual(['float'])
    expect((screen.getByLabelText('Float maximum') as HTMLInputElement).value).toBe('')
  })

  it('and it is still stamped user in storage', async () => {
    await mount()
    tickInMenu('float')
    await waitFor(() => expect(rangeIds()).toEqual(['float']))
    expect(readRangeChoices().float).toBe('user')
  })
})
