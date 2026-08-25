// @vitest-environment jsdom
//
// v0.2.7 — THE LIMIT REACHES THE PAGE.
//
// A limit that the ask carries and the page ignores is worse than no limit at
// all, and a limit the page applies SILENTLY is worse still. These pin the
// receiver: the ask's sort is lifted through the EXISTING controlled-state
// idiom (the one columnVisibility already uses), the slice happens after the
// ordering, and an active limit is VISIBLE and REMOVABLE.
//
// STRUCTURAL where it must be: jsdom has no layout engine, so nothing here
// asserts pixels. What it asserts is which props are passed, how many rows
// reach the table, and that the indicator exists and can be dismissed.

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { makeTrade } from '@/test/fixtures/trade'

/** The table is replaced by a probe that records exactly what it was given.
 *  Asserting on props is the only way to tell "the page owns the sort" from
 *  "the table happens to sort the same way". */
const seen: { trades: unknown[]; sorting: unknown }[] = []
vi.mock('@/components/trades/TradesTable', () => ({
  default: (props: { trades: unknown[]; sorting?: unknown }) => {
    seen.push({ trades: props.trades, sorting: props.sorting })
    return <div data-table-rows={props.trades.length} />
  },
}))

vi.mock('@/lib/ipc', () => {
  const base: Record<string, unknown> = {}
  return {
    ipc: new Proxy(base, {
      get(t, p: string) {
        if (!(p in t)) t[p] = vi.fn(() => Promise.resolve([]))
        return t[p]
      },
    }),
  }
})

import Trades from '../Trades'
import { AccountScopeProvider } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

/** Five trades whose natural order is NOT their date order. */
const ROWS = [
  makeTrade({ id: 1, symbol: 'AAA', open_time: '2026-01-05T10:00:00Z', date: '2026-01-05' }),
  makeTrade({ id: 2, symbol: 'BBB', open_time: '2026-06-20T10:00:00Z', date: '2026-06-20' }),
  makeTrade({ id: 3, symbol: 'CCC', open_time: '2026-03-11T10:00:00Z', date: '2026-03-11' }),
  makeTrade({ id: 4, symbol: 'DDD', open_time: '2026-07-02T10:00:00Z', date: '2026-07-02' }),
  makeTrade({ id: 5, symbol: 'EEE', open_time: '2026-02-14T10:00:00Z', date: '2026-02-14' }),
]

function mount() {
  return render(
    <MemoryRouter>
      <AccountScopeProvider>
        <Trades />
      </AccountScopeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  seen.length = 0
  localStorage.clear()
  m.tradesList.mockResolvedValue(ROWS)
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
  m.playbooksList.mockResolvedValue([])
  m.mistakeDefsGet.mockResolvedValue([])
  m.catalystDefsGet.mockResolvedValue([])
})

afterEach(() => cleanup())

const last = () => seen[seen.length - 1]!

// --- G7 ---------------------------------------------------------------------

describe('G7 the table keeps its own sort when the ask carries none', () => {
  it('the controlled sorting prop is ABSENT, not some default', () => {
    mount()
    return waitFor(() => {
      expect(seen.length).toBeGreaterThan(0)
      expect(
        last().sorting,
        'the page took ownership of a sort nobody asked for',
      ).toBeUndefined()
    })
  })

  it('and every row reaches the table', async () => {
    mount()
    await waitFor(() => expect(last().trades).toHaveLength(5))
  })
})

// --- G8 ---------------------------------------------------------------------

describe('G8 an active limit is visible and removable', () => {
  it('no limit means no indicator', async () => {
    mount()
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    expect(document.querySelector('[data-limit-indicator]')).toBeNull()
  })

  /** Type an ask into the REAL Edge bubble and commit it -- the only path a
   *  user has to a limit, so the only one worth asserting. */
  async function ask(text: string) {
    const trigger = document.querySelector('button[title*="Edge" i]') as HTMLButtonElement | null
    if (trigger) fireEvent.click(trigger)
    const input = (await screen.findByLabelText('Ask Edge')) as HTMLInputElement
    fireEvent.change(input, { target: { value: text } })
    fireEvent.keyDown(input, { key: 'Enter' })
  }

  it('"last 2" slices to two rows AND lifts the sort to the page', async () => {
    mount()
    await waitFor(() => expect(last().trades).toHaveLength(5))
    await ask('last 2')
    await waitFor(() => expect(last().trades).toHaveLength(2))
    expect(
      last().sorting,
      'the page did not take ownership of the sort the ask carried',
    ).toBeDefined()
  })

  it('and those two are the most recent -- SORTED before sliced', async () => {
    mount()
    await waitFor(() => expect(last().trades).toHaveLength(5))
    await ask('last 2')
    await waitFor(() => expect(last().trades).toHaveLength(2))
    const ids = (last().trades as { id: number }[]).map((t) => t.id)
    expect(ids, 'the list was sliced before it was sorted').toEqual([4, 2])
  })

  it('the limit renders a removable indicator', async () => {
    mount()
    await waitFor(() => expect(last().trades).toHaveLength(5))
    await ask('last 2')
    await waitFor(() =>
      expect(
        document.querySelector('[data-limit-indicator]'),
        'the truncation is silent -- the user cannot see rows are hidden',
      ).toBeTruthy(),
    )
  })

  it('the RESPONSE names the matched count, not the limit (the wiring, not the string)', async () => {
    // Caught in a running app, not by a unit test: responseLine was correct in
    // isolation and the PAGE was handing it the sliced length, so the line
    // reported the limit as the answer. The string function and its caller are
    // two different things and both have to be right.
    mount()
    await waitFor(() => expect(last().trades).toHaveLength(5))
    await ask('last 2')
    await waitFor(() => expect(last().trades).toHaveLength(2))
    const trigger = document.querySelector('button[title*="Edge" i]') as HTMLButtonElement
    fireEvent.click(trigger)
    const log = await screen.findByText(/trades/i, { selector: 'div' })
    expect(
      log.textContent,
      `the response reported the limit as the match: ${log.textContent}`,
    ).toMatch(/5 trades/)
  })

  it('and removing it restores every row', async () => {
    mount()
    await waitFor(() => expect(last().trades).toHaveLength(5))
    await ask('last 2')
    await waitFor(() => expect(last().trades).toHaveLength(2))
    const remove = document.querySelector('[data-limit-indicator] button') as HTMLButtonElement
    expect(remove, 'the indicator has no way to dismiss it').toBeTruthy()
    fireEvent.click(remove)
    await waitFor(() => expect(last().trades).toHaveLength(5))
  })
})
