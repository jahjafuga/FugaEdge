// @vitest-environment jsdom
//
// Multi-account Beat 3 — the Import page's account wiring (the beat's logic
// core): the default account preselects; CHANGING the picker re-invokes the
// preview with the chosen accountId (preview honesty — badges re-annotate);
// a sim selection blocks the Import button; commit passes account_id.
// DropZone and BrokerExportGuide are stubbed (file plumbing + image assets);
// everything else renders real.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Account } from '@shared/accounts-types'
import type { PreviewResult } from '@shared/import-types'

const DROPPED = [{ name: 'Trades.csv', text: 'csv-bytes' }]

vi.mock('@/lib/ipc', () => ({
  ipc: {
    importPreview: vi.fn(),
    importCommit: vi.fn(),
    accountsList: vi.fn(),
  },
}))
vi.mock('@/components/import/DropZone', () => ({
  default: (p: { onFiles: (f: typeof DROPPED) => void }) => (
    <button type="button" onClick={() => p.onFiles(DROPPED)}>
      fake-drop
    </button>
  ),
}))
vi.mock('@/components/import/BrokerExportGuide', () => ({ default: () => null }))

import Import from '../Import'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

function acct(over: Partial<Account>): Account {
  return {
    id: 'A',
    name: 'DAS Main',
    broker: null,
    account_type: 'margin',
    color: null,
    status: 'active',
    is_default: false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const ACCOUNTS: Account[] = [
  acct({ id: 'ACCT-A', name: 'DAS Main', is_default: true }),
  acct({ id: 'ACCT-B', name: 'Ocean One' }),
  acct({ id: 'ACCT-SIM', name: 'Practice', account_type: 'sim' }),
]

function preview(): PreviewResult {
  return {
    files: [
      { filename: 'Trades.csv', format: 'executions', filenameDateParsed: false, inferredDate: '', rowCount: 1 },
    ],
    trips: [],
    fees: [],
    needsDate: false,
    feesUnavailable: false,
    dateRange: { from: '2026-06-09', to: '2026-06-09' },
    summary: {
      totalExecutions: 1,
      totalTrips: 1,
      newTrips: 1,
      duplicateTrips: 0,
      supersededTrips: 0,
      openTrips: 0,
      totalFeeRows: 0,
      newFeeRows: 0,
      replaceFeeRows: 0,
      skippedExecutions: 0,
      skippedFeeRows: 0,
    },
    issues: [],
  }
}

const EXPECTED_INPUTS = [{ filename: 'Trades.csv', text: 'csv-bytes', bytes: undefined }]

beforeEach(() => {
  vi.clearAllMocks()
  m.accountsList.mockResolvedValue(ACCOUNTS)
  m.importPreview.mockResolvedValue(preview())
  m.importCommit.mockResolvedValue({
    insertedTrips: 1,
    skippedTrips: 0,
    resurrectedTrips: 0,
    supersededTrips: 0,
    insertedFees: 0,
    replacedFees: 0,
    affectedDates: ['2026-06-09'],
    affectedPairs: 1,
    countriesResolved: 0,
    countriesUnknown: 0,
    countryApiKeyMissing: false,
    floatErrored: 0,
    aggregatesErrored: 0,
    issues: [],
  })
})

async function renderAndDrop() {
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  )
  await waitFor(() => expect(m.accountsList).toHaveBeenCalled())
  fireEvent.click(screen.getByText('fake-drop'))
  await screen.findByRole('combobox', { name: /trading account/i })
}

describe('Import — account wiring', () => {
  it('previews with the DEFAULT account preselected', async () => {
    await renderAndDrop()
    expect(m.importPreview).toHaveBeenCalledWith(EXPECTED_INPUTS, undefined, 'ACCT-A')
    const select = screen.getByRole('combobox', { name: /trading account/i }) as HTMLSelectElement
    expect(select.value).toBe('ACCT-A')
  })

  it('changing the picker RE-INVOKES the preview with the chosen accountId (preview honesty)', async () => {
    await renderAndDrop()
    fireEvent.change(screen.getByRole('combobox', { name: /trading account/i }), {
      target: { value: 'ACCT-B' },
    })
    await waitFor(() => expect(m.importPreview).toHaveBeenCalledTimes(2))
    expect(m.importPreview).toHaveBeenLastCalledWith(EXPECTED_INPUTS, undefined, 'ACCT-B')
  })

  it('a sim selection blocks the Import button with the sim message', async () => {
    await renderAndDrop()
    fireEvent.change(screen.getByRole('combobox', { name: /trading account/i }), {
      target: { value: 'ACCT-SIM' },
    })
    const btn = await screen.findByRole('button', { name: /sim imports unlock/i })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('commit passes the SELECTED account_id in CommitInput', async () => {
    await renderAndDrop()
    fireEvent.change(screen.getByRole('combobox', { name: /trading account/i }), {
      target: { value: 'ACCT-B' },
    })
    await waitFor(() => expect(m.importPreview).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: /import 1 round trip/i }))
    await waitFor(() => expect(m.importCommit).toHaveBeenCalledTimes(1))
    expect(m.importCommit.mock.calls[0][0]).toEqual(
      expect.objectContaining({ account_id: 'ACCT-B' }),
    )
  })
})
