import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { computeEmaBuckets } from '@/core/technicals/emaBuckets'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import EmaDistanceBand from '../EmaDistanceBand'

// RED-first tests for the EMA distance band (Section 4) — the second vertical-
// list consumer of the foundation components (useBucketBand + BucketRow +
// AccordionPanel + BucketTradeTable + the ema distance column), plus the 9/20
// stacking crossover strip the band owns below the bucket list. useThemeMode is
// mocked to a fixed 'dark' so the band's chartColors lookup is hermetic (the real
// hook's applyTheme effect touches the DOM + requestAnimationFrame). fireEvent +
// RTL; opening a bucket from clean is synchronous (the 210ms switch timer —
// covered in useBucketBand.test — is never exercised here).
vi.mock('@/lib/theme', () => ({ useThemeMode: () => ({ resolved: 'dark' }) }))

function emaRow(
  id: number,
  net_pnl: number,
  dist: number | null,
  above: boolean | null = null,
): TradeWithTechnicalsRow {
  return makeRow({
    id,
    net_pnl,
    technicals: makeCompleteSnapshot({
      ema9_dist_pct: dist,
      ema9_above_ema20: above,
    }),
  })
}

// 2 trades At 9 EMA (e2, dist 0.1) stacked, 1 Blow-off (e6, dist 15.0) broken.
const ROWS = [
  emaRow(1, 100, 0.1, true),
  emaRow(2, -50, 0.1, true),
  emaRow(3, 200, 15.0, false),
]
const STATS = computeEmaBuckets(ROWS, '1m')

function renderBand() {
  return render(
    <EmaDistanceBand stats={STATS} filteredRows={ROWS} timeframe="1m" />,
  )
}

// Independence fixture — crossover-classified but distance-unclassified (dist
// null), so the buckets stay empty while the crossover sides populate.
const XROWS = [
  emaRow(10, 70, null, true), // stacked winner
  emaRow(11, -10, null, true), // stacked loser
  emaRow(12, 30, null, false), // broken winner
]
const XSTATS = computeEmaBuckets(XROWS, '1m')

function renderXBand() {
  return render(
    <EmaDistanceBand stats={XSTATS} filteredRows={XROWS} timeframe="1m" />,
  )
}

const card = (name: RegExp) => screen.getByRole('button', { name })

describe('EmaDistanceBand — Section 4 vertical list (integration)', () => {
  it('renders all six §A5 bucket rows', () => {
    renderBand()
    expect(screen.getAllByRole('button')).toHaveLength(6)
    expect(card(/Below 9 EMA/)).toBeTruthy()
    expect(card(/At 9 EMA/)).toBeTruthy()
    expect(card(/Blow-off \/ parabolic/)).toBeTruthy()
  })

  it("renders each bucket's stats (At 9 EMA has 2 trades)", () => {
    renderBand()
    expect(within(card(/At 9 EMA/)).getByText('2')).toBeTruthy() // n = 2
  })

  it('clicking a bucket opens its accordion and mounts the EMA-dist table', () => {
    const { container } = renderBand()
    expect(container.querySelector('table')).toBeNull()
    fireEvent.click(card(/At 9 EMA/))
    expect(container.querySelector('table')).not.toBeNull()
    expect(screen.getByText('EMA 9 dist')).toBeTruthy() // the column header
  })

  it('the opened table renders the bucket rows with signed-% distance', () => {
    renderBand()
    fireEvent.click(card(/At 9 EMA/))
    // Both e2 rows have ema9_dist_pct 0.1 → signedPct → +0.1%.
    expect(screen.getAllByText('+0.1%')).toHaveLength(2)
  })

  it('the DivergingBar reflects each bucket index position (e2 centred, e6 full right)', () => {
    renderBand()
    // e2 (At 9 EMA) barValue 0 → no bar rect.
    expect(card(/At 9 EMA/).querySelector('rect')).toBeNull()
    // e6 (Blow-off) barValue +4 at extent 4 → full right half (width 48 of 96).
    const rect = card(/Blow-off/).querySelector('rect')
    expect(rect?.getAttribute('x')).toBe('48')
    expect(rect?.getAttribute('width')).toBe('48')
  })

  it('is single-open: clicking a bucket sets only its aria-expanded', () => {
    renderBand()
    fireEvent.click(card(/At 9 EMA/))
    expect(card(/At 9 EMA/).getAttribute('aria-expanded')).toBe('true')
    expect(card(/Blow-off/).getAttribute('aria-expanded')).toBe('false')
  })

  // ── 9/20 stacking crossover strip (D-B3.1) ─────────────────────────────────
  it('(CR1) renders the 9/20 stacking crossover strip with both sides', () => {
    renderBand()
    expect(screen.getByText('9/20 stacking')).toBeTruthy()
    expect(screen.getByText('Stacked')).toBeTruthy()
    expect(screen.getByText('Broken')).toBeTruthy()
  })

  it('(CR2) aggregates the crossover independently of the distance buckets', () => {
    renderXBand()
    // Every distance bucket is empty (the rows are distance-unclassified)...
    expect(within(card(/At 9 EMA/)).getByText('0')).toBeTruthy()
    // ...yet the crossover sides populate from the same rows, with their own
    // net P&L (stacked 70 − 10 = 60; broken 30) — values no bucket carries.
    expect(screen.getByText('+$60.00')).toBeTruthy()
    expect(screen.getByText('+$30.00')).toBeTruthy()
    // Both sides n<5 → a low-sample badge on each (buckets at n=0 show none).
    expect(screen.getAllByText('Low sample')).toHaveLength(2)
  })
})
