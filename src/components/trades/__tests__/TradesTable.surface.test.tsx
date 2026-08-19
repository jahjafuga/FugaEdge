// @vitest-environment jsdom
// v0.2.7 — one opaque surface, and the Chart column stays inside its own cell.
//
// Pinning gave the table a second opaque layer. Before this the header painted
// bg-header while the pinned cells painted bg-2 and the body painted nothing at
// all over the card felt: three surfaces in one table, two of which only exist
// because something has to be opaque. They are now the SAME named token.
//
// The Chart column drew an eighty-pixel sparkline out of a one-pixel cell until
// the width commit; it has a real width now, but nothing stopped it overflowing,
// so it constrains itself rather than relying on the number staying right.

import { render } from '@testing-library/react'
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
  makeTrade({
    id: 1, symbol: 'INLF', date: '2026-08-05',
    executions: [
      { side: 'B', price: 9.9, shares: 50, time: '2026-08-05T13:30:00Z' },
      { side: 'S', price: 11, shares: 50, time: '2026-08-05T14:00:00Z' },
    ] as never,
  }),
]
const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const setVis = (v: Record<string, boolean>) =>
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
const allOn = () => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = true
  setVis(v)
}
/** Backgrounds painted AT REST. Split on whitespace: a word-boundary regex also
 *  matches inside hover:bg-bg-3, which would count a hover colour as a resting one
 *  and is exactly the distinction these assertions turn on. */
const bgOf = (cls: string) =>
  cls.split(/\s+/).filter((c) => c.startsWith('bg-') && !c.startsWith('bg-gold'))

beforeEach(() => localStorage.clear())

describe('T10 the table has ONE opaque surface, and only where it must', () => {
  it('the frozen cells carry it; the rows do not', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const frozen = Array.from(document.querySelectorAll('thead th, tbody td')).filter(
      (e) => (e.getAttribute('class') ?? '').includes('sticky'),
    )
    expect(frozen.length).toBeGreaterThan(0)
    for (const el of frozen) {
      expect(
        el.getAttribute('class'),
        'a frozen cell paints nothing, so content scrolls through it',
      ).toContain('pinned-surface')
    }
    // And the rows stay transparent so the card's felt reads through them.
    for (const row of Array.from(document.querySelectorAll('tbody tr')).filter(
      (r) => r.querySelectorAll('td').length > 1,
    )) {
      expect(bgOf(row.className)).toEqual([])
    }
  })

  it('and it is a named class bound to a token, not an arbitrary colour', () => {
    const css = src('src/index.css')
    expect(css).toMatch(/\.pinned-surface\s*\{[^}]*background-color/)
    expect(css).toMatch(/:root\.light \.pinned-surface\s*\{[^}]*background-color/)
    const bar = src('src/components/trades/TradesTable.tsx')
    const classAttrs = (bar.match(/className=(?:"[^"]*"|\{`[^`]*`\})/g) ?? []).join(' ')
    expect(classAttrs).not.toMatch(/bg-\[/)
  })
})

describe('T11 the Chart cell constrains its own overflow', () => {
  it('its renderer declares containment', () => {
    const bar = src('src/components/trades/TradesTable.tsx')
    const spark = bar.slice(bar.indexOf("id: 'spark'"), bar.indexOf("id: 'spark'") + 600)
    expect(spark, 'the Chart cell can paint outside its column').toContain('overflow-hidden')
  })

  it('renders inside a containing element', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const svg = document.querySelector('tbody svg')
    expect(svg, 'no sparkline rendered').toBeTruthy()
    const holder = (svg as Element).closest('[class*="overflow-hidden"]')
    expect(holder, 'the sparkline is not inside an overflow-hidden box').toBeTruthy()
  })
})

describe('T12 both themes resolve every token used', () => {
  const css = src('src/index.css')
  const light = css.slice(css.indexOf(':root.light'))

  it('the surface tokens the table paints are defined in both', () => {
    for (const t of ['--bg-2', '--bg-3', '--border-subtle']) {
      expect(css.includes(t + ':'), `${t} missing from :root`).toBe(true)
      expect(light.includes(t + ':'), `${t} missing from the light theme`).toBe(true)
    }
  })

  it('the table paints no raw colour anywhere', () => {
    const bar = src('src/components/trades/TradesTable.tsx')
    const classAttrs = (bar.match(/className=(?:"[^"]*"|\{`[^`]*`\})/g) ?? []).join(' ')
    expect(classAttrs).not.toMatch(/bg-\[#/)
    expect(classAttrs).not.toMatch(/text-\[#/)
  })
})

describe('T13 STAND-DOWN: with Chart hidden, nothing changes', () => {
  it('the table renders and stays aligned', () => {
    const v: Record<string, boolean> = {}
    for (const id of ALL_COLUMN_IDS) v[id] = true
    v.spark = false
    setVis(v)
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expect(document.querySelector('tbody svg')).toBeNull()
    const h = document.querySelectorAll('thead th').length
    const row = Array.from(document.querySelectorAll('tbody tr')).find(
      (tr) => tr.querySelectorAll('td').length > 1,
    ) as HTMLElement
    expect(row.querySelectorAll('td').length).toBe(h)
  })

  it('and the header surface is unchanged by hiding it', () => {
    allOn()
    const { unmount } = render(<TradesTable {...PROPS} trades={TRADES} />)
    const withChart = bgOf((document.querySelector('thead tr') as HTMLElement).className)
    unmount()
    document.body.replaceChildren()
    localStorage.clear()

    const v: Record<string, boolean> = {}
    for (const id of ALL_COLUMN_IDS) v[id] = true
    v.spark = false
    setVis(v)
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expect(bgOf((document.querySelector('thead tr') as HTMLElement).className)).toEqual(withChart)
  })
})
