import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import { makeRow, makeCompleteSnapshot } from '@/test/fixtures/technicals'
import BucketTradeTable from '../BucketTradeTable'

// Characterization tests (F6 phase 1/3) — lock the CURRENT 3-column MACD trade
// table's externally observable behavior before the generic-column refactor
// (phase 2/3). Assertions hit only the public contract: rendered header/cell
// text, row ORDER under sort (never the useState sort key), the "Show all N"
// expander, and the empty state.
//
// Per D-F6.2 the gate is "assertions unchanged, behavior unchanged" — phase 2
// changes the API (a distanceColumn prop), so only the construction (the
// renderTable helper below) updates there, while every assertion in this file
// stays identical. fireEvent + RTL; no fake timers (the table has none — the
// accordion close timer is upstream in MacdStateGrid).
//
// makeRow hard-codes date='2026-05-15' and exposes no date override, so spread +
// override it; macd_line lands in the 1m snapshot (tests use timeframe="1m").
function row(
  id: number,
  date: string,
  net_pnl: number,
  macdLine: number,
): TradeWithTechnicalsRow {
  return {
    ...makeRow({
      id,
      net_pnl,
      technicals: makeCompleteSnapshot({ macd_line: macdLine }),
    }),
    date,
  }
}

const A = row(1, '2026-05-10', 100, 1.5)
const B = row(2, '2026-05-12', -50, 2.5)
const C = row(3, '2026-05-11', 200, -1)
const THREE = [A, B, C]
const MANY = Array.from({ length: 10 }, (_, i) =>
  row(i + 1, `2026-05-${10 + i}`, (i + 1) * 10, i * 0.1),
)

function renderTable(rows: TradeWithTechnicalsRow[]) {
  return render(<BucketTradeTable rows={rows} timeframe="1m" />)
}

// Column text down the rendered rows (0=Date, 1=Net P&L, 2=MACD line).
function colText(container: HTMLElement, i: number): (string | null)[] {
  return Array.from(container.querySelectorAll('tbody tr')).map(
    (tr) => tr.querySelectorAll('td')[i].textContent,
  )
}

describe('BucketTradeTable — MACD trade table (characterization)', () => {
  it('renders the three column headers', () => {
    renderTable(THREE)
    expect(screen.getByText('Date')).toBeTruthy()
    expect(screen.getByText('Net P&L')).toBeTruthy()
    expect(screen.getByText('MACD line')).toBeTruthy()
  })

  it('renders a row with date, signed net P&L, and +X.XXX MACD line formatting', () => {
    renderTable(THREE)
    expect(screen.getByText('2026-05-10')).toBeTruthy() // row A date
    expect(screen.getByText('+$100.00')).toBeTruthy() // signed(100)
    expect(screen.getByText('+1.500')).toBeTruthy() // fmtMacd(1.5)
  })

  it('defaults to date-descending sort', () => {
    const { container } = renderTable(THREE)
    expect(colText(container, 0)).toEqual([
      '2026-05-12',
      '2026-05-11',
      '2026-05-10',
    ])
  })

  it('sorts by Net P&L descending, then ascending on re-click', () => {
    const { container } = renderTable(THREE)
    fireEvent.click(screen.getByText('Net P&L'))
    expect(colText(container, 1)).toEqual(['+$200.00', '+$100.00', '-$50.00'])
    fireEvent.click(screen.getByText('Net P&L'))
    expect(colText(container, 1)).toEqual(['-$50.00', '+$100.00', '+$200.00'])
  })

  it('sorts by the MACD line column (descending) when its header is clicked', () => {
    const { container } = renderTable(THREE)
    fireEvent.click(screen.getByText('MACD line'))
    expect(colText(container, 2)).toEqual(['+2.500', '+1.500', '-1.000'])
  })

  it('shows 8 rows by default with a Show all / Show first expander', () => {
    const { container } = renderTable(MANY)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(8)
    expect(screen.getByText(/showing 8 of 10/)).toBeTruthy()

    fireEvent.click(screen.getByText('Show all 10'))
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10)
    expect(screen.getByText('Show first 8')).toBeTruthy()

    fireEvent.click(screen.getByText('Show first 8'))
    expect(container.querySelectorAll('tbody tr')).toHaveLength(8)
  })

  it('renders the empty state when there are no rows', () => {
    renderTable([])
    expect(screen.getByText('No trades in this bucket.')).toBeTruthy()
    expect(screen.queryByText('Date')).toBeNull()
  })
})
