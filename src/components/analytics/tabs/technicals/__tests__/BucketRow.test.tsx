import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BucketStats } from '@/core/technicals/macdBuckets'
import BucketRow from '../BucketRow'

// RED-first unit tests for BucketRow (F5 phase 2 of 2) — the horizontal row
// analog of BucketCard for the VWAP/EMA distance bands. It parallels BucketCard's
// chrome (button + isOpen border/tint) but lays out [title + LowSampleBadge] |
// DivergingBar | 4 stat cells, and composes the value-agnostic DivergingBar
// (79ec597). Sentinels prove palette-agnosticism: non-MACD tint classes, and bar
// hex colors DISTINCT from DivergingBar's own test colors (#FF0000 / #00FF00), so
// a passing geometry assertion proves BucketRow forwards ITS values, not defaults.
//
// Fixtures FULL/EMPTY/LOW are the same BucketStats shapes as BucketCard.test.tsx.
// The "—" below is U+2014 EM DASH, byte-identical to the shell + format.percent.
// BucketRow renders only 4 of the 6 fields, so the empty case has TWO em-dashes
// (winRate + expectancy), not four. fireEvent + RTL; no fake timers (no state).

const REST_CLASS = 'bg-test-rest-tint'
const ACTIVE_CLASS = 'bg-test-active-tint'
const BAR_LEFT = '#123456'
const BAR_RIGHT = '#654321'

const FULL: BucketStats = {
  n: 12,
  winRate: 0.5,
  netPnl: 170,
  avgWinner: 220,
  avgLoser: -90,
  expectancy: 25,
}
const EMPTY: BucketStats = {
  n: 0,
  winRate: null,
  netPnl: 0,
  avgWinner: null,
  avgLoser: null,
  expectancy: null,
}
const LOW: BucketStats = {
  n: 3,
  winRate: 0.33,
  netPnl: 40,
  avgWinner: 60,
  avgLoser: -20,
  expectancy: null,
}

const base = {
  title: 'Test Bucket Title',
  stats: FULL,
  isOpen: false,
  onClick: () => {},
  restTintClass: REST_CLASS,
  activeTintClass: ACTIVE_CLASS,
  barValue: 5,
  barExtent: 10,
  barLeftColor: BAR_LEFT,
  barRightColor: BAR_RIGHT,
}

describe('BucketRow — horizontal distance-band row (direct unit tests)', () => {
  it('renders the title', () => {
    render(<BucketRow {...base} />)
    expect(screen.getByText(/Test Bucket Title/)).toBeTruthy()
  })

  it('renders the four visible stats, and not avg winner / avg loser', () => {
    render(<BucketRow {...base} stats={FULL} />)
    expect(screen.getByText('12')).toBeTruthy() // Trades
    expect(screen.getByText('50%')).toBeTruthy() // Win rate — percent(0.5, 0)
    expect(screen.getByText('+$170.00')).toBeTruthy() // Net P&L — signed(170)
    expect(screen.getByText('+$25.00')).toBeTruthy() // Expectancy — signed(25)
    // Avg winner / avg loser are deferred to the expansion accordion. The LABEL
    // is the canonical "this field is rendered" signal — querying it (not a
    // specific value string) rigorously locks the 4-field set.
    expect(screen.queryByText(/Avg winner/i)).toBeNull()
    expect(screen.queryByText(/Avg loser/i)).toBeNull()
  })

  it('renders "—" for the two nullable fields and $0.00 net P&L on an empty bucket', () => {
    render(<BucketRow {...base} stats={EMPTY} />)
    // Only winRate + expectancy are nullable among the four rendered fields.
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getByText('$0.00')).toBeTruthy() // Net P&L = signed(0)
    expect(screen.getByText('0')).toBeTruthy() // Trades
  })

  it('shows the Low sample badge only when 0 < n < 5', () => {
    const low = render(<BucketRow {...base} stats={LOW} />)
    expect(screen.getByText('Low sample')).toBeTruthy() // n = 3
    low.unmount()

    const full = render(<BucketRow {...base} stats={FULL} />)
    expect(screen.queryByText('Low sample')).toBeNull() // n = 12 (>= 5)
    full.unmount()

    render(<BucketRow {...base} stats={EMPTY} />)
    expect(screen.queryByText('Low sample')).toBeNull() // n = 0
  })

  it('closed state: rest tint applied (not active), subtle/hover border, aria-expanded=false', () => {
    render(<BucketRow {...base} isOpen={false} />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain(REST_CLASS)
    expect(btn.className).not.toContain(ACTIVE_CLASS)
    expect(btn.className).toContain('border-border-subtle')
    expect(btn.className).toContain('hover:border-gold/40')
    expect(btn.className).not.toContain('border-gold/60')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('open state: active tint applied (not rest), gold/60 border, aria-expanded=true', () => {
    render(<BucketRow {...base} isOpen={true} />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain(ACTIVE_CLASS)
    expect(btn.className).not.toContain(REST_CLASS)
    expect(btn.className).toContain('border-gold/60')
    expect(btn.className).not.toContain('hover:border-gold/40')
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })

  it('composes DivergingBar, forwarding barValue / barExtent / colors at width 96', () => {
    // Positive: right-side rect in barRightColor. cx=48, half=48, frac=5/10.
    const pos = render(<BucketRow {...base} barValue={5} barExtent={10} />)
    let rect = pos.container.querySelector('rect')
    expect(rect?.getAttribute('x')).toBe('48')
    expect(rect?.getAttribute('width')).toBe('24') // (5/10) * 48
    expect(rect?.getAttribute('fill')).toBe(BAR_RIGHT)
    pos.unmount()

    // Negative: left-side rect in barLeftColor.
    const neg = render(<BucketRow {...base} barValue={-5} barExtent={10} />)
    rect = neg.container.querySelector('rect')
    expect(rect?.getAttribute('x')).toBe('24') // cx - len = 48 - 24
    expect(rect?.getAttribute('width')).toBe('24')
    expect(rect?.getAttribute('fill')).toBe(BAR_LEFT)
  })

  it('fires onClick once per click', () => {
    const onClick = vi.fn()
    render(<BucketRow {...base} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
