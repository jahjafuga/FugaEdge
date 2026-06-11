import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { computeCombinedReads } from '@/core/technicals/combinedReads'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import CombinedReadsBand from '../CombinedReadsBand'

// RED-first tests for the Combined Reads band (Section 5) — two expandable
// BucketCards (Full alignment / Any misalignment) over the §A9 partition, sharing
// the MacdStateGrid expandable-card pattern (useBucketBand + BucketCard +
// AccordionPanel + BucketTradeTable with macdLineColumn). No DivergingBar / no
// chartColors here, so unlike the distance bands this needs no theme mock.

const ALIGNED = { macd_positive: true, vwap_dist_pct: 1.0, ema9_dist_pct: 1.0 }

function alignedRow(id: number, net_pnl: number): TradeWithTechnicalsRow {
  return makeRow({ id, net_pnl, technicals: makeCompleteSnapshot(ALIGNED) })
}
function misRow(id: number, net_pnl: number): TradeWithTechnicalsRow {
  return makeRow({
    id,
    net_pnl,
    technicals: makeCompleteSnapshot({ ...ALIGNED, macd_positive: false }),
  })
}

// 2 aligned (net 100, -50), 1 misaligned (net 200).
const ROWS = [alignedRow(1, 100), alignedRow(2, -50), misRow(3, 200)]
const STATS = computeCombinedReads(ROWS, '1m')

function renderBand() {
  return render(
    <CombinedReadsBand stats={STATS} filteredRows={ROWS} timeframe="1m" />,
  )
}
const card = (name: RegExp) => screen.getByRole('button', { name })

describe('CombinedReadsBand — Section 5 two-card comparison (integration)', () => {
  it('renders the aligned + misaligned cells with their counts', () => {
    renderBand()
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(within(card(/Full alignment/)).getByText('2')).toBeTruthy() // aligned n=2
    expect(within(card(/Any misalignment/)).getByText('1')).toBeTruthy() // misaligned n=1
  })

  it('clicking a cell opens its accordion and mounts the trade table', () => {
    const { container } = renderBand()
    expect(container.querySelector('table')).toBeNull()
    fireEvent.click(card(/Full alignment/))
    expect(container.querySelector('table')).not.toBeNull()
    expect(screen.getByText('MACD line')).toBeTruthy() // macdLineColumn header
  })

  it('is single-open: clicking a cell sets only its own aria-expanded', () => {
    renderBand()
    fireEvent.click(card(/Full alignment/))
    expect(card(/Full alignment/).getAttribute('aria-expanded')).toBe('true')
    expect(card(/Any misalignment/).getAttribute('aria-expanded')).toBe('false')
  })
})
