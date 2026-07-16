// @vitest-environment jsdom
//
// Dave #19 — SETUP DROPDOWN HEIGHT. The popover's hard max-h-[280px]
// (~8-9 visible rows) becomes a viewport-relative clamp:
//   max-h-[min(65vh,620px)]
// Sizing math: a 15-item list ≈ 15×28px rows + the pinned "No playbook"
// row (28) + divider (9) + container padding (8) ≈ 465px, which fits
// UNSCROLLED whenever 65vh ≥ 465px — i.e. any viewport ≥ ~716px tall
// (every typical laptop). Short screens still clamp and overflow-auto
// scrolls; the 620px ceiling keeps tall monitors sane. Always-drop-down
// stays; NO flip logic (parked, on record).
//
// jsdom renders no layout (scrollHeight is always 0), so the no-scroll
// claim is pinned STRUCTURALLY here (the clamp expression + all 15 rows
// in the DOM) and proven VISUALLY by the offscreen eyes-gate.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { PlaybookWithStats } from '@shared/playbook-types'

function pb(id: number, name: string): PlaybookWithStats {
  return {
    id,
    name,
    description: '',
    rules: '',
    ideal_conditions: '',
    archived: false,
    is_system: false,
    tier: 'B',
    created_at: '2026-01-01T00:00:00.000Z',
    stats: {
      trade_count: 0,
      net_pnl: 0,
      winners: 0,
      losers: 0,
      scratches: 0,
      win_rate: null,
      profit_factor: null,
      avg_winner: null,
      avg_loser: null,
      largest_winner: null,
      largest_loser: null,
      avg_r: null,
    },
  }
}

const FIFTEEN = Array.from({ length: 15 }, (_, i) =>
  pb(i + 1, `P${String(i + 1).padStart(2, '0')}`),
)

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy(
    { playbooksList: () => Promise.resolve(FIFTEEN) },
    {
      get(target: Record<string, unknown>, prop: string) {
        if (prop in target) return target[prop]
        return () => Promise.resolve([])
      },
    },
  ),
}))

import PlaybookPicker from '../PlaybookPicker'
import BulkSetPlaybookModal from '@/components/trades/BulkSetPlaybookModal'

const NEW_CLAMP = 'max-h-[min(65vh,620px)]'
const OLD_CAP = 'max-h-[280px]'

async function openBarePicker() {
  render(<PlaybookPicker value={null} onChange={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /No playbook/ }))
  await screen.findByText('P01')
}

/** The open popover — anchored from a known row (the ui Modal shell also
 *  carries a max-h class, so a bare attribute query can shadow it). */
function popover(): HTMLElement {
  const el = screen.getByText('P01').closest('[class*="max-h-"]')
  if (!el) throw new Error('no height-capped popover around the rows')
  return el as HTMLElement
}

describe('PlaybookPicker — viewport-relative height (Dave #19)', () => {
  it('(1) a 15-item list renders every row; the cap is the viewport clamp, not 280px', async () => {
    await openBarePicker()
    for (let i = 1; i <= 15; i++) {
      expect(screen.getByText(`P${String(i).padStart(2, '0')}`)).toBeTruthy()
    }
    expect(popover().className).toContain(NEW_CLAMP)
    expect(popover().className).not.toContain(OLD_CAP)
  })

  it('(2) short screens still clamp — the vh term and the overflow scroll are both on the popover', async () => {
    await openBarePicker()
    expect(popover().className).toContain('65vh')
    expect(popover().className).toContain('overflow-auto')
  })

  it('(3) the bulk modal host renders the SAME component with the same clamp', async () => {
    render(
      <BulkSetPlaybookModal
        open
        onClose={() => {}}
        count={3}
        onApply={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /No playbook/ }))
    await screen.findByText('P01')
    expect(popover().className).toContain(NEW_CLAMP)
  })

  it('(4) open/close + click-away unchanged', async () => {
    await openBarePicker()
    expect(screen.getByText('P15')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(screen.queryByText('P15')).toBeNull())
  })
})
