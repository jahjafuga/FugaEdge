// @vitest-environment jsdom
//
// BEAT 1 — ENTRY vs 9EMA: retarget the tile READ.
//
// The Modal's "Entry vs 9EMA" tile must render the UNION-seeded 1-minute snapshot
// (trade_technicals.tf_1m.ema9_dist_pct, threaded onto the row as
// `tf_1m_ema9_dist_pct`) — NOT the stale denormalized day-only column
// (`entry_ema9_distance_pct`). RDGT is the canonical case: the stale column says
// 10.75% (day-only seed), the snapshot says 3.66% (warmup-union seed); the tile
// must show 3.66%.
//
// Renders the REAL extracted tile (Ema9DnaTile) — the exact composition the Modal
// mounts at TradeDetailModal.tsx:605 — fed a full TradeListRow. No hand-assembly:
// the test fails the day the binding points back at the stale column.
import { render, cleanup } from '@testing-library/react'
import { describe, expect, it, afterEach, vi } from 'vitest'
import { signedPct } from '@/lib/format'
import { makeTrade } from '@/test/fixtures/trade'
import { Ema9DnaTile } from '../TradeDetailModal'

// TradeDetailModal's child graph (PlaybookPicker → ipc.playbooksList) touches the
// ipc bridge on import; stub the whole surface so the module loads in jsdom (same
// pattern as TradesTable.sorting.test.tsx).
vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

afterEach(() => cleanup())

// Scope to the readout span (class `font-mono`) so the DnaTile label "Entry vs
// 9EMA" — which contains a literal "9" — can't corrupt the numeric assertions.
function readoutOf(trade: Parameters<typeof Ema9DnaTile>[0]['trade']): string {
  const { container } = render(<Ema9DnaTile trade={trade} />)
  return container.querySelector('.font-mono')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

describe('Entry-vs-9EMA tile reads the 1m snapshot, not the stale day-only column', () => {
  it('RDGT: stale column 10.75%, snapshot 3.66% → tile shows 3.66% (the union seed wins)', () => {
    const text = readoutOf(
      makeTrade({ entry_ema9_distance_pct: 10.75, tf_1m_ema9_dist_pct: 3.66 }),
    )
    expect(text).toContain('+3.66%')
    expect(text).not.toContain('10.75')
    // 3.66 < 5 → no "extended" badge; the stale 10.75 WOULD carry one.
    expect(text).not.toMatch(/extended/i)
  })

  it('stub: snapshot NULL → em-dash pending, never 0% — even when the stale column has a value', () => {
    const text = readoutOf(
      makeTrade({ entry_ema9_distance_pct: 10.75, tf_1m_ema9_dist_pct: null }),
    )
    expect(text).toContain('—')
    expect(text).not.toContain('0.00%')
    expect(text).not.toContain('10.75')
  })

  it('real on-EMA entry: snapshot 0 → "+0.00%" (a number, distinct from the null pending state)', () => {
    expect(readoutOf(makeTrade({ tf_1m_ema9_dist_pct: 0 }))).toContain('+0.00%')
  })

  it('no-regress: an ordinary flat trade (1.42%) still renders its value', () => {
    expect(readoutOf(makeTrade({ tf_1m_ema9_dist_pct: 1.42 }))).toContain('+1.42%')
  })

  it('Modal==Sheet convergence: tile and Sheet EMA9 field represent the SAME snapshot value (3.66), not divergent surfaces', () => {
    // The Sheet renders this exact field via distOrDash → signedPct(tf.ema9_dist_pct).
    const text = readoutOf(
      makeTrade({ entry_ema9_distance_pct: 10.75, tf_1m_ema9_dist_pct: 3.66 }),
    )
    const modalNum = parseFloat(text.replace(/[^0-9.\-]/g, ''))
    const sheetNum = parseFloat(signedPct(3.66).replace(/[^0-9.\-]/g, ''))
    // Both derive from the union snapshot (3.66); they agree to within rounding
    // (Modal 2dp = 3.66, Sheet 1dp = 3.7). Neither shows the stale 10.75.
    expect(modalNum).toBeCloseTo(3.66, 2)
    expect(Math.abs(sheetNum - modalNum)).toBeLessThan(0.1)
  })
})
