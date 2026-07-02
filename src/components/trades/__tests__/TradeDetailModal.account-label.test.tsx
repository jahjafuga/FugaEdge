// @vitest-environment jsdom
//
// Multi-account (Trades slice) — the trade DETAIL header names its owning
// account under EVERY scope (muted dot + name; style eyes-gated, presence
// pinned here). Harness mirrors TradeDetailModal.lifecycle.test.tsx (the
// proxy-ipc stub), with accountsList/settingsGet overridden so the scope
// provider's registry resolves the owner.

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeTrade } from '@/test/fixtures/trade'

const { OWNER } = vi.hoisted(() => ({
  OWNER: {
    id: 'ACCT-OO',
    name: 'Ocean One',
    broker: null,
    account_type: 'margin',
    color: '#4f9cf9',
    status: 'active',
    is_default: false,
    created_at: '2026-01-01T00:00:00.000Z',
  },
}))

vi.mock('@/lib/ipc', () => {
  const fallback = () => Promise.resolve([])
  return {
    ipc: new Proxy(
      {},
      {
        get: (_t, key) => {
          if (key === 'accountsList') return () => Promise.resolve([OWNER])
          if (key === 'settingsGet')
            return () => Promise.resolve({ values: { account_scope: 'all' }, stored_keys: [] })
          return fallback
        },
      },
    ),
  }
})

import TradeDetailModal from '../TradeDetailModal'
import { AccountScopeProvider } from '@/lib/accountScope'

const noop = async () => {}

describe('TradeDetailModal — owning-account label', () => {
  it('the header names the owning account (dot + name) resolved from the registry', async () => {
    render(
      <AccountScopeProvider>
        <TradeDetailModal
          trade={makeTrade({ account_id: 'ACCT-OO' } as never)}
          onClose={vi.fn()}
          onSaveNote={noop}
          onSaveTimeframe={noop}
          onSavePlaybook={noop}
          onSaveConfidence={noop}
          onSavePlannedRisk={noop}
          onSavePlannedStopLoss={noop}
          onSaveFloat={noop}
          onSaveCatalyst={noop}
          onSaveCountry={noop}
        />
      </AccountScopeProvider>,
    )
    expect(await screen.findByText('Ocean One')).toBeTruthy()
  })

  it('an unknown owning id renders NO label (never fabricated)', async () => {
    render(
      <AccountScopeProvider>
        <TradeDetailModal
          trade={makeTrade({ account_id: 'GONE' } as never)}
          onClose={vi.fn()}
          onSaveNote={noop}
          onSaveTimeframe={noop}
          onSavePlaybook={noop}
          onSaveConfidence={noop}
          onSavePlannedRisk={noop}
          onSavePlannedStopLoss={noop}
          onSaveFloat={noop}
          onSaveCatalyst={noop}
          onSaveCountry={noop}
        />
      </AccountScopeProvider>,
    )
    // The symbol renders; no account label appears.
    expect(await screen.findByText('AAPL')).toBeTruthy()
    expect(screen.queryByText('Ocean One')).toBeNull()
  })
})
