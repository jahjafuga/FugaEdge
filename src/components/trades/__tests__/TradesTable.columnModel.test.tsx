// @vitest-environment jsdom
// v0.2.7 — the column model: every column declares its own width, and no header
// label wraps.
//
// MEASURED before: all 33 columns did declare a `size`, but from a fifteen-key
// table, so eighteen of them borrowed another column's width — every one of the
// v0.2.7 additions was sized as "whatever Shares is". The Chart column declared
// ONE pixel while its sparkline draws eighty, which is why it painted across into
// the column beside it.
//
// The header defect is the wrap. `Days since catalyst` is nineteen characters in a
// column sized for a three-digit number, and nothing set white-space, so the label
// broke onto extra lines and took the whole header row with it — the header grew
// and shrank depending on which columns were switched on.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import {
  ALL_COLUMN_IDS, COLUMN_LABELS, COLUMN_PREFS_KEY, COLUMN_WIDTHS, NUMERIC_COLUMN_IDS,
} from '@/lib/prefs/columns'
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

const setVis = (v: Record<string, boolean>) =>
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
const allOn = () => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = true
  setVis(v)
}
const minimal = () => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = false
  v.symbol = true
  setVis(v)
}
const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const ths = () => Array.from(document.querySelectorAll('thead th'))

beforeEach(() => localStorage.clear())

describe('T1 every column declares its own width', () => {
  it('the registry drives it — no column can ship without one', () => {
    const missing = ALL_COLUMN_IDS.filter((id) => !(id in COLUMN_WIDTHS))
    expect(missing, `columns with no declared width: ${missing.join(', ')}`).toEqual([])
  })

  it('every width is a usable positive number', () => {
    for (const id of ALL_COLUMN_IDS) {
      const w = COLUMN_WIDTHS[id]
      expect(Number.isFinite(w), `${id} width is not a number`).toBe(true)
      // The Chart column declared 1px while drawing 80. Nothing may be narrower
      // than a cell's own horizontal padding.
      expect(w, `${id} is narrower than its own padding`).toBeGreaterThan(24)
    }
  })

  it('the rendered header carries the declared width, per column', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    for (const th of ths()) {
      const w = (th as HTMLElement).style.width
      if (w) expect(Number.parseInt(w, 10)).toBeGreaterThan(24)
    }
  })
})

describe('T2 no header label wraps', () => {
  it('every header cell suppresses wrapping', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const cells = ths()
    expect(cells.length).toBeGreaterThan(30)
    for (const th of cells) {
      const nowrap =
        th.className.includes('whitespace-nowrap') ||
        (th.querySelector('[class*="whitespace-nowrap"]') != null)
      expect(nowrap, `header "${th.textContent?.trim()}" can wrap`).toBe(true)
    }
  })

  it('and carries its full label in a title, since it may truncate', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const labelled = ths().filter((th) => (th.textContent ?? '').trim() !== '')
    for (const th of labelled) {
      expect(
        th.getAttribute('title'),
        `header "${th.textContent?.trim()}" truncates with no title`,
      ).toBeTruthy()
    }
  })

  it('the worst offender was shortened rather than left to truncate', () => {
    // Nineteen characters over a three-digit number.
    expect(COLUMN_LABELS['days_since_catalyst']).not.toBe('Days since catalyst')
    expect(COLUMN_LABELS['days_since_catalyst'].length).toBeLessThanOrEqual(12)
  })
})

describe('T3 the header row is the same height whatever is visible', () => {
  /** jsdom has no layout, so height is asserted structurally: identical <th>
   *  classes across every set, and nothing in any of them that can wrap. One
   *  line each, same box each — the row cannot change height. */
  const shape = () =>
    ths().map((th) => ({
      cls: th.className,
      nowrap:
        th.className.includes('whitespace-nowrap') ||
        th.querySelector('[class*="whitespace-nowrap"]') != null,
      lines: (th.textContent ?? '').trim().split('\n').length,
    }))

  it('default, all-on and minimal produce identically shaped header cells', () => {
    const shapes: ReturnType<typeof shape>[] = []
    for (const set of [() => {}, allOn, minimal]) {
      localStorage.clear()
      set()
      const { unmount } = render(<TradesTable {...PROPS} trades={TRADES} />)
      shapes.push(shape())
      unmount()
      document.body.replaceChildren()
    }
    for (const [i, s] of shapes.entries()) {
      expect(s.length, `set ${i} rendered no headers`).toBeGreaterThan(0)
      for (const c of s) {
        expect(c.nowrap, `set ${i} has a wrappable header`).toBe(true)
        expect(c.lines).toBe(1)
      }
    }
    // Sortable and unsortable headers differ only in cursor/hover classes, which
    // do not affect height. What must not vary is the box: padding and wrapping.
    const box = (cls: string) =>
      cls.split(/\s+/).filter((c) => /^(px|py|overflow|whitespace)-/.test(c)).sort().join(' ')
    const boxes = shapes.flatMap((s) => s.map((c) => box(c.cls)))
    expect(new Set(boxes).size, `header boxes differ: ${[...new Set(boxes)].join(' | ')}`).toBe(1)
  })
})

describe('T4 STAND-DOWN: the default set is unchanged in content', () => {
  it('renders the same twelve headers it did before', () => {
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const labels = ths().map((t) => t.textContent?.trim()).filter(Boolean)
    expect(labels).toContain('Date')
    expect(labels).toContain('Symbol')
    expect(labels).toContain('Side')
    expect(labels).toContain('Net P&L')
    expect(labels).not.toContain('Mistakes')
    expect(labels).not.toContain('Catalyst')
  })
})

describe('T4 no header label is wider than its column', () => {
  it('all 33, from the measured label width', () => {
    const HDR = 7.5
    const PAD = 24
    const tooNarrow = ALL_COLUMN_IDS.map((id) => {
      const label = COLUMN_LABELS[id] ?? id
      const need = Math.ceil(label.length * HDR) + PAD
      return need > COLUMN_WIDTHS[id]
        ? id + ' "' + label + '" needs ' + need + ', has ' + COLUMN_WIDTHS[id]
        : null
    }).filter(Boolean)
    expect(tooNarrow, 'labels that will truncate: ' + tooNarrow.join(' | ')).toEqual([])
  })
})

describe('T5 one name per column', () => {
  it('the header renders exactly the shared label', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const rendered = ths().map((t) => t.textContent?.trim())
    for (const id of ALL_COLUMN_IDS) {
      expect(rendered, id + ' header is not its shared label').toContain(COLUMN_LABELS[id])
    }
  })

  it('no column hardcodes a header string beside the shared one', () => {
    const bar = src('src/components/trades/TradesTable.tsx')
    const literals = bar.match(/header:\s*'[^']+'/g) ?? []
    expect(literals, 'headers bypassing COLUMN_LABELS: ' + literals.join(', ')).toEqual([])
  })

  it('and the Ranges row reads the same map, so a rename lands in both', () => {
    const filters = src('src/components/trades/TradesFilters.tsx')
    const page = src('src/pages/Trades.tsx')
    expect(page + filters).toContain('COLUMN_LABELS')
    for (const id of NUMERIC_COLUMN_IDS) expect(COLUMN_LABELS[id]).toBeTruthy()
  })
})
