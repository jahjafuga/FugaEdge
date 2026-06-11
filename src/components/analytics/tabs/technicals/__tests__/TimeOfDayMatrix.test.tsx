import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { computeTimeOfDay } from '@/core/technicals/timeOfDay'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import TimeOfDayMatrix from '../TimeOfDayMatrix'

// RED-first tests for the Time-of-Day matrix (Section 6) — a 5×4 table (time
// buckets × MACD states) of clickable cells, each drilling into the shared
// BucketTradeTable via a composite `${time}:${macd}` key on useBucketBand. No
// DivergingBar / chartColors here, so no theme mock (like CombinedReadsBand).

const T_0945 = '2026-05-15T13:45:00.000Z' // 09:45 ET → t0930
const T_1400 = '2026-05-15T18:00:00.000Z' // 14:00 ET → t1200

type Macd = { positive: boolean | null; rising: boolean | null }
const POS_RISING: Macd = { positive: true, rising: true }
const NEG_FALLING: Macd = { positive: false, rising: false }

function todRow(
  id: number,
  net_pnl: number,
  open_time: string,
  macd: Macd,
): TradeWithTechnicalsRow {
  return makeRow({
    id,
    net_pnl,
    open_time,
    technicals: makeCompleteSnapshot({
      macd_positive: macd.positive,
      macd_rising: macd.rising,
    }),
  })
}

// 2 trades in t0930 × posRising (net 100, -50), 1 in t1200 × negFalling (200).
const ROWS = [
  todRow(1, 100, T_0945, POS_RISING),
  todRow(2, -50, T_0945, POS_RISING),
  todRow(3, 200, T_1400, NEG_FALLING),
]
const STATS = computeTimeOfDay(ROWS, '1m')

function renderMatrix() {
  return render(
    <TimeOfDayMatrix stats={STATS} filteredRows={ROWS} timeframe="1m" />,
  )
}

const cell = (timeLabel: string, macdFull: string) =>
  screen.getByRole('button', { name: `${timeLabel} ${macdFull}` })

describe('TimeOfDayMatrix — Section 6 cross-tab (integration)', () => {
  it('renders a 5×4 grid of cells with the §I row + §G column headers', () => {
    renderMatrix()
    expect(screen.getAllByRole('button')).toHaveLength(20) // 5 × 4 cells
    expect(screen.getByText('Pre-9:30')).toBeTruthy() // a row header
    expect(screen.getByText('12:00+')).toBeTruthy()
    expect(screen.getByText('Pos ▲')).toBeTruthy() // a column header
    expect(screen.getByText('Neg ▼')).toBeTruthy()
  })

  it('a column header carries the full MACD label in its title attribute', () => {
    renderMatrix()
    expect(screen.getByText('Pos ▲').getAttribute('title')).toBe(
      'Positive + Rising',
    )
  })

  it("renders each cell's n + net P&L (the t0930 × posRising cell has 2 trades)", () => {
    renderMatrix()
    const c = within(cell('9:30-10:00', 'Positive + Rising'))
    expect(c.getByText('2')).toBeTruthy() // n
    expect(c.getByText('+$50.00')).toBeTruthy() // net P&L (100 - 50)
  })

  it('renders n=0 cells as "0" / "$0.00", never blank, with no low-sample badge', () => {
    renderMatrix()
    const empty = within(cell('12:00+', 'Positive + Rising')) // n = 0
    expect(empty.getByText('0')).toBeTruthy()
    expect(empty.getByText('$0.00')).toBeTruthy()
    expect(empty.queryByText('Low sample')).toBeNull()
  })

  it('flags low-sample cells (0 < n < 5) with the badge', () => {
    renderMatrix()
    expect(
      within(cell('9:30-10:00', 'Positive + Rising')).getByText('Low sample'),
    ).toBeTruthy() // n = 2
  })

  it('clicking a cell opens its accordion and mounts the trade table', () => {
    renderMatrix()
    // The matrix is itself a table, so detect the drill table by its unique
    // macdLineColumn header rather than a tbody-row query.
    expect(screen.queryByText('MACD line')).toBeNull()
    fireEvent.click(cell('9:30-10:00', 'Positive + Rising'))
    expect(screen.getByText('MACD line')).toBeTruthy()
  })

  it('is single-open: clicking one cell sets only its aria-expanded', () => {
    renderMatrix()
    fireEvent.click(cell('9:30-10:00', 'Positive + Rising'))
    expect(
      cell('9:30-10:00', 'Positive + Rising').getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      cell('12:00+', 'Negative + Falling').getAttribute('aria-expanded'),
    ).toBe('false')
  })
})
