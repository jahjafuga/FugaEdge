// @vitest-environment jsdom
//
// Dave #16 — ENTRY TIME IN THE TRADE MODAL HEADER. The modal's subtitle
// gains the entry time immediately after the date — sourced and formatted
// IDENTICALLY to the Round Trips OPEN column (same field: open_time; same
// exported formatter: formatEastern; same timezone path: utcToEasternParts
// -> America/New_York). Never a second implementation — test (2) makes the
// two-surfaces guard executable by comparing the rendered strings.
// TradeDetailSheet renders a date-only subtitle twin (Sheet:188-190), so
// the Modal==Sheet convergence rule gives it the same addition.
// The "N sh bought · N sh sold" legs prose STAYS (consonant with #15's
// tooltips) — pinned by the full-subtitle assertions.

import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import { formatEastern } from '@/lib/format'

// The modal lazy-loads ChartTab (lightweight-charts needs canvas — jsdom-
// hostile); the stacked-modal suites established this mock.
vi.mock('@/components/trades/ChartTab', () => ({ default: () => null }))

// PlaybookPicker etc. call ipc on mount; the Sheet fetches its own row via
// ipc.getTrade. One Proxy with an explicit getTrade override.
const getTrade = vi.fn()
vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy(
    {},
    {
      get: (_t, prop: string) =>
        prop === 'getTrade' ? (...args: unknown[]) => getTrade(...args) : () => Promise.resolve([]),
    },
  ),
}))

// jsdom ships no ResizeObserver; chart containers require one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

// TradesTable is virtualized — passthrough so rows render under jsdom.
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/mockVirtualizer')).passthroughVirtualizer,
}))

import TradeDetailModal from '../TradeDetailModal'
import { TradeDetailSheet } from '../TradeDetailSheet'
import TradesTable from '../TradesTable'

const noop = async () => {}

const MODAL_PROPS = {
  onClose: () => {},
  onSaveNote: noop,
  onSaveTimeframe: noop,
  onSavePlaybook: noop,
  onSaveConfidence: noop,
  onSavePlannedRisk: noop,
  onSavePlannedStopLoss: noop,
  onSaveFloat: noop,
  onSaveCatalyst: noop,
  onSaveCountry: noop,
}

// Dave's GMM shape — 2 fills, 25 bought / 25 sold, entered 08:34:50 Eastern.
const OPEN_UTC = '2026-07-10T12:34:50.000Z' // 08:34:50 EDT
const GMM: TradeListRow = makeTrade({
  id: 7,
  symbol: 'GMM',
  date: '2026-07-10',
  open_time: OPEN_UTC,
  close_time: '2026-07-10T12:36:10.000Z',
  shares_bought: 25,
  avg_buy_price: 8.46,
  shares_sold: 25,
  avg_sell_price: 8.59,
  gross_pnl: 3.25,
  total_fees: 0,
  net_pnl: 3.25,
  executions: [
    { trade_id: 'a1', order_id: 'o1', side: 'B', qty: 25, price: 8.46, time: OPEN_UTC },
    { trade_id: 'a2', order_id: 'o2', side: 'S', qty: 25, price: 8.59, time: '2026-07-10T12:36:10.000Z' },
  ],
})

/** The subtitle line under a header's <h2>, whitespace-normalized. */
function subtitleUnder(titleId: string): string {
  const h2 = document.getElementById(titleId)
  if (!h2) throw new Error(`no #${titleId}`)
  const container = h2.closest('div.min-w-0')
  const sub = container?.querySelector('div.mt-1')
  if (!sub) throw new Error(`no subtitle under #${titleId}`)
  return (sub.textContent ?? '').replace(/\s+/g, ' ').trim()
}

beforeEach(() => {
  getTrade.mockReset()
  getTrade.mockResolvedValue(GMM)
})

describe('TradeDetailModal header — entry time after the date (Dave #16)', () => {
  it('(1) THE TICKET: date · time · fills · legs, time byte-equal to the OPEN column formatter', () => {
    render(<TradeDetailModal {...MODAL_PROPS} trade={GMM} />)
    expect(subtitleUnder('trade-detail-title')).toBe(
      `Jul 10 2026 · ${formatEastern(OPEN_UTC)} · 2 fills · 25 sh bought · 25 sh sold`,
    )
    expect(formatEastern(OPEN_UTC)).toBe('08:34:50')
  })

  it('(2) SAME-SOURCE PIN: the header and the Round Trips OPEN column render the identical string for the identical row', () => {
    // The OPEN column, rendered for the same row.
    const table = render(<TradesTable {...MODAL_PROPS} trades={[GMM]} showCountryColumn={false} />)
    const ths = Array.from(document.querySelectorAll('thead th')).map(
      (el) => el.textContent?.trim() ?? '',
    )
    const openIdx = ths.indexOf('Open')
    expect(openIdx).toBeGreaterThan(-1)
    const row = document.querySelector('tbody tr') as HTMLElement
    const openCell = (row.children[openIdx]?.textContent ?? '').trim()
    table.unmount()

    // The header, rendered for the same row.
    render(<TradeDetailModal {...MODAL_PROPS} trade={GMM} />)
    const sub = subtitleUnder('trade-detail-title')
    expect(openCell).toBe(formatEastern(GMM.open_time))
    expect(sub).toContain(` · ${openCell} · `)
  })

  it('(3) SHEET PARITY: the Sheet subtitle twin gains the same date · time', async () => {
    render(
      <TradeDetailSheet trade_id={7} technicalsHint={null} timeframe="1m" onClose={() => {}} />,
    )
    // The Sheet self-loads via ipc.getTrade — wait for the loaded header.
    await screen.findByText('GMM')
    expect(subtitleUnder('trade-detail-sheet-title')).toBe(
      `Jul 10 2026 · ${formatEastern(OPEN_UTC)}`,
    )
  })

  it('(4) NULL-SAFE: an unparseable open time renders the em-dash segment — never "Invalid Date"', () => {
    render(
      <TradeDetailModal {...MODAL_PROPS} trade={makeTrade({ ...GMM, open_time: 'not-a-date' })} />,
    )
    expect(subtitleUnder('trade-detail-title')).toBe(
      'Jul 10 2026 · — · 2 fills · 25 sh bought · 25 sh sold',
    )
    expect(document.body.textContent).not.toContain('Invalid Date')
  })

  it('(5) NO-REGRESS: counter, chevrons, symbol, side chip, and the legs prose all intact', () => {
    render(
      <TradeDetailModal
        {...MODAL_PROPS}
        trade={GMM}
        onNavigate={() => {}}
        navPosition={{ index: 2, total: 9, prevId: 1, nextId: 3 }}
      />,
    )
    const h2 = document.getElementById('trade-detail-title') as HTMLElement
    expect(h2.textContent).toBe('GMM')
    expect(within(h2.parentElement as HTMLElement).getByText('long')).toBeTruthy()
    expect(screen.getByText('3 of 9')).toBeTruthy()
    expect(screen.getByLabelText('Previous trade')).toBeTruthy()
    expect(screen.getByLabelText('Next trade')).toBeTruthy()
    expect(subtitleUnder('trade-detail-title')).toBe(
      `Jul 10 2026 · 08:34:50 · 2 fills · 25 sh bought · 25 sh sold`,
    )
  })
})
