// @vitest-environment jsdom
// v0.2.7 — the row keeps its identity when the table is scrolled sideways.
//
// With every column now declaring a real width, the table is wider than its
// container and scrolls horizontally. Scroll right and every column that says
// WHICH TRADE a row is leaves the screen: you are reading numbers with nothing to
// attach them to.
//
// Date and Symbol are pinned. Pinned cells must be OPAQUE — a sticky cell with a
// transparent background has the scrolling content drawn straight through it.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import { ALL_COLUMN_IDS, COLUMN_PREFS_KEY, PINNED_COLUMNS } from '@/lib/prefs/columns'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/mockVirtualizer')).passthroughVirtualizer,
}))

const noop = async () => {}
const PROPS = {
  onSaveNote: noop, onSaveTimeframe: noop, onSavePlaybook: noop,
  onSaveConfidence: noop, onSavePlannedRisk: noop, onSavePlannedStopLoss: noop,
  onSaveFloat: noop, onSaveCatalyst: noop, onSaveCountry: noop,
}
const TRADES: TradeListRow[] = [
  makeTrade({ id: 1, symbol: 'INLF', date: '2026-08-05' }),
  makeTrade({ id: 2, symbol: 'VEEE', date: '2026-08-05' }),
]

const allOn = () => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = true
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
}
const ths = () => Array.from(document.querySelectorAll('thead th'))
const firstRowTds = () =>
  Array.from(
    (Array.from(document.querySelectorAll('tbody tr')).find(
      (tr) => tr.querySelectorAll('td').length > 1,
    ) as HTMLElement).querySelectorAll('td'),
  )
const sticky = (els: Element[]) =>
  els.filter((e) => (e as HTMLElement).className.includes('sticky'))

beforeEach(() => localStorage.clear())

describe('T5 the pinned columns survive a horizontal scroll', () => {
  it('Date and Symbol are the pinned pair', () => {
    expect([...PINNED_COLUMNS]).toEqual(['open_time', 'symbol'])
  })

  it('their header cells are sticky and offset from the left', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const pinnedHeads = sticky(ths())
    expect(pinnedHeads.length).toBe(PINNED_COLUMNS.length)
    // Distinct offsets, so the second sits beside the first rather than on top.
    const lefts = pinnedHeads.map((e) => (e as HTMLElement).style.left)
    expect(new Set(lefts).size).toBe(lefts.length)
    for (const l of lefts) expect(l).not.toBe('')
  })

  it('and so are their body cells, at the same offsets', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const heads = sticky(ths()).map((e) => (e as HTMLElement).style.left)
    const cells = sticky(firstRowTds()).map((e) => (e as HTMLElement).style.left)
    expect(cells).toEqual(heads)
  })

  it('they render FIRST, so the identity columns lead the row', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const labels = ths().map((t) => t.textContent?.trim())
    expect(labels[0]).toBe('Date')
    expect(labels[1]).toBe('Symbol')
  })
})

describe('T6 pinned cells are opaque', () => {
  it('every sticky cell carries the opaque surface class', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    for (const el of [...sticky(ths()), ...sticky(firstRowTds())]) {
      const cls = el.getAttribute('class') ?? ''
      // The surface moved from a bg-* utility to a named class when the rows went
      // transparent again — .pinned-surface is the card's own colour at full alpha.
      // The invariant is unchanged: nothing scrolling under may read through.
      expect(cls, `a sticky cell paints no surface: ${cls}`).toContain('pinned-surface')
      const translucent = cls.split(/\s+/).filter((c) => /^bg-[a-z0-9-]+\//.test(c))
      expect(translucent, `translucent surface: ${cls}`).toEqual([])
    }
  })

  it('and that class is opaque in both themes', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const rules = css.match(/\.pinned-surface\s*\{[^}]*\}/g) ?? []
    expect(rules.length, 'pinned-surface is not defined twice').toBeGreaterThanOrEqual(2)
    for (const r of rules) expect(r, `translucent: ${r}`).not.toMatch(/\/\s*0?\.\d/)
  })
})

describe('T7 pinned columns cannot be hidden', () => {
  it('their menu entries are disabled', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    fireEvent.click(screen.getByTestId('columns-button'))
    for (const id of PINNED_COLUMNS) {
      const input = screen
        .getByTestId(`col-toggle-${id}`)
        .querySelector('input') as HTMLInputElement
      expect(input.disabled, `${id} can be switched off`).toBe(true)
      expect(input.checked, `${id} is not visible`).toBe(true)
    }
  })

  it('and a stored preference that hides one is overridden', () => {
    const v: Record<string, boolean> = {}
    for (const id of PINNED_COLUMNS) v[id] = false
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const labels = ths().map((t) => t.textContent?.trim())
    expect(labels).toContain('Date')
    expect(labels).toContain('Symbol')
  })
})

describe('T8 the stale-row invariant still holds with columns pinned', () => {
  // Same assertion as the staleRows suite: every rendered row matches the header.
  const expectAligned = (why: string) => {
    const h = ths().length
    const counts = Array.from(document.querySelectorAll('tbody tr'))
      .filter((tr) => tr.querySelectorAll('td').length > 1)
      .map((r) => r.querySelectorAll('td').length)
    const bad = counts.map((c, i) => (c === h ? null : `row ${i + 1}: ${c}`)).filter(Boolean)
    expect(bad, `${why}\nheader ${h}; disagreeing: ${bad.join(', ')}`).toEqual([])
  }

  it('holds through a Reset with pinning on', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expectAligned('before reset')
    fireEvent.click(screen.getByTestId('columns-button'))
    fireEvent.click(screen.getByTestId('columns-reset'))
    expectAligned('after reset, pinned')
  })

  it('holds through a single toggle', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    fireEvent.click(screen.getByTestId('columns-button'))
    fireEvent.click(
      screen.getByTestId('col-toggle-float').querySelector('input') as Element,
    )
    expectAligned('after hiding Float, pinned')
  })
})

describe('T9 STAND-DOWN: unscrolled, the table reads as before', () => {
  it('the default set still renders its usual headers, in order', () => {
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const labels = ths().map((t) => t.textContent?.trim()).filter(Boolean)
    expect(labels[0]).toBe('Date')
    expect(labels).toContain('Net P&L')
    expect(labels).not.toContain('Mistakes')
  })

  it('and the rows still carry their values', () => {
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expect(document.body.textContent).toContain('INLF')
    expect(document.body.textContent).toContain('VEEE')
  })
})
