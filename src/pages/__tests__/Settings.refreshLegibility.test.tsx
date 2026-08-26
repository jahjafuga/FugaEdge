import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.7 — MAKE THE RUN LEGIBLE: the rendered half.
//
// ONE MOUNT FOR THE WHOLE FILE. The Settings subtree is large and every extra
// mount of a page in this suite has a measured cost: beat 85 found that two page
// mounts in one file destabilised a NEIGHBOURING suite. Everything below is
// therefore asserted against a single rendered page, driven forward rather than
// re-rendered from scratch.
//
// WHY THE TOOLTIP MAY NOT NAME A DURATION. A cached book finishes in seconds and
// a cold one can run for the better part of an hour. Any number in that tooltip
// is a lie for one of those two users, so it sets expectation in words and the
// bar reports the measured truth once there is one.
//
// RP6 IS THE SCOPE GUARD and is green before the cure. A guard that is green
// from the start proves nothing on its own, so a plant exists to redden it.

vi.mock('@/lib/ipc', () => ({
  ipc: {
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    testMassiveKey: vi.fn(async () => ({ kind: 'valid' })),
    testFmpKey: vi.fn(async () => ({ kind: 'valid' })),
    mistakeDefsGet: vi.fn(async () => []),
    mistakeDefCreate: vi.fn(),
    mistakeDefRename: vi.fn(),
    mistakeDefDelete: vi.fn(),
    mistakeDefReorder: vi.fn(),
    mistakeDefUnarchive: vi.fn(),
    catalystDefsGet: vi.fn(async () => []),
    catalystDefCreate: vi.fn(),
    catalystDefRename: vi.fn(),
    catalystDefDelete: vi.fn(),
    catalystDefReorder: vi.fn(),
    catalystDefUnarchive: vi.fn(),
    accountsList: vi.fn(async () => []),
    cashEventsList: vi.fn(async () => []),
    cashBalanceGet: vi.fn(async () => null),
    ruleBreakUsage: vi.fn(async () => ({})),
    journalRuleUsage: vi.fn(async () => ({})),
    tradesList: vi.fn(async () => []),
    tradeRestore: vi.fn(),
    tradesRestoreBulk: vi.fn(),
    tradeHardDelete: vi.fn(),
    tradesHardDeleteBulk: vi.fn(),
    countryBackfill: vi.fn(),
    floatBackfill: vi.fn(),
    profileBackfill: vi.fn(),
    dailyChangeBackfill: vi.fn(),
    recoverStrandedWarmup: vi.fn(),
    countryOnBackfillProgress: vi.fn(() => () => {}),
    floatOnBackfillProgress: vi.fn(() => () => {}),
    profileOnBackfillProgress: vi.fn(() => () => {}),
    warmupOnBackfillProgress: vi.fn(() => () => {}),
    dailyChangeOnBackfillProgress: vi.fn(() => () => {}),
    exportTrades: vi.fn(),
    exportJournal: vi.fn(),
    exportDatabase: vi.fn(),
    openExternal: vi.fn(),
    resetDatabase: vi.fn(),
    getVersion: vi.fn(async () => 'test'),
    marketRefresh: vi.fn(),
    marketIntradayRefresh: vi.fn(),
    marketRefreshCancel: vi.fn(),
    marketIntradayCancel: vi.fn(),
    marketOnRefreshProgress: vi.fn(() => () => {}),
    marketOnIntradayProgress: vi.fn(() => () => {}),
  },
}))

import Settings from '@/pages/Settings'
import { ipc } from '@/lib/ipc'
import { getRefreshState } from '@/lib/refreshStore'
import type { IntradayRefreshResult } from '@shared/market-types'
import { makeSettingsPayload } from '@/test/fixtures/settings'

const m = vi.mocked(ipc)

const ACTIVE_CATEGORY_KEY = 'fuga.settings.activeCategory'

function installMockLocalStorage(active: string) {
  const store = new Map<string, string>([[ACTIVE_CATEGORY_KEY, active]])
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  installMockLocalStorage('market')
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ polygon_api_key: 'test-key' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload({ polygon_api_key: 'test-key' }))
  m.marketOnRefreshProgress.mockReturnValue(() => {})
  m.marketOnIntradayProgress.mockReturnValue(() => {})
})

/** A run that stays in flight until the test is over.
 *
 *  refreshStore is a MODULE-LEVEL singleton, so a promise left pending would
 *  leave `running: true` for every later test in this file — the next mount
 *  would come up already showing "Fetching intraday…" and its query for the
 *  idle label would fail for a reason that has nothing to do with the subject.
 *  Measured, not theorised: that is exactly how the first RED run failed. So the
 *  deferred is settled in afterEach and the store is watched back to idle. */
let settlePending: ((v: IntradayRefreshResult) => void) | null = null
function runInFlight(): Promise<IntradayRefreshResult> {
  return new Promise<IntradayRefreshResult>((resolve) => {
    settlePending = resolve
  })
}

const IDLE_RESULT: IntradayRefreshResult = {
  fetched: 0,
  failed: 0,
  skipped: 0,
  attempted: 0,
  maeMfeBackfilled: 0,
  durationMs: 0,
  apiKeyMissing: false,
  cancelled: false,
  errors: [],
}

afterEach(async () => {
  if (settlePending) {
    settlePending(IDLE_RESULT)
    settlePending = null
    await waitFor(() => expect(getRefreshState().intraday.running).toBe(false))
  }
  cleanup()
  vi.useRealTimers()
})

const INTRADAY_LABEL = 'Refresh intraday (1-min)'

async function mountSettings() {
  render(<Settings />)
  await waitFor(() => expect(screen.getByText(INTRADAY_LABEL)).toBeTruthy())
}

// ─── RP5 : THE TOOLTIP NAMES NO DURATION ─────────────────────────────────────

describe('RP5 the intraday tooltip sets expectation without naming a duration', () => {
  it('it carries no digit at all', async () => {
    await mountSettings()
    const title = screen.getByText(INTRADAY_LABEL).closest('button')!.getAttribute('title') ?? ''

    expect(title, 'the tooltip is empty — it sets no expectation whatsoever').not.toBe('')
    expect(
      title.match(/[0-9]/g) ?? [],
      'a digit in this tooltip is a hardcoded duration by definition, and it is ' +
        'a lie for whichever of the two users it does not describe',
    ).toEqual([])
  })

  it('and it DOES tell the user the run can be long', async () => {
    await mountSettings()
    const title = screen.getByText(INTRADAY_LABEL).closest('button')!.getAttribute('title') ?? ''
    // Removing the number is only half the ruling; the other half is that the
    // tooltip must still set an expectation.
    expect(
      /long|while|time/i.test(title),
      'the tooltip warns of nothing — a user starting a cold book has no idea',
    ).toBe(true)
  })
})

// ─── RP3 : NO FABRICATED ESTIMATE BEFORE THE FIRST EVENT ─────────────────────

describe('RP3 before the first progress event the estimate is an em-dash', () => {
  it('the running bar shows a dash, not a zero and not a placeholder', async () => {
    // A refresh that never settles, so the bar stays up and progress stays null.
    m.marketIntradayRefresh.mockReturnValue(runInFlight())
    await mountSettings()

    fireEvent.click(screen.getByText(INTRADAY_LABEL))

    const eta = await screen.findByTestId('refresh-eta')
    expect(
      eta.textContent,
      'an estimate was rendered before any pace existed — that is fabricated data',
    ).toBe('—')
    expect(eta.textContent).not.toMatch(/[0-9]/)
    expect(eta.textContent?.toLowerCase()).not.toContain('calculating')
  })
})

// ─── RP6 : SCOPE GUARD — GREEN BEFORE THE CURE ───────────────────────────────

describe('RP6 the button and the completion summary still work', () => {
  it('the button relabels and disables while a run is in flight', async () => {
    m.marketIntradayRefresh.mockReturnValue(runInFlight())
    await mountSettings()

    const before = screen.getByText(INTRADAY_LABEL).closest('button')!
    expect(before.hasAttribute('disabled')).toBe(false)

    fireEvent.click(before)

    const during = await screen.findByText('Fetching intraday…')
    expect(
      during.closest('button')!.hasAttribute('disabled'),
      'the button stayed clickable during a run',
    ).toBe(true)
  })

  it('and the completion summary still reports fetched and failed', async () => {
    m.marketIntradayRefresh.mockResolvedValue({
      fetched: 7,
      failed: 2,
      skipped: 1,
      attempted: 10,
      maeMfeBackfilled: 3,
      durationMs: 3_276_000,
      apiKeyMissing: false,
      cancelled: false,
      errors: [],
    })
    await mountSettings()

    fireEvent.click(screen.getByText(INTRADAY_LABEL))

    await waitFor(() => expect(screen.getByText('Intraday refresh')).toBeTruthy())
    const box = within(screen.getByText('Intraday refresh').closest('div')!.parentElement!)
    expect(box.getByText('7'), 'the fetched count left the summary').toBeTruthy()
    expect(box.getByText('2'), 'the failed count left the summary').toBeTruthy()
    expect(box.getByText(/pairs fetched/)).toBeTruthy()
    expect(box.getByText(/failed/)).toBeTruthy()
  })
})

// ─── RP1b : THE RENDERED DURATION, END TO END ────────────────────────────────

describe('RP1b the completion summary renders its duration in human units', () => {
  it('a cold-book run reads as minutes and seconds, not a float of seconds', async () => {
    m.marketIntradayRefresh.mockResolvedValue({
      fetched: 7,
      failed: 2,
      skipped: 1,
      attempted: 10,
      maeMfeBackfilled: 3,
      // The measured case that opened this beat: this used to render "3276.0s".
      durationMs: 3_276_000,
      apiKeyMissing: false,
      cancelled: false,
      errors: [],
    })
    await mountSettings()

    fireEvent.click(screen.getByText(INTRADAY_LABEL))

    await waitFor(() => expect(screen.getByText('Intraday refresh')).toBeTruthy())
    expect(
      screen.getByText('54m 36s'),
      'the run duration is still a raw float of seconds',
    ).toBeTruthy()
    expect(screen.queryByText('3276.0s'), 'the raw-seconds render survived').toBeNull()
  })

  it('and so does the MARKET summary, which carries the same defect', async () => {
    // There are TWO raw-seconds renders on this card, not one. Guarding only the
    // intraday half would reproduce the exact "six of seven handled" shape this
    // codebase has already paid for once.
    m.marketRefresh.mockResolvedValue({
      fetched: 4,
      failed: 0,
      durationMs: 3_276_000,
      apiKeyMissing: false,
      errors: [],
    } as never)
    await mountSettings()

    fireEvent.click(screen.getByText('Refresh market data'))

    await waitFor(() => expect(screen.getByText('54m 36s')).toBeTruthy())
    expect(screen.queryByText('3276.0s'), 'the market raw-seconds render survived').toBeNull()
  })
})
