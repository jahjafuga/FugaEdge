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
  it('"as" no longer collides at all, so no choice is offered', async () => {
    // REVERSED BY BEAT 152. WAS: 'as' offered ASTC and ASND and the click
    // applied the pick. At the new symbol floor of three a two-letter token
    // reaches neither ticker, so there is no collision to render. The PICK
    // MECHANISM itself is untouched and still exercised by the tests around
    // this one -- what changed is that this particular input stopped colliding.
    await mount()
    openByShortcut()
    fireEvent.change(bubbleInput()!, { target: { value: 'as' } })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'ASTC' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'ASND' })).toBeNull()
    })
    // The table is untouched either way: an offer never narrowed it, and now
    // there is no offer to click. The word comes back unread instead.
    expect(rowCount(), 'an unread token narrowed the table').toBe(4)
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

// ─── G1-G4 — the loupe and the lens-becomes-panel morph ──────────────────────

const lensGhost = () => document.querySelector('[data-edge-lens]') as HTMLElement | null

/** jsdom has no AnimationEvent, so React binds the WEBKIT-prefixed fallback —
 *  a plain fireEvent.animationEnd never reaches the handler (proved by a
 *  five-line repro). Dispatch the name React actually listens for. */
const endAnimation = (el: Element) =>
  fireEvent(el, new Event('webkitAnimationEnd', { bubbles: true }))

describe('G1 the morph ghost is decoration only, and it leaves', () => {
  it('aria-hidden, pointer-events none, and GONE from the DOM after its animation', async () => {
    await mount()
    openByShortcut()
    const ghost = lensGhost()
    expect(ghost, 'no lens ghost mounted on open').toBeTruthy()
    expect(ghost!.getAttribute('aria-hidden')).toBe('true')
    expect(ghost!.className).toMatch(/pointer-events-none/)
    endAnimation(ghost!)
    expect(lensGhost(), 'the ghost outlived its animation').toBeNull()
  })

  it('the commit morph contracts back and leaves the same way', async () => {
    await mount()
    openByShortcut()
    const g = lensGhost()
    if (g) endAnimation(g)
    fireEvent.change(bubbleInput()!, { target: { value: 'chinese losers' } })
    await waitFor(() => expect(rowCount()).toBe(1))
    fireEvent.keyDown(bubbleInput()!, { key: 'Enter' })
    const back = lensGhost()
    expect(back, 'no contracting ghost on commit').toBeTruthy()
    expect(back!.getAttribute('aria-hidden')).toBe('true')
    endAnimation(back!)
    expect(lensGhost()).toBeNull()
  })
})

describe('G2 reduced motion mounts zero ghosts', () => {
  it('open and commit both morph-free under reduce', async () => {
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
      expect(lensGhost(), 'a lens ghost mounted under reduced motion').toBeNull()
      fireEvent.change(bubbleInput()!, { target: { value: 'chinese losers' } })
      await waitFor(() => expect(rowCount()).toBe(1))
      fireEvent.keyDown(bubbleInput()!, { key: 'Enter' })
      expect(lensGhost(), 'a commit ghost mounted under reduced motion').toBeNull()
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: orig })
    }
  })
})

describe('G3 focus lands the same tick, ghost present', () => {
  it('the morph never gates the input', async () => {
    await mount()
    vi.useFakeTimers()
    try {
      openByShortcut()
      expect(lensGhost(), 'this proof needs the ghost on screen').toBeTruthy()
      expect(document.activeElement, 'focus waited on the morph').toBe(bubbleInput())
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('G4 the shipped mark is the loupe; the override rules only when set', () => {
  it('constant says loupe; the disc agrees; the harness override still wins when present', async () => {
    const { EDGE_MARK } = await import('@/components/trades/QueryBubble')
    expect(EDGE_MARK, "the founder ruled the loupe").toBe('loupe')
    await mount()
    expect(screen.getByTitle(/Edge/).getAttribute('data-edge-mark')).toBe('loupe')
    ;(window as { __edgeMarkOverride?: string }).__edgeMarkOverride = 'monogram'
    try {
      openByShortcut()
      fireEvent.keyDown(bubbleInput()!, { key: 'Escape' })
      expect(screen.getByTitle(/Edge/).getAttribute('data-edge-mark')).toBe('monogram')
    } finally {
      delete (window as { __edgeMarkOverride?: string }).__edgeMarkOverride
    }
  })
})

// ─── G1-G6 — Edge learns to be carried ───────────────────────────────────────

import { EDGE_POSITION_KEY } from '@/lib/prefs/edgePosition'

const fab = () => screen.getByTitle(/Edge/) as HTMLButtonElement
const edgeRoot = () => document.querySelector('[data-edge-root]') as HTMLElement
const pointer = (type: string, target: Element | Window, x: number, y: number) =>
  fireEvent(target, new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0 }))

/** A real carry: down on the disc, move past the threshold, release. */
const drag = (fromX: number, fromY: number, toX: number, toY: number) => {
  pointer('pointerdown', fab(), fromX, fromY)
  pointer('pointermove', window, (fromX + toX) / 2, (fromY + toY) / 2)
  pointer('pointermove', window, toX, toY)
  pointer('pointerup', window, toX, toY)
}

describe('G1 a sub-threshold press-release is a CLICK and opens', () => {
  it('four pixels of wobble still opens the panel', async () => {
    await mount()
    pointer('pointerdown', fab(), 1000, 700)
    pointer('pointermove', window, 1003, 702)
    pointer('pointerup', window, 1003, 702)
    expect(bubbleInput(), 'a click within the threshold did not open').toBeTruthy()
  })
})

describe('G2 a real drag moves the disc and never opens', () => {
  it('the disc lands where carried (snapped), the panel stays closed', async () => {
    await mount()
    drag(1000, 700, 500, 300)
    expect(bubbleInput(), 'a drag opened the panel').toBeNull()
    const st = edgeRoot().style
    expect(st.left, 'the disc did not move').not.toBe('')
    // released at x=500 (centre-ish of 1024): snaps to the nearer LEFT edge
    expect(parseInt(st.left, 10)).toBe(24)
    expect(parseInt(st.top, 10)).toBeGreaterThanOrEqual(24)
  })
})

describe('G3 the position persists across unmount and remount', () => {
  it('write, unmount, remount - the disc is where it was left', async () => {
    await mount()
    drag(1000, 700, 900, 200)
    const left = edgeRoot().style.left
    const top = edgeRoot().style.top
    expect(localStorage.getItem(EDGE_POSITION_KEY), 'nothing persisted').toBeTruthy()
    cleanup()
    await mount()
    expect(edgeRoot().style.left, 'the position did not survive remount').toBe(left)
    expect(edgeRoot().style.top).toBe(top)
  })
})

describe('G4 bad stored positions never strand or crash', () => {
  it('an off-viewport position clamps back inside on restore', async () => {
    localStorage.setItem(EDGE_POSITION_KEY, JSON.stringify({ x: 5000, y: 9000 }))
    await mount()
    const st = edgeRoot().style
    expect(parseInt(st.left, 10), 'stranded off the right edge').toBeLessThanOrEqual(1024 - 24 - 48)
    expect(parseInt(st.top, 10), 'stranded off the bottom').toBeLessThanOrEqual(768 - 24 - 48)
  })

  it('a corrupt blob restores the default corner without a crash', async () => {
    localStorage.setItem(EDGE_POSITION_KEY, '{oh no')
    await mount()
    expect(edgeRoot().className, 'the default corner classes are gone').toMatch(/bottom-6/)
    expect(edgeRoot().style.left).toBe('')
  })
})

describe('G5 the panel and the morph follow the disc', () => {
  it('from top-left the panel flips down-left, the ghost starts at the lens (inside the root)', async () => {
    localStorage.setItem(EDGE_POSITION_KEY, JSON.stringify({ x: 24, y: 24 }))
    await mount()
    expect(edgeRoot().style.left).toBe('24px')
    pointer('pointerdown', fab(), 50, 50)
    pointer('pointerup', window, 50, 50)
    const input = bubbleInput()
    expect(input, 'the click from top-left did not open').toBeTruthy()
    const panel = input!.closest('[data-edge-place]') as HTMLElement
    expect(panel.getAttribute('data-edge-place'), 'the panel did not flip').toBe('down-left')
    expect(panel.className).toMatch(/origin-top-left/)
    const ghost = lensGhost()
    expect(ghost, 'no morph from the new home').toBeTruthy()
    expect(edgeRoot().contains(ghost!), "the ghost does not start at the disc's own rect").toBe(true)
    expect(ghost!.getAttribute('data-edge-place')).toBe('down-left')
  })
})

describe('G6 reduced motion carries without ceremony', () => {
  it('no snap animation class anywhere in the drag path', async () => {
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
      drag(1000, 700, 400, 300)
      expect(edgeRoot().className, 'a snap animation rode a reduced-motion drag').not.toMatch(/edge-snap/)
      expect(edgeRoot().style.left).not.toBe('')
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: orig })
    }
  })
})
