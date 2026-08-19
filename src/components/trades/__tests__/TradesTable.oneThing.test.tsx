// @vitest-environment jsdom
// v0.2.7 — the table reads as ONE thing.
//
// Pinning left the frozen columns painting a panel colour of their own while the
// row painted nothing at rest and bg-3 on hover, so a row highlighted in halves
// and the frozen block read as a separate widget parked on top of the table.
//
// The fix is structural rather than a matching colour: the row paints its own
// background and the pinned cells INHERIT it, so the two halves cannot diverge
// through rest, hover, or anything added later.

import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import { ALL_COLUMN_IDS, COLUMN_PREFS_KEY } from '@/lib/prefs/columns'
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
const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const allOn = () => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = true
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
}
const ths = () => Array.from(document.querySelectorAll('thead th'))
const firstRow = () =>
  Array.from(document.querySelectorAll('tbody tr')).find(
    (tr) => tr.querySelectorAll('td').length > 1,
  ) as HTMLElement
/** Backgrounds painted AT REST. Split on whitespace so a variant such as
 *  hover:bg-bg-3 is not mistaken for one — telling the resting colour from the
 *  hover colour is the whole point of these assertions. */
const bgOf = (cls: string) =>
  cls.split(/\s+/).filter((c) => c.startsWith('bg-') && !c.startsWith('bg-gold'))

beforeEach(() => localStorage.clear())

describe('T1 the rows are transparent and the frozen cells supply their own felt', () => {
  it('no body row declares a resting background — the card shows through', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    for (const row of Array.from(document.querySelectorAll('tbody tr')).filter(
      (r) => r.querySelectorAll('td').length > 1,
    )) {
      expect(bgOf(row.className), 'a row paints over the card felt').toEqual([])
    }
  })

  it('the scrolling cells paint nothing either', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const tds = Array.from(firstRow().querySelectorAll('td'))
    const scrolling = tds.filter((t) => !t.className.includes('sticky'))
    expect(scrolling.length).toBeGreaterThan(0)
    for (const t of scrolling) expect(bgOf(t.className)).toEqual([])
  })

  it('T2 the frozen cells are opaque and still follow the row hover', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expect(firstRow().className).toContain('group/row')
    expect(firstRow().className).toContain('hover:bg-bg-3')
    const pinned = Array.from(firstRow().querySelectorAll('td')).filter((t) =>
      t.className.includes('sticky'),
    )
    expect(pinned.length).toBeGreaterThan(0)
    for (const t of pinned) {
      expect(t.className, 'a frozen cell is transparent').toContain('pinned-surface')
      expect(t.className, 'a frozen cell ignores the row hover').toContain(
        'group-hover/row:bg-bg-3',
      )
    }
  })
})
describe('T2 hovering a row marks the pinned cells too', () => {
  it('the hover lives on the ROW, so every cell in it follows', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const row = firstRow()
    expect(row.className).toMatch(/hover:bg-/)
    // No cell declares a hover of its own that could disagree with the row's,
    // except the checkbox, whose gold tint is its own affordance.
    for (const td of Array.from(row.querySelectorAll('td'))) {
      // group-hover/row:* IS the row's hover reaching the frozen cells, which is
      // the point. What must not exist is a cell hovering on its OWN.
      const own = (td.className.match(/(?:^|\s)hover:bg-[a-z0-9/-]+/g) ?? []).filter(
        (h) => !h.includes('gold'),
      )
      expect(own, 'a cell hovers independently of its row: ' + td.className).toEqual([])
    }
  })
})
describe('T3 the pinned edge casts a shadow only while scrolled', () => {
  it('at rest there is no edge — nothing is passing underneath', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expect(document.querySelector('.pinned-edge')).toBeNull()
  })

  it('the shadow is applied to the LAST pinned column, and only when scrolled', () => {
    const bar = src('src/components/trades/TradesTable.tsx')
    expect(bar).toContain('pinned-edge')
    expect(bar).toMatch(/scrolledX && column\.id === PINNED_COLUMNS\[/)
  })

  it('it reuses the sentinel idiom rather than a scroll listener', () => {
    const bar = src('src/components/trades/TradesTable.tsx')
    expect(bar).toContain('IntersectionObserver')
    expect(bar).toContain('xSentinelRef')
    // A scroll handler firing per frame is exactly what the toolbar avoided.
    expect(bar).not.toMatch(/addEventListener\('scroll'/)
  })

  it('the class is defined for both themes', () => {
    const css = src('src/index.css')
    expect(css).toMatch(/\.pinned-edge\s*\{[^}]*box-shadow/)
    expect(css).toMatch(/:root\.light \.pinned-edge\s*\{[^}]*box-shadow/)
  })
})
describe('T6 the stale-row invariant still holds', () => {
  const expectAligned = (why: string) => {
    const h = ths().length
    const counts = Array.from(document.querySelectorAll('tbody tr'))
      .filter((tr) => tr.querySelectorAll('td').length > 1)
      .map((r) => r.querySelectorAll('td').length)
    const bad = counts.map((c, i) => (c === h ? null : 'row ' + (i + 1) + ': ' + c)).filter(Boolean)
    expect(bad, why + ' — header ' + h + '; disagreeing: ' + bad.join(', ')).toEqual([])
  }

  it('through a Reset', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expectAligned('before')
    fireEvent.click(screen.getByTestId('columns-button'))
    fireEvent.click(screen.getByTestId('columns-reset'))
    expectAligned('after reset')
  })
})
describe('T7 both themes resolve every token used', () => {
  const css = src('src/index.css')
  const light = css.slice(css.indexOf(':root.light'))

  it('the surfaces and borders the table paints', () => {
    for (const t of ['--bg-2', '--bg-3', '--border-default', '--border-subtle']) {
      expect(css.includes(t + ':'), t + ' missing from :root').toBe(true)
      expect(light.includes(t + ':'), t + ' missing from light').toBe(true)
    }
  })

  it('and no raw colour anywhere in the component', () => {
    const bar = src('src/components/trades/TradesTable.tsx')
    const classAttrs = (bar.match(/className=(?:"[^"]*"|\{`[^`]*`\})/g) ?? []).join(' ')
    expect(classAttrs).not.toMatch(/bg-\[#/)
    expect(classAttrs).not.toMatch(/text-\[#/)
    expect(classAttrs).not.toMatch(/shadow-\[/)
  })
})
