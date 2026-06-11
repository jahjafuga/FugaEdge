import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { computeVwapBuckets } from '@/core/technicals/vwapBuckets'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import VwapDistanceBand from '../VwapDistanceBand'

// RED-first tests for the VWAP distance band (Section 3) — the first vertical-
// list consumer of the foundation components (useBucketBand + BucketRow +
// AccordionPanel + BucketTradeTable + the vwap distance column). useThemeMode is
// mocked to a fixed 'dark' so the band's chartColors lookup is hermetic (the real
// hook's applyTheme effect touches the DOM + requestAnimationFrame). fireEvent +
// RTL; opening a bucket from clean is synchronous (the 210ms switch timer —
// covered in useBucketBand.test — is never exercised here).
vi.mock('@/lib/theme', () => ({ useThemeMode: () => ({ resolved: 'dark' }) }))

function vwapRow(
  id: number,
  net_pnl: number,
  dist: number,
): TradeWithTechnicalsRow {
  return makeRow({
    id,
    net_pnl,
    technicals: makeCompleteSnapshot({ vwap_dist_pct: dist }),
  })
}

// 2 trades At VWAP (v3, dist 0.1), 1 Parabolic (v7, dist 10.0).
const ROWS = [vwapRow(1, 100, 0.1), vwapRow(2, -50, 0.1), vwapRow(3, 200, 10.0)]
const STATS = computeVwapBuckets(ROWS, '1m')

function renderBand() {
  return render(
    <VwapDistanceBand stats={STATS} filteredRows={ROWS} timeframe="1m" />,
  )
}

const card = (name: RegExp) => screen.getByRole('button', { name })

describe('VwapDistanceBand — Section 3 vertical list (integration)', () => {
  it('renders all seven §A4 bucket rows', () => {
    renderBand()
    expect(screen.getAllByRole('button')).toHaveLength(7)
    expect(card(/Below \/ broken/)).toBeTruthy()
    expect(card(/At VWAP/)).toBeTruthy()
    expect(card(/Parabolic \/ danger/)).toBeTruthy()
  })

  it("renders each bucket's stats (At VWAP has 2 trades)", () => {
    renderBand()
    expect(within(card(/At VWAP/)).getByText('2')).toBeTruthy() // n = 2
  })

  it('clicking a bucket opens its accordion and mounts the VWAP-dist table', () => {
    const { container } = renderBand()
    expect(container.querySelector('table')).toBeNull()
    fireEvent.click(card(/At VWAP/))
    expect(container.querySelector('table')).not.toBeNull()
    expect(screen.getByText('VWAP dist')).toBeTruthy() // the column header
  })

  it('the opened table renders the bucket rows with signed-% distance', () => {
    renderBand()
    fireEvent.click(card(/At VWAP/))
    // Both v3 rows have vwap_dist_pct 0.1 → signedPct → +0.1%.
    expect(screen.getAllByText('+0.1%')).toHaveLength(2)
  })

  it('the DivergingBar reflects each bucket index position (v3 centred, v7 full right)', () => {
    renderBand()
    // v3 (At VWAP) barValue 0 → no bar rect.
    expect(card(/At VWAP/).querySelector('rect')).toBeNull()
    // v7 (Parabolic) barValue +4 at extent 4 → full right half (width 48 of 96).
    const rect = card(/Parabolic/).querySelector('rect')
    expect(rect?.getAttribute('x')).toBe('48')
    expect(rect?.getAttribute('width')).toBe('48')
  })

  it('is single-open: clicking a bucket sets only its aria-expanded', () => {
    renderBand()
    fireEvent.click(card(/At VWAP/))
    expect(card(/At VWAP/).getAttribute('aria-expanded')).toBe('true')
    expect(card(/Parabolic/).getAttribute('aria-expanded')).toBe('false')
  })
})
