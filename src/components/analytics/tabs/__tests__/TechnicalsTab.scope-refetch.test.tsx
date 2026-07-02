// @vitest-environment jsdom
//
// Multi-account (Technicals slice, beat 1) — the renderer half:
//   (1) the TA tab consumes the account scope: its fetch carries it and a
//       switcher flip re-fetches (the Playbook.scope-refetch mirror);
//   (2) the useEdgeScore (range, scope) TAG guard: rows fetched under a
//       prior scope are NEVER rendered after a flip — the hook reports
//       loading until the scoped fetch lands (the ruled desync guard,
//       extended from range to (range, scope)).

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    listTradesWithTechnicals: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))
vi.mock('../technicals/TechnicalsFilterBar', () => ({ default: () => null }))
vi.mock('../technicals/HeaderStripCards', () => ({ default: () => null }))
vi.mock('../technicals/MacdStateGrid', () => ({ default: () => null }))
vi.mock('../technicals/VwapDistanceBand', () => ({ default: () => null }))
vi.mock('../technicals/EmaDistanceBand', () => ({ default: () => null }))
vi.mock('../technicals/CombinedReadsBand', () => ({ default: () => null }))
vi.mock('../technicals/TimeOfDayMatrix', () => ({ default: () => null }))
vi.mock('../technicals/UnclassifiedChip', () => ({ default: () => null }))

import TechnicalsTab from '../TechnicalsTab'
import { useEdgeScore } from '@/lib/useEdgeScore'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

function ScopeProbe() {
  const { setScope } = useAccountScope()
  return (
    <button type="button" onClick={() => setScope({ accountId: 'ACCT-B' })}>
      probe-pick-b
    </button>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
})

describe('TechnicalsTab — scope-aware fetching', () => {
  it("fetches with 'all' at boot and re-fetches with the new scope on a switcher flip", async () => {
    m.listTradesWithTechnicals.mockResolvedValue([])
    render(
      <AccountScopeProvider>
        <ScopeProbe />
        <TechnicalsTab />
      </AccountScopeProvider>,
    )
    await waitFor(() => expect(m.listTradesWithTechnicals).toHaveBeenCalled())
    expect(m.listTradesWithTechnicals).toHaveBeenCalledWith(
      expect.objectContaining({ accountScope: 'all' }),
    )

    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() =>
      expect(m.listTradesWithTechnicals).toHaveBeenLastCalledWith(
        expect.objectContaining({ accountScope: { accountId: 'ACCT-B' } }),
      ),
    )
  })
})

// The tag-guard host: scope comes from the provider OUTSIDE the hook and is
// passed as the ruled explicit param (hooks must not consume useAccountScope
// internally — the mixed-scope-card hazard).
function EdgeScoreHost() {
  const { scope, setScope } = useAccountScope()
  const { loading } = useEdgeScore('90d', scope)
  return (
    <div>
      <span data-testid="edge-state">{loading ? 'LOADING' : 'READY'}</span>
      <button type="button" onClick={() => setScope({ accountId: 'ACCT-B' })}>
        host-pick-b
      </button>
    </div>
  )
}

describe('useEdgeScore — the (range, scope) tag guard', () => {
  it('rows fetched under a prior scope are never rendered after a flip (loading until the scoped fetch lands)', async () => {
    m.listTradesWithTechnicals.mockImplementation(
      async (opts?: { accountScope?: unknown }) => {
        const scoped =
          opts?.accountScope != null && typeof opts.accountScope === 'object'
        if (scoped) return new Promise<never[]>(() => {}) // never resolves
        return []
      },
    )
    render(
      <AccountScopeProvider>
        <EdgeScoreHost />
      </AccountScopeProvider>,
    )
    // The 'all' fetch lands -> READY.
    await waitFor(() =>
      expect(screen.getByTestId('edge-state').textContent).toBe('READY'),
    )

    fireEvent.click(screen.getByText('host-pick-b'))
    // The flip must DISCARD the 'all'-tagged rows: LOADING, never a stale READY.
    await waitFor(() =>
      expect(screen.getByTestId('edge-state').textContent).toBe('LOADING'),
    )
  })
})
