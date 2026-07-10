import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GoalCard from '../GoalCard'
import GoalCreateModal from '../GoalCreateModal'
import type { GoalWithProgress } from '@shared/identity-types'

// v0.2.5 Phase B Session 5 (live-look iteration 2, 2026-06-13). Two checks the
// founder named:
//   1. The L28 THREE-ZONE dollar smoke. The S4 page invariant ("no journal-P&L
//      dollars on /profile") gained a NAMED, NARROW exception: dollar text is
//      permitted inside equity PRESET CHIPS and equity GOAL CARDS, and nowhere
//      else on /profile. The smoke asserts all three zones and prints booleans.
//   2. The preset-divergence COUPLING fix: an edit that clears the selected
//      preset must also stop the delta auto-compute, so a renamed equity-delta
//      chip no longer silently recomputes Target.

vi.mock('@/lib/ipc', () => ({
  ipc: { goalsCreate: vi.fn() },
}))

const noop = () => {}

function makeGoal(over: Partial<GoalWithProgress>): GoalWithProgress {
  return {
    id: 'g1',
    title: 'Goal',
    kind: 'process',
    config_json: '{}',
    preset_id: null,
    status: 'active',
    created_at: '2026-06-01',
    completed_at: null,
    progress: { current: 12, target: 30, fraction: 0.4 },
    ...over,
  }
}

const equityGoal = makeGoal({
  id: 'eq1',
  title: 'Make a Million',
  kind: 'equity',
  // created_at (row insert stamp) is DIVERGED from config.start_date so the
  // fixture can tell the two fields apart — the earlier shared value set them
  // equal ('2026-06-01'), which is exactly why the wrong-field render slipped by.
  created_at: '2026-07-10',
  config_json:
    '{"start_date":"2026-06-01","start_amount":25000,"target_amount":1000000}',
  progress: { current: 25000, target: 1000000, fraction: 0.025 },
})

const processGoal = makeGoal({
  id: 'pr1',
  title: 'Journal 30 Days',
  kind: 'process',
  progress: { current: 12, target: 30, fraction: 0.4 },
})

function openModal(): HTMLElement {
  render(<GoalCreateModal open onClose={noop} onCreated={noop} />)
  return document.querySelector('[role="dialog"]') as HTMLElement
}

describe('L28 three-zone dollar smoke (D25 named exception, 2026-06-13)', () => {
  it('zone B — equity goal cards DO render dollar text', () => {
    const { container } = render(<GoalCard goal={equityGoal} onAbandon={noop} />)
    const zoneB = !!container.textContent?.includes('$')
    // eslint-disable-next-line no-console
    console.log('[L28 smoke] zoneB_equity_card_dollars =', zoneB)
    expect(zoneB).toBe(true)
  })

  it('zone C — equity preset chips DO render dollar text', () => {
    openModal()
    const chips = document.querySelectorAll('[data-preset-kind="equity"]')
    const text = Array.from(chips)
      .map((c) => c.textContent ?? '')
      .join(' ')
    const zoneC = chips.length === 2 && text.includes('$')
    // eslint-disable-next-line no-console
    console.log('[L28 smoke] zoneC_equity_chip_dollars =', zoneC)
    expect(zoneC).toBe(true)
  })

  it('zone A — /profile minus equity chips AND equity cards is dollar-free', () => {
    // (a1) a PROCESS goal card carries no dollar text.
    const { container, unmount } = render(
      <GoalCard goal={processGoal} onAbandon={noop} />,
    )
    const processCardClean = !container.textContent?.includes('$')
    unmount()
    // (a2) the create modal, with its equity chips excised, carries no dollars.
    const dialog = openModal()
    const stripped = dialog.cloneNode(true) as HTMLElement
    stripped
      .querySelectorAll('[data-preset-kind="equity"]')
      .forEach((n) => n.remove())
    const modalClean = !stripped.textContent?.includes('$')
    const zoneA = processCardClean && modalClean
    // eslint-disable-next-line no-console
    console.log('[L28 smoke] zoneA_profile_minus_equity_clean =', zoneA)
    expect(zoneA).toBe(true)
  })
})

describe('GoalCreateModal — preset divergence coupling (2026-06-13 fix)', () => {
  it('a title edit that diverges from a delta preset stops Target auto-compute', () => {
    openModal()
    // Select the delta equity preset "Grow the Base" (+$1,000 from start).
    fireEvent.click(screen.getByRole('button', { name: /Grow the Base/ }))
    const start = screen.getByLabelText('Starting amount') as HTMLInputElement
    const targetAmt = screen.getByLabelText('Target amount') as HTMLInputElement
    // Typing the start amount auto-computes Target = start + 1,000.
    fireEvent.change(start, { target: { value: '5000' } })
    expect(targetAmt.value).toBe('6000')
    // Diverge by renaming the title — selection clears, AND (the fix) so does
    // the delta auto-compute.
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'My own climb' },
    })
    // A later start change must NOT recompute Target.
    fireEvent.change(start, { target: { value: '8000' } })
    expect(targetAmt.value).toBe('6000')
  })
})

// The "Started" line reads the challenge's real start. An EQUITY challenge begins
// on the user-picked start_date (stored in config_json), NOT the row's created_at
// insert stamp — the bug Dave hit was an equity card showing its creation date
// (today) instead of the picked date. A PROCESS goal has no start_date and its
// progress window legitimately begins at creation (engine.ts:45), so it keeps
// created_at. Fixtures DIVERGE created_at from start_date so the assertions can
// tell the fields apart.
describe('GoalCard — "Started" date (equity picks start_date, process keeps created_at)', () => {
  it('EQUITY renders the picked start_date, not the created_at stamp (Dave\'s case)', () => {
    const goal = makeGoal({
      id: 'eq-dave',
      kind: 'equity',
      created_at: '2026-07-10', // row insert stamp = "today"
      config_json:
        '{"start_date":"2026-01-05","start_amount":25000,"target_amount":1000000}',
      progress: { current: 25000, target: 1000000, fraction: 0.025 },
    })
    const { container } = render(<GoalCard goal={goal} onAbandon={noop} />)
    expect(container.textContent).toContain('Started 2026-01-05')
    // The creation stamp must not leak into the card anywhere.
    expect(container.textContent).not.toContain('2026-07-10')
  })

  it('PROCESS keeps created_at as its start (guards against over-swapping)', () => {
    const goal = makeGoal({
      id: 'pr-window',
      kind: 'process',
      created_at: '2026-07-10',
      config_json: '{"metric":"journaled_days","target":30}',
      progress: { current: 12, target: 30, fraction: 0.4 },
    })
    const { container } = render(<GoalCard goal={goal} onAbandon={noop} />)
    expect(container.textContent).toContain('Started 2026-07-10')
  })

  it('EQUITY with an absent/malformed start_date falls back to created_at (no crash, no blank)', () => {
    const goal = makeGoal({
      id: 'eq-broken',
      kind: 'equity',
      created_at: '2026-07-10',
      // no start_date -> parseGoalConfig returns null -> fallback to created_at
      config_json: '{"start_amount":25000,"target_amount":1000000}',
      progress: { current: 25000, target: 1000000, fraction: 0.025 },
    })
    const { container } = render(<GoalCard goal={goal} onAbandon={noop} />)
    expect(container.textContent).toContain('Started 2026-07-10')
  })
})
