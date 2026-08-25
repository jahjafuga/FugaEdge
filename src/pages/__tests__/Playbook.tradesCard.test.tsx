// @vitest-environment jsdom
//
// v0.2.7 -- THE SETUP PANEL LEARNS ITS OWN TRADES. The wiring half.
//
// FOUNDER RULINGS these guards enforce:
//   NO TABS. The trades Card sits in the right-hand stack BETWEEN the
//     performance card and the definition card -- numbers, then the trades
//     behind them, then the rules. Order asserted by DOM position, never by
//     reading text off the page.
//   PRIMARY setups only, and the panel's count must agree with the "{n}t"
//     already printed on the list row. The page half of that agreement is
//     asserted here: the trade fetch carries the SELECTED setup's id and the
//     SAME account scope the stats fetch carried.
//   All-time, no date range -- matching the stats above it, which the IPC
//     cannot carry a range for anyway.

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybookWithStats } from '@shared/playbook-types'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { makeTrade } from '@/test/fixtures/trade'

// The Proxy stub idiom (PlaybookPicker.height.test.tsx): a real vi.fn for the
// calls under test, and an auto-vivified vi.fn for anything else the page may
// reach for. A four-method literal is what made the sibling suite break the
// moment this page grew a new call; this cannot break that way again.
vi.mock('@/lib/ipc', () => {
  const base: Record<string, unknown> = {}
  return {
    ipc: new Proxy(base, {
      get(target, prop: string) {
        if (!(prop in target)) target[prop] = vi.fn(() => Promise.resolve([]))
        return target[prop]
      },
    }),
  }
})

import Playbook from '../Playbook'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

const SETUP: PlaybookWithStats = {
  id: 7,
  name: 'Micro Pullback',
  description: '',
  rules: '',
  ideal_conditions: '',
  archived: false,
  is_system: false,
  tier: 'A',
  created_at: '2026-01-01',
  stats: {
    trade_count: 3,
    net_pnl: 300,
    winners: 2,
    losers: 1,
    scratches: 0,
    win_rate: 0.667,
    profit_factor: 2,
    avg_winner: 200,
    avg_loser: -100,
    largest_winner: 220,
    largest_loser: -100,
    avg_r: null,
  },
}

const THREE = [1, 2, 3].map((id) =>
  makeTrade({ id, symbol: `SYM${id}`, playbook_id: 7, playbook_name: 'Micro Pullback' }),
)

function ScopeProbe() {
  const { setScope } = useAccountScope()
  return (
    <button type="button" onClick={() => setScope({ accountId: 'ACCT-B' })}>
      probe-pick-b
    </button>
  )
}

function mount() {
  return render(
    <MemoryRouter>
      <AccountScopeProvider>
        <ScopeProbe />
        <Playbook />
      </AccountScopeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  m.playbooksList.mockResolvedValue([SETUP])
  m.tradesList.mockResolvedValue(THREE)
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
})

afterEach(() => cleanup())

// --- G7 (INVERTED in v0.2.7 -- see the note) ---------------------------------

// PLACEMENT REVERSED, deliberately. This guard shipped asserting
// performance -> TRADES -> definition. Seeing it in the running app reversed
// the ruling: the trades now sit LAST, below the rules.
//
// The guard is INVERTED IN PLACE rather than deleted. A deleted order guard is
// how an order regression comes back silently a year later -- the assertion
// still has to hold, it just holds the other way round now.
describe('G1 the trades Card sits BELOW the definition Card', () => {
  it('the three cards render in the ruled order, by DOM position', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())

    const perf = container.querySelector('[data-playbook-performance]')!
    const trades = container.querySelector('[data-playbook-trades]')!
    const def = container.querySelector('[data-playbook-definition]')!

    // DOCUMENT_POSITION_FOLLOWING === 4: the argument comes AFTER the subject.
    expect(
      perf.compareDocumentPosition(def) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the definition card is not after the performance card',
    ).toBeTruthy()
    expect(
      def.compareDocumentPosition(trades) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the trades card is not after the definition card -- the old order is back',
    ).toBeTruthy()
    // And explicitly NOT the order this file used to assert.
    expect(
      trades.compareDocumentPosition(def) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the definition card follows the trades card -- that is the OLD placement',
    ).toBeFalsy()
  })

  it('all three are siblings in one stack -- no tab strip was introduced', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())
    const trades = container.querySelector('[data-playbook-trades]')!
    const def = container.querySelector('[data-playbook-definition]')!
    expect(trades.parentElement).toBe(def.parentElement)
    expect(
      container.querySelector('[role="tablist"]'),
      'a tab strip was added to a page ruled to have none',
    ).toBeNull()
  })
})

// --- G1 / G2 / G3 : the page fills the viewport ------------------------------

// STRUCTURAL ONLY, said plainly: jsdom has no layout engine. Nothing below
// proves a height, that anything scrolls, or that the columns are independent.
// What it pins is the class contract the recon's measurements chose -- the
// bounded grid, min-h-0 at every flex level, and the lg gate. Whether it looks
// right is answered by a click in the running app, not here.
describe('G1 the grid bounds itself to the shell region, lg only', () => {
  const grid = (c: HTMLElement) =>
    (c.querySelector('[data-playbook-performance]') as HTMLElement).closest(
      '.grid',
    ) as HTMLElement

  // A DEFINITE height, not a max-height, and that was settled by measurement
  // rather than by reading the cascade. Applying only a max-height to this grid
  // in the running app capped the GRID to 732 while both columns stayed at
  // 1225 and the shell kept 469 pixels of overflow: grid items have an
  // automatic minimum size, so they do not shrink inside a merely-capped
  // container. A definite height makes the row definite and the columns land
  // on it exactly. (max-height plus grid-template-rows minmax(0,1fr) also
  // worked; a definite height is one property instead of two.)
  it('the grid carries a viewport-derived DEFINITE height', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())
    expect(
      grid(container).className,
      'the grid is not bounded -- the shell region keeps scrolling',
    ).toMatch(/h-\[calc\(100vh-\d+px\)\]/)
  })

  it('the bound is lg-PREFIXED -- below the breakpoint one column must not be squashed', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())
    const cls = grid(container).className
    // Every height bound on this element must be behind the lg gate. min-h-0
    // is exempt: it is a zero floor, harmless at any width.
    const bare = cls
      .split(/\s+/)
      .filter((c) => /^(max-)?h-/.test(c) && c !== 'min-h-0')
    expect(
      bare,
      `an UNPREFIXED height bound applies at every width: ${bare.join(' ')}`,
    ).toEqual([])
    expect(cls, 'the bound is not lg-gated').toMatch(/\blg:h-\[calc\(100vh-\d+px\)\]/)
  })

  it('it carries a min-height floor so a short window cannot collapse it', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())
    expect(
      grid(container).className,
      'no floor -- on a short window the grid can reach zero',
    ).toMatch(/\blg:min-h-\[/)
  })

  it('and min-h-0 so its flex/grid children may shrink below content', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())
    expect(grid(container).className).toMatch(/\bmin-h-0\b/)
  })
})

describe('G2 the left column fills its own height instead of guessing one', () => {
  const leftCard = (c: HTMLElement) =>
    ((c.querySelector('[data-playbook-performance]') as HTMLElement).closest(
      '.grid',
    ) as HTMLElement).children[0] as HTMLElement

  it('the left Card is a flex column that hides its own overflow', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())
    const cls = leftCard(container).className
    expect(cls, 'the left Card is not a flex column').toMatch(/\bflex\b/)
    expect(cls).toMatch(/\bflex-col\b/)
    expect(cls, 'without overflow-hidden the Card grows past its column').toMatch(
      /\boverflow-hidden\b/,
    )
  })

  it('the SIX-HUNDRED cap is GONE from the playbook list', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())
    const ul = container.querySelector('ul') as HTMLElement
    expect(
      ul.className,
      'the guessed six-hundred cap is still there -- it must fill instead',
    ).not.toMatch(/max-h-\[600px\]/)
  })

  it('the list fills and scrolls, with min-h-0 (R4 -- the load-bearing one)', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())
    const ul = container.querySelector('ul') as HTMLElement
    expect(ul.className, 'the list does not flex to fill').toMatch(/\bflex-1\b/)
    expect(ul.className, 'min-h-0 is missing -- the inner scroll breaks').toMatch(
      /\bmin-h-0\b/,
    )
    expect(ul.className).toMatch(/\boverflow-y-auto\b/)
  })
})

describe('G3 the right stack is its own single scroll region', () => {
  const stack = (c: HTMLElement) =>
    (c.querySelector('[data-playbook-performance]') as HTMLElement)
      .parentElement as HTMLElement

  it('it scrolls vertically', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())
    expect(
      stack(container).className,
      'the right column does not own a scroll region',
    ).toMatch(/\boverflow-y-auto\b/)
  })

  it('it carries min-h-0 (R4) -- without it the column never shrinks and the scroll dies', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())
    expect(stack(container).className, 'min-h-0 is missing').toMatch(/\bmin-h-0\b/)
  })

  it('exactly ONE scroll region in the right column -- never nested', async () => {
    const { container } = mount()
    // Wait for ROWS, not merely for the card. The card renders its empty line
    // before the trades resolve, and the table wrapper only exists once there
    // are rows -- so waiting on the card alone let this assertion pass
    // vacuously against an empty panel. Caught by a plant that this guard
    // failed to catch in a full-file run while catching it in isolation.
    await waitFor(() =>
      expect(container.querySelector('[data-playbook-trades] tbody tr')).toBeTruthy(),
    )
    const scrollers = [...stack(container).querySelectorAll('*')].filter((el) =>
      /overflow-y-auto|overflow-y-scroll/.test((el as HTMLElement).className || ''),
    )
    expect(
      scrollers.length,
      `a nested vertical scroll exists inside the right column: ${scrollers
        .map((s) => (s as HTMLElement).className)
        .join(' | ')}`,
    ).toBe(0)
  })
})

// --- G4 (the page half) -----------------------------------------------------

describe('G4 the trade fetch matches the stats fetch', () => {
  it("carries the SELECTED setup's id and the same scope the stats fetch used", async () => {
    mount()
    await waitFor(() => expect(m.tradesList).toHaveBeenCalled())
    expect(m.playbooksList).toHaveBeenCalledWith({ accountScope: 'all' })
    expect(m.tradesList).toHaveBeenCalledWith({ playbookId: 7, accountScope: 'all' })
  })

  it('carries NO date range -- the panel is all-time, like the stats above it', async () => {
    mount()
    await waitFor(() => expect(m.tradesList).toHaveBeenCalled())
    const arg = m.tradesList.mock.calls[0]![0] as Record<string, unknown>
    expect(Object.keys(arg).sort()).toEqual(['accountScope', 'playbookId'])
  })

  it('a scope flip re-fetches the trades with the new scope', async () => {
    mount()
    await waitFor(() => expect(m.tradesList).toHaveBeenCalled())
    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() =>
      expect(m.tradesList).toHaveBeenLastCalledWith({
        playbookId: 7,
        accountScope: { accountId: 'ACCT-B' },
      }),
    )
  })

  it('the rows rendered equal the trade_count printed on the list row', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('[data-playbook-trades]')).toBeTruthy())
    await waitFor(() =>
      expect(container.querySelectorAll('[data-playbook-trades] tbody tr').length).toBe(3),
    )
    // The same number the setup's stats produced, which is what the list row
    // prints as "3t" beside the name.
    expect(SETUP.stats.trade_count).toBe(3)
  })
})
