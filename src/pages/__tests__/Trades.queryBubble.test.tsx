// @vitest-environment jsdom
// v0.2.7 — THE BUBBLE. The resolver gets a face on the Trades page.
//
// THE RULINGS, pinned here through the real page:
//   B1  LIVE CANDIDATE — typing resolves continuously into a candidate state;
//       the table and the header count render the candidate live.
//   B2  ESCAPE RESTORES the state captured at open, byte-equal. Enter and
//       click-away COMMIT. Either way the bubble closes.
//   B3  AMBIGUITY IS OFFERED — candidates listed, click picks. The core never
//       chooses and the UI never auto-picks.
//   B4  UNRESOLVED IS SHOWN, verbatim, muted, no error tone. The seam.
//
// The harness is the range-ungate page harness: real TradesFilters, real
// QueryBubble, real resolver, stub table exposing the live row count.

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import { makeSettingsPayload } from '@/test/fixtures/settings'
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

/** Four trades, hand-arithmetic: chinese losers = [2] (1 row); losers = [2,4]
 *  (2); prefix "as" hits ASTC and ASND. */
const BOOK: TradeListRow[] = [
  makeTrade({ id: 1, symbol: 'ASTC', region: 'USA', country: 'US', country_name: 'United States', net_pnl: 60 } as Partial<TradeListRow>),
  makeTrade({ id: 2, symbol: 'AZI', region: 'China', country: 'CN', country_name: 'China', net_pnl: -80 } as Partial<TradeListRow>),
  makeTrade({ id: 3, symbol: 'RYOJ', region: 'China', country: 'CN', country_name: 'China', net_pnl: 45 } as Partial<TradeListRow>),
  makeTrade({ id: 4, symbol: 'ASND', region: 'USA', country: 'US', country_name: 'United States', net_pnl: -20 } as Partial<TradeListRow>),
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
afterEach(() => cleanup())

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
const bubbleInput = () => screen.queryByLabelText('Ask Edge')
const openByShortcut = () => fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

// ─── K1 ──────────────────────────────────────────────────────────────────────

describe('K1 the bubble opens by shortcut and by button, input autofocused', () => {
  it('Ctrl+K opens and focuses', async () => {
    await mount()
    expect(bubbleInput()).toBeNull()
    openByShortcut()
    const input = bubbleInput()
    expect(input, 'the shortcut did not open the bubble').toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(input))
  })

  it('the floating Edge trigger opens identically', async () => {
    await mount()
    // The trigger must EXIST and be VISIBLE — a hidden button still fires
    // onClick in jsdom (the beat-46 falsification lesson).
    const btn = screen.getByTitle(/Edge/) as HTMLButtonElement
    expect(btn.hidden, 'the trigger is hidden from the user').toBe(false)
    fireEvent.click(btn)
    const input = bubbleInput()
    expect(input, 'the button did not open the bubble').toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(input))
  })

  it('and Cmd+K (metaKey) works the same way', async () => {
    await mount()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(bubbleInput()).toBeTruthy()
  })
})

// ─── K2 — the live candidate ─────────────────────────────────────────────────

describe('K2 typing applies to the candidate and the count is live', () => {
  it('"chinese losers" narrows the live table to the hand-computed one row', async () => {
    await mount()
    expect(rowCount()).toBe(4)
    openByShortcut()
    fireEvent.change(bubbleInput()!, { target: { value: 'chinese losers' } })
    await waitFor(() => expect(rowCount(), 'the table did not render the candidate').toBe(1))
  })
})

// ─── K3 — Escape restores ────────────────────────────────────────────────────

describe('K3 Escape restores the open snapshot, byte-equal', () => {
  it('the narrowing vanishes and the stored prefs never moved', async () => {
    await mount()
    const before = JSON.stringify(readTradesFilters('all'))
    openByShortcut()
    fireEvent.change(bubbleInput()!, { target: { value: 'chinese losers' } })
    await waitFor(() => expect(rowCount()).toBe(1))

    fireEvent.keyDown(bubbleInput()!, { key: 'Escape' })
    expect(bubbleInput(), 'Escape did not close the bubble').toBeNull()
    await waitFor(() => expect(rowCount(), 'Escape did not restore the table').toBe(4))
    expect(JSON.stringify(readTradesFilters('all')), 'Escape leaked into the prefs').toBe(before)
  })
})

// ─── K4 — Enter commits ──────────────────────────────────────────────────────

describe('K4 Enter commits, and the commit survives the prefs write path', () => {
  it('the narrowing stays and the stored blob carries it', async () => {
    await mount()
    openByShortcut()
    fireEvent.change(bubbleInput()!, { target: { value: 'chinese losers' } })
    await waitFor(() => expect(rowCount()).toBe(1))

    fireEvent.keyDown(bubbleInput()!, { key: 'Enter' })
    expect(bubbleInput()).toBeNull()
    expect(rowCount()).toBe(1)
    await waitFor(() => {
      const stored = readTradesFilters('all')
      expect(stored.regions, 'the commit never reached the prefs').toEqual(['China'])
      expect(stored.outcome).toBe('losers')
    })
  })
})

// ─── K5 — ambiguity offered ──────────────────────────────────────────────────

describe('K5 a colliding prefix lists both candidates and applies neither', () => {
  it('"as" offers ASTC and ASND; the click applies the pick', async () => {
    await mount()
    openByShortcut()
    fireEvent.change(bubbleInput()!, { target: { value: 'as' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ASTC' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'ASND' })).toBeTruthy()
    })
    expect(rowCount(), 'an ambiguous token narrowed the table').toBe(4)

    fireEvent.click(screen.getByRole('button', { name: 'ASTC' }))
    await waitFor(() => expect(rowCount()).toBe(1))
  })
})

// ─── K6 — the seam ───────────────────────────────────────────────────────────

describe('K6 unresolved text renders verbatim', () => {
  it('gibberish is named, not swallowed and not an error', async () => {
    await mount()
    openByShortcut()
    fireEvent.change(bubbleInput()!, { target: { value: 'qwzzk blorp' } })
    await waitFor(() => expect(screen.getByText(/qwzzk blorp/)).toBeTruthy())
    expect(rowCount()).toBe(4)
  })
})

// ─── K7 — chips ──────────────────────────────────────────────────────────────

describe('K7 removing a chip recomputes', () => {
  it('dropping the region chip widens back to all losers', async () => {
    await mount()
    openByShortcut()
    fireEvent.change(bubbleInput()!, { target: { value: 'chinese losers' } })
    await waitFor(() => expect(rowCount()).toBe(1))

    fireEvent.click(screen.getByRole('button', { name: /remove region China/i }))
    await waitFor(() => expect(rowCount(), 'the removal did not recompute').toBe(2))
  })
})

// ─── K8 — Escape touches nothing beneath ─────────────────────────────────────

describe('K8 with the bubble open, Escape closes the bubble ONLY', () => {
  it('nothing beneath sees the keydown; a second Escape changes nothing further', async () => {
    await mount()
    const probe = vi.fn()
    document.addEventListener('keydown', probe)
    try {
      openByShortcut()
      fireEvent.change(bubbleInput()!, { target: { value: 'chinese losers' } })
      await waitFor(() => expect(rowCount()).toBe(1))
      probe.mockClear()

      fireEvent.keyDown(bubbleInput()!, { key: 'Escape' })
      expect(bubbleInput()).toBeNull()
      expect(probe, 'the Escape leaked to a document listener beneath the bubble').not.toHaveBeenCalled()

      fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(bubbleInput(), 'a second Escape re-opened or moved something').toBeNull()
      await waitFor(() => expect(rowCount()).toBe(4))
    } finally {
      document.removeEventListener('keydown', probe)
    }
  })
})

// ─── N1-N4 — Edge, the presence ───────────────────────────────────────────────

describe('N1 one presence, one shortcut', () => {
  it('the filter-bar ASK button is RETIRED; the floating trigger is the one opener', async () => {
    await mount()
    // by the OLD title exactly — the new trigger's title also says what it does
    expect(screen.queryByTitle('Ask your book (Ctrl+K)'), 'the old bar button survived').toBeNull()
    const triggers = screen.getAllByTitle(/Edge/)
    expect(triggers).toHaveLength(1)
    fireEvent.click(triggers[0])
    expect(bubbleInput()).toBeTruthy()
  })
})

describe('N2 greeting on open; the log appends on COMMIT only', () => {
  it('a preview followed by Escape leaves the log untouched; a commit logs the exchange', async () => {
    await mount()
    openByShortcut()
    expect(screen.getByText(/china losers/), 'no greeting taught the grammar').toBeTruthy()
    expect(screen.getByText(/Hi, I'm/), 'the greeting lost its salutation').toBeTruthy()
    // the name appears at least twice: the wordmark and the greeting, both from the constant
    expect(screen.getAllByText('Edge').length).toBeGreaterThanOrEqual(2)

    fireEvent.change(bubbleInput()!, { target: { value: 'chinese losers' } })
    await waitFor(() => expect(rowCount()).toBe(1))
    fireEvent.keyDown(bubbleInput()!, { key: 'Escape' })

    openByShortcut()
    expect(screen.queryByText('chinese losers', { selector: '[data-edge-ask]' }), 'a PREVIEW was logged').toBeNull()

    fireEvent.change(bubbleInput()!, { target: { value: 'chinese losers' } })
    await waitFor(() => expect(rowCount()).toBe(1))
    fireEvent.keyDown(bubbleInput()!, { key: 'Enter' })

    openByShortcut()
    const ask = screen.getByText('chinese losers', { selector: '[data-edge-ask]' })
    expect(ask, 'the committed ask was not logged verbatim').toBeTruthy()
    expect(screen.getByText(/1 trade/), 'the response line lacks the count').toBeTruthy()
  })
})

describe('N3 no fake latency', () => {
  it('local resolution renders with timers FROZEN — nothing waits on a timer', async () => {
    await mount()
    openByShortcut()
    vi.useFakeTimers()
    try {
      fireEvent.change(bubbleInput()!, { target: { value: 'chinese' } })
      // No timer advance, no waitFor: the chip and the live count are
      // already rendered, or something gated rendering on a timer.
      expect(rowCount(), 'the candidate waited on a timer').toBe(2)
      expect(screen.getByText(/region China/i)).toBeTruthy()
      expect(screen.queryByText(/working/i), 'a fake working state rendered locally').toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('N4 preview consistency — the frame-caught header fix', () => {
  it('during a preview EVERY header number derives from the candidate; Escape returns all to committed', async () => {
    await mount()
    const subtitle = () => screen.getByText(/round trip|of/).closest('div')!.textContent!.replace(/\s+/g, ' ')
    expect(subtitle()).toMatch(/4 round trips/)

    openByShortcut()
    fireEvent.change(bubbleInput()!, { target: { value: 'chinese losers' } })
    await waitFor(() => expect(rowCount()).toBe(1))
    // the exact frame-03 defect: the total branch read the COMMITTED state
    // while won/lost read the candidate — "528 round trips · 31 won · 28 lost"
    expect(subtitle(), 'the header mixed branches during a preview').toMatch(/1 of 4 trades/)
    expect(subtitle()).toMatch(/0 won/)
    expect(subtitle()).toMatch(/1 lost/)

    fireEvent.keyDown(bubbleInput()!, { key: 'Escape' })
    await waitFor(() => expect(rowCount()).toBe(4))
    expect(subtitle()).toMatch(/4 round trips/)
    expect(subtitle()).toMatch(/2 won/)
    expect(subtitle()).toMatch(/2 lost/)
  })
})

// ─── M1/M2/M4 — the skin guards that survive a re-skin ───────────────────────

describe('M1 content-first: the chip and count exist the same tick as resolution', () => {
  it('with timers frozen and animations still attached, the answer is already there', async () => {
    await mount()
    openByShortcut()
    vi.useFakeTimers()
    try {
      fireEvent.change(bubbleInput()!, { target: { value: 'chinese' } })
      expect(rowCount(), 'the count waited on something').toBe(2)
      expect(screen.getByText(/region China/i), 'the chip waited on something').toBeTruthy()
      // and the motion layer is genuinely present — this is not the reduced path
      expect(
        document.querySelectorAll('[data-edge-anim]').length,
        'no animation layer present - M1 would prove nothing',
      ).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('M2 reduced motion: every state renders with zero animation hooks', () => {
  it('under prefers-reduced-motion the skin strips itself', async () => {
    const orig = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({
        matches: q.includes('prefers-reduced-motion'),
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    try {
      await mount()
      openByShortcut()
      fireEvent.change(bubbleInput()!, { target: { value: 'chinese' } })
      await waitFor(() => expect(rowCount()).toBe(2))
      expect(screen.getByText(/region China/i), 'reduced motion lost the content').toBeTruthy()
      expect(
        document.querySelectorAll('[data-edge-anim]').length,
        'animation hooks rendered under reduced motion',
      ).toBe(0)
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: orig })
    }
  })
})

describe('M4 no animation timer delays input focus on open', () => {
  it('the input holds focus in the same tick, timers frozen', async () => {
    await mount()
    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByTitle(/Edge/))
      const input = bubbleInput()
      expect(input).toBeTruthy()
      expect(document.activeElement, 'focus waited on a timer').toBe(input)
    } finally {
      vi.useRealTimers()
    }
  })
})

// ─── S1/S2 — the premium surface and the mark ────────────────────────────────

describe('S1 the blue-slate is gone - the bubble wears the house card language', () => {
  it('no bg-bg-1/bg-bg-3/border-border-* class survives anywhere in the bubble', async () => {
    await mount()
    openByShortcut()
    fireEvent.change(bubbleInput()!, { target: { value: 'chinese' } })
    await waitFor(() => expect(rowCount()).toBe(2))
    const root = screen.getByTitle(/Edge/).closest('.fixed') as HTMLElement
    const offenders = [...root.querySelectorAll('*'), root].filter((el) =>
      /(?:^|\s)(?:bg-bg-[13]|bg-bg-[13]\/|border-border-)/.test(el.className?.toString?.() ?? ''),
    )
    expect(
      offenders.map((el) => el.className.toString()).join(' | '),
      'blue-slate classes survive in the bubble',
    ).toBe('')
    // and the panel positively wears the house card language
    expect(root.querySelector('.card-premium'), 'the panel does not wear card-premium').toBeTruthy()
  })
})

describe('S2 the mark renders from the constant', () => {
  it('the FAB carries data-edge-mark equal to EDGE_MARK, with an svg mark inside', async () => {
    const { EDGE_MARK } = await import('@/components/trades/QueryBubble')
    await mount()
    const fab = screen.getByTitle(/Edge/) as HTMLButtonElement
    expect(fab.getAttribute('data-edge-mark'), 'the mark bypassed the constant').toBe(EDGE_MARK)
    expect(fab.querySelector('svg'), 'no mark rendered').toBeTruthy()
  })
})
