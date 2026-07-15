// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TierPerformanceCard from '@/components/analytics/TierPerformanceCard'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

// The FIRST tests this component has ever had. djsevans87 (beta, 2026-07-06) cannot compare
// setups across tiers: expanding B collapses A+, so he can only ever see one tier's playbooks
// at a time. This pins MULTI-EXPAND.
//
// Interaction uses fireEvent.click, NOT userEvent: under vi.useFakeTimers the userEvent click
// pipeline deadlocks (its async sequence awaits timers the fake clock never auto-advances).
// Same rule the Technicals band tests already follow (MacdStateGrid.test.tsx:13-15).
//
// The 210ms close-lag is the subtle part. A closing panel keeps its content MOUNTED so it
// animates out instead of vanishing. Under multi-expand that lag must be PER-KEY: closing A+
// must not unmount B's content. A single shared display slot (what useBucketBand has) cannot
// express that, which is exactly why this card needs its own state.

const t = (o: Partial<TradeListRow>) => makeTrade(o)

// A+ -> 2 setups (Bull Flag, ABCD) | B -> 1 setup (Micro Pullback)
const TRADES: TradeListRow[] = [
  t({ id: 1, playbook_id: 1, playbook_name: 'Bull Flag', playbook_tier: 'A+', net_pnl: 100 }),
  t({ id: 2, playbook_id: 1, playbook_name: 'Bull Flag', playbook_tier: 'A+', net_pnl: -50 }),
  t({ id: 3, playbook_id: 2, playbook_name: 'ABCD', playbook_tier: 'A+', net_pnl: 30 }),
  t({ id: 4, playbook_id: 3, playbook_name: 'Micro Pullback', playbook_tier: 'B', net_pnl: 20 }),
  t({ id: 5, playbook_id: 3, playbook_name: 'Micro Pullback', playbook_tier: 'B', net_pnl: -10 }),
]

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function setup(trades: TradeListRow[] = TRADES) {
  const { container } = render(<TierPerformanceCard trades={trades} />)

  // Only EXPANDABLE tier rows carry aria-expanded (TierPerformanceCard.tsx:142), so this is
  // exactly [A+, B] in PLAYBOOK_TIERS order.
  const rows = () => Array.from(container.querySelectorAll('tr[aria-expanded]'))
  // The AccordionPanel inner div (AccordionPanel.tsx:22). Scoped by class, NOT by [aria-hidden]
  // alone -- the chevron svg also carries aria-hidden (TierPerformanceCard.tsx:148).
  const panels = () => Array.from(container.querySelectorAll('div.min-h-0.overflow-hidden'))

  const isOpen = (i: number) => rows()[i]?.getAttribute('aria-expanded') === 'true'
  const isMounted = (i: number, name: string) => !!panels()[i]?.textContent?.includes(name)
  const click = (i: number) => fireEvent.click(rows()[i])

  return { container, rows, panels, isOpen, isMounted, click }
}

const APLUS = 0
const B = 1

describe('TierPerformanceCard — MULTI-EXPAND (djsevans87)', () => {
  it('renders one expandable row per tier, all closed', () => {
    const { rows, isOpen } = setup()
    expect(rows()).toHaveLength(2)
    expect(isOpen(APLUS)).toBe(false)
    expect(isOpen(B)).toBe(false)
  })

  it('*** 1. expand A+, then expand B -> BOTH stay open ***', async () => {
    const { isOpen, isMounted, click } = setup()

    click(APLUS)
    expect(isOpen(APLUS)).toBe(true)

    click(B)
    // The single-open machine would have collapsed A+ here and opened B only after 210ms.
    expect(isOpen(APLUS)).toBe(true)
    expect(isOpen(B)).toBe(true)

    // Let any animation settle -- both must STILL be open.
    await advance(500)
    expect(isOpen(APLUS)).toBe(true)
    expect(isOpen(B)).toBe(true)
    expect(isMounted(APLUS, 'Bull Flag')).toBe(true)
    expect(isMounted(B, 'Micro Pullback')).toBe(true)
  })

  it('*** 2. collapse A+ -> B stays open ***', async () => {
    const { isOpen, isMounted, click } = setup()
    click(APLUS)
    click(B)
    await advance(500)

    click(APLUS) // close A+ only
    expect(isOpen(APLUS)).toBe(false)
    expect(isOpen(B)).toBe(true)

    await advance(500)
    expect(isOpen(APLUS)).toBe(false)
    expect(isOpen(B)).toBe(true)
    expect(isMounted(B, 'Micro Pullback')).toBe(true)
  })

  it('3. toggling the same tier twice closes it', async () => {
    const { isOpen, click } = setup()
    click(APLUS)
    expect(isOpen(APLUS)).toBe(true)
    click(APLUS)
    expect(isOpen(APLUS)).toBe(false)
    await advance(500)
    expect(isOpen(APLUS)).toBe(false)
  })

  it('*** 4. the 210ms close-lag is PER-KEY: closing A+ never unmounts B ***', async () => {
    const { isOpen, isMounted, click } = setup()
    click(APLUS)
    click(B)
    await advance(500)
    expect(isMounted(APLUS, 'Bull Flag')).toBe(true)
    expect(isMounted(B, 'Micro Pullback')).toBe(true)

    click(APLUS) // start A+'s collapse

    // Immediately: A+ is visually closed but its content is STILL MOUNTED (it must animate out,
    // not vanish). B is untouched on both counts.
    expect(isOpen(APLUS)).toBe(false)
    expect(isMounted(APLUS, 'Bull Flag')).toBe(true)
    expect(isOpen(B)).toBe(true)
    expect(isMounted(B, 'Micro Pullback')).toBe(true)

    await advance(209) // one tick before the lag expires
    expect(isMounted(APLUS, 'Bull Flag')).toBe(true)
    expect(isMounted(B, 'Micro Pullback')).toBe(true)

    await advance(1) // 210 -> A+ unmounts. B MUST NOT.
    expect(isMounted(APLUS, 'Bull Flag')).toBe(false)
    expect(isOpen(B)).toBe(true)
    expect(isMounted(B, 'Micro Pullback')).toBe(true)
  })

  it('5. a tier with 0 setups is inert -- no chevron, no toggle, no crash', () => {
    // Degenerate: a tier-tagged trade with NO playbook. aggregateTierPerformance keys off
    // playbook_tier (tiers.ts:99) so the tier row exists, but aggregatePlaybooksInTier skips
    // the null playbook_id (tiers.ts:128) -> playbooks: [], setups: 0. TierRow's
    // `expandable` guard (TierPerformanceCard.tsx:117) must keep it inert.
    const { container, rows } = setup([
      t({ id: 9, playbook_id: null, playbook_name: null, playbook_tier: 'C', net_pnl: 5 }),
    ])
    expect(rows()).toHaveLength(0) // not expandable -> no aria-expanded
    const cRow = Array.from(container.querySelectorAll('tbody tr'))[0]
    expect(cRow).toBeDefined()
    expect(() => fireEvent.click(cRow)).not.toThrow()
    expect(container.querySelectorAll('div.min-h-0.overflow-hidden')).toHaveLength(0)
  })
})
