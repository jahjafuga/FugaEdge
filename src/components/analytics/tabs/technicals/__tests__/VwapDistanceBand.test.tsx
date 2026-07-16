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

// Canonical scheme (Dave #10): 2 trades At VWAP (v2, dist 0.1), 1 Blow-off
// (v7, dist 25.0 — the old 10.0 fixture would land v6 now).
const ROWS = [vwapRow(1, 100, 0.1), vwapRow(2, -50, 0.1), vwapRow(3, 200, 25.0)]
const STATS = computeVwapBuckets(ROWS, '1m')

function renderBand() {
  return render(
    <VwapDistanceBand stats={STATS} filteredRows={ROWS} timeframe="1m" />,
  )
}

const card = (name: RegExp) => screen.getByRole('button', { name })

describe('VwapDistanceBand — Section 3 vertical list (integration)', () => {
  it('renders all seven canonical bucket rows', () => {
    renderBand()
    expect(screen.getAllByRole('button')).toHaveLength(7)
    expect(card(/Below VWAP \/ broken trend/)).toBeTruthy()
    expect(card(/At VWAP \(equilibrium\)/)).toBeTruthy()
    expect(card(/Blow-off \/ parabolic/)).toBeTruthy()
  })

  it("renders each bucket's stats (At VWAP has 2 trades)", () => {
    renderBand()
    expect(within(card(/At VWAP/)).getByText('2')).toBeTruthy() // n = 2
  })

  it('the low-sample badge stays per-bucket: thin buckets flag, empty buckets stay quiet', () => {
    renderBand()
    // At VWAP has n=2 (0 < n < 5) → badged; Blow-off n=1 → badged; an empty
    // bucket (Extended, n=0) shows no badge. No new work — pinned as-is.
    expect(within(card(/At VWAP/)).getByText('Low sample')).toBeTruthy()
    expect(within(card(/Blow-off/)).getByText('Low sample')).toBeTruthy()
    expect(within(card(/^Extended/)).queryByText('Low sample')).toBeNull()
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
    // Both v2 rows have vwap_dist_pct 0.1 → signedPct → +0.1%.
    expect(screen.getAllByText('+0.1%')).toHaveLength(2)
  })

  it('the DivergingBar reflects each bucket index position (v2 centred, v7 full right)', () => {
    renderBand()
    // v2 (At VWAP) barValue 0 → no bar rect (the canonical center).
    expect(card(/At VWAP/).querySelector('rect')).toBeNull()
    // v7 (Blow-off) barValue +5 at extent 5 → full right half (width 48 of 96).
    const rect = card(/Blow-off/).querySelector('rect')
    expect(rect?.getAttribute('x')).toBe('48')
    expect(rect?.getAttribute('width')).toBe('48')
  })

  it('is single-open: clicking a bucket sets only its aria-expanded', () => {
    renderBand()
    fireEvent.click(card(/At VWAP/))
    expect(card(/At VWAP/).getAttribute('aria-expanded')).toBe('true')
    expect(card(/Blow-off/).getAttribute('aria-expanded')).toBe('false')
  })
})
