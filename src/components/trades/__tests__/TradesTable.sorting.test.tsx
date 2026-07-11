import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import TradesTable from '../TradesTable'

// TradesTable renders TradeDetailModal, which (via PlaybookPicker) calls
// ipc.playbooksList() on mount. Stub the whole ipc surface so the table renders
// in jsdom without a real preload bridge (same pattern as the bulk test).
vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

// Make every row "visible" under jsdom (the real virtualizer renders 0 rows
// because clientHeight is 0). Shared passthrough — see src/test/mockVirtualizer.
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/mockVirtualizer')).passthroughVirtualizer,
}))

const noop = async () => {}

function makeTrade(overrides: Partial<TradeListRow> = {}): TradeListRow {
  return {
    id: 1,
    account_id: 'ACCT-MAIN',
    date: '2026-05-20',
    symbol: 'AAA',
    side: 'long',
    open_time: '2026-05-20T13:00:00.000Z',
    close_time: '2026-05-20T14:00:00.000Z',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 10,
    shares_sold: 100,
    avg_sell_price: 11,
    gross_pnl: 100,
    total_fees: 0,
    net_pnl: 0,
    executions: [],
    note: null,
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
    mae: null,
    mfe: null,
    daily_change_pct: null,
    rvol: null,
    playbook_id: null,
    playbook_name: null,
    playbook_tier: null,
    confidence: null,
    mistakes: [],
    planned_risk: null,
    planned_stop_loss_price: null,
    risk_per_share: null,
    total_risk: null,
    r_multiple: null,
    float_shares: null,
    shares_outstanding: null,
    catalyst_type: null,
    days_since_catalyst: null,
    country: null,
    country_name: 'Unknown',
    region: 'Unknown',
    country_source: 'unknown',
    attachment_count: 0,
    secondary_tag_count: 0,
    deleted_at: null,
    ...overrides,
  }
}

const PROPS = {
  onSaveNote: noop,
  onSaveTimeframe: noop,
  onSavePlaybook: noop,
  onSaveConfidence: noop,
  onSavePlannedRisk: noop,
  onSavePlannedStopLoss: noop,
  onSaveFloat: noop,
  onSaveCatalyst: noop,
  onSaveCountry: noop,
  showCountryColumn: false,
}

const renderTable = (trades: TradeListRow[]) =>
  render(<TradesTable {...PROPS} trades={trades} showMistakesColumn />)

const tableEl = () => screen.getByRole('table')

/** The <th> carrying a given visible label. */
const header = (label: string): HTMLElement => {
  const th = Array.from(tableEl().querySelectorAll('thead th')).find(
    (el) => el.textContent?.trim() === label,
  )
  if (!th) throw new Error(`no column header "${label}"`)
  return th as HTMLElement
}

/**
 * Displayed row order, read from each row's Symbol cell.
 *
 * The cell index is derived from the HEADER row rather than hard-coded, so this
 * survives any optional-column toggle (and the bulk checkbox column, which adds
 * a leading cell to BOTH thead and tbody, keeping the indices aligned).
 *
 * Do NOT instead scan a row's whole textContent for the symbol: the Open and
 * Close time cells concatenate to "…09:04 AM09:14 AM", which contains the
 * substring "M0" — every row would match a symbol named "M0".
 */
const rowSymbols = (): string[] => {
  const heads = Array.from(tableEl().querySelectorAll('thead th'))
  const idx = heads.findIndex((el) => el.textContent?.trim() === 'Symbol')
  const body = tableEl().querySelector('tbody') as HTMLElement
  return Array.from(body.querySelectorAll('tr'))
    .map((tr) => tr.children[idx]?.textContent?.trim() ?? '')
    .filter((s) => s !== '')
}

// Mistake names are deliberately digit-free so they can never be confused with
// the count-encoding symbols (M0/M1/M2/M3) in any cell-text assertion.
const MISTAKES = ['alpha', 'beta', 'gamma']

// Symbols encode each row's mistake count. open_time descends in data order, so
// the table's DEFAULT sort (open_time desc) mounts them in this exact order —
// counts 2, 0, 3, 1. Both sorted orders below differ from it, so a click that
// silently does nothing cannot pass these tests.
function countRows(): TradeListRow[] {
  return [
    makeTrade({ id: 1, symbol: 'M2', open_time: '2026-05-20T13:04:00.000Z', mistakes: MISTAKES.slice(0, 2) }),
    makeTrade({ id: 2, symbol: 'M0', open_time: '2026-05-20T13:03:00.000Z', mistakes: [] }),
    makeTrade({ id: 3, symbol: 'M3', open_time: '2026-05-20T13:02:00.000Z', mistakes: MISTAKES.slice(0, 3) }),
    makeTrade({ id: 4, symbol: 'M1', open_time: '2026-05-20T13:01:00.000Z', mistakes: MISTAKES.slice(0, 1) }),
  ]
}

describe('TradesTable — Mistakes column sorting', () => {
  it('SORTABLE: the Mistakes header sorts on click', () => {
    renderTable(countRows())
    const th = header('Mistakes')

    // getCanSort() drives BOTH the click handler and the cursor affordance
    // (TradesTable.tsx header render) — a non-sortable header gets neither.
    expect(th.className).toContain('cursor-pointer')

    // …and the sort chevron only renders once the column is the active sort.
    expect(th.querySelector('svg')).toBeNull()
    fireEvent.click(th)
    expect(th.querySelector('svg')).toBeTruthy()
  })

  it('ORDER: sorts by mistake COUNT — desc on first click, asc on second', () => {
    renderTable(countRows())

    // Mount = the table's default sort (open_time desc), counts 2, 0, 3, 1.
    expect(rowSymbols()).toEqual(['M2', 'M0', 'M3', 'M1'])

    // First click is DESCENDING: the sort key is numeric, so TanStack's
    // getAutoSortDir returns 'desc' — same first-click direction as the numeric
    // siblings (Net P&L, Bought, …), not the text ones.
    fireEvent.click(header('Mistakes'))
    expect(rowSymbols()).toEqual(['M3', 'M2', 'M1', 'M0']) // counts 3, 2, 1, 0

    fireEvent.click(header('Mistakes'))
    expect(rowSymbols()).toEqual(['M0', 'M1', 'M2', 'M3']) // counts 0, 1, 2, 3
  })

  it('EMPTY/UNDEFINED: no mistakes counts as 0 and sorts lowest, missing array does not crash', () => {
    const rows = [
      makeTrade({ id: 1, symbol: 'M3', open_time: '2026-05-20T13:04:00.000Z', mistakes: MISTAKES }),
      makeTrade({ id: 2, symbol: 'M0', open_time: '2026-05-20T13:03:00.000Z', mistakes: [] }),
      makeTrade({ id: 3, symbol: 'MU', open_time: '2026-05-20T13:02:00.000Z' }),
      makeTrade({ id: 4, symbol: 'M1', open_time: '2026-05-20T13:01:00.000Z', mistakes: MISTAKES.slice(0, 1) }),
    ]
    // `mistakes` is typed REQUIRED (shared/trades-types.ts) and both production
    // reads populate it — but the CELL already guards `!m` defensively, so the
    // comparator must too. Build the malformed row the type forbids.
    delete (rows[2] as Partial<TradeListRow>).mistakes

    renderTable(rows)
    fireEvent.click(header('Mistakes')) // desc

    const order = rowSymbols()
    expect(order.slice(0, 2)).toEqual(['M3', 'M1']) // counts 3, 1
    // Both zero-count rows land at the bottom. Their order RELATIVE TO EACH OTHER
    // is a tie and deliberately unasserted — there is no secondary sort.
    expect(order.slice(2).sort()).toEqual(['M0', 'MU'])
  })

  it('REGRESSION: a sibling column (Net P&L) still sorts as before', () => {
    const rows = [
      makeTrade({ id: 1, symbol: 'A', open_time: '2026-05-20T13:03:00.000Z', net_pnl: 50 }),
      makeTrade({ id: 2, symbol: 'B', open_time: '2026-05-20T13:02:00.000Z', net_pnl: -30 }),
      makeTrade({ id: 3, symbol: 'C', open_time: '2026-05-20T13:01:00.000Z', net_pnl: 120 }),
    ]
    renderTable(rows)

    expect(rowSymbols()).toEqual(['A', 'B', 'C']) // default sort: open_time desc

    fireEvent.click(header('Net P&L')) // numeric → desc first
    expect(rowSymbols()).toEqual(['C', 'A', 'B'])

    fireEvent.click(header('Net P&L'))
    expect(rowSymbols()).toEqual(['B', 'A', 'C'])
  })
})
