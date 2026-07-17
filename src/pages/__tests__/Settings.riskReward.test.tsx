import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Settings from '@/pages/Settings'
import { ipc } from '@/lib/ipc'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { shouldShowOnboarding } from '@/core/onboarding/state'

// Dave #11 — the Risk & reward group + the account_size retirement.
//   LAYOUT: Daily profit target moves adjacent to the risk card (positional
//     only — its own-writer save path is pinned unchanged by
//     DailyTargetSection.test.tsx); the group reads "Risk & reward"; the
//     Account size field leaves Settings entirely.
//   FIRST-LAUNCH INTACT: onboarding stays the field's only writer and the
//     stored_keys row-existence gate keeps working — pinned here so the
//     retirement can never resurrect onboarding.
//   SWEEPS: the Compare accountSize prop chain (earmarked "removable" at its
//     retirement), the dashboard payload field (zero renderer consumers), and
//     the orphaned netPnlPctOfAccount are gone — pinned at the source level.
//
// The ipc mock mirrors Settings.savebar.test.tsx (the whole <Settings>
// subtree mounts, so every IPC touched on mount is stubbed).
vi.mock('@/lib/ipc', () => ({
  ipc: {
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    testMassiveKey: vi.fn(),
    testFmpKey: vi.fn(),
    mistakeDefsGet: vi.fn(),
    mistakeDefCreate: vi.fn(),
    mistakeDefRename: vi.fn(),
    mistakeDefDelete: vi.fn(),
    mistakeDefReorder: vi.fn(),
    mistakeDefUnarchive: vi.fn(),
    catalystDefsGet: vi.fn(),
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
    tradesList: vi.fn(),
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
    getVersion: vi.fn(),
  },
}))

const m = vi.mocked(ipc)

const src = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  // Land on the Trading pane (the page persists the active category).
  window.localStorage.setItem('fuga.settings.activeCategory', 'trading')
  m.settingsGet.mockResolvedValue(makeSettingsPayload({}))
  m.mistakeDefsGet.mockResolvedValue([] as never)
  m.catalystDefsGet.mockResolvedValue([] as never)
  m.tradesList.mockResolvedValue([] as never)
})

describe('(1) the Trading pane — Risk & reward group, Account size retired', () => {
  it('renders "Risk & reward" with Max daily loss and the Daily profit target section adjacent; no Account size field', async () => {
    render(<Settings />)

    const risk = await screen.findByText('Risk & reward')
    expect(screen.getByText('Max daily loss alert')).toBeTruthy()
    // The own-writer section's card renders directly adjacent — after the risk
    // card, before the Trading accounts registry.
    const target = screen.getByText('Daily profit target', { selector: 'h3, h2, div, span' })
    const accounts = screen.getByText('Trading accounts')
    expect(
      // eslint-disable-next-line no-bitwise
      (risk.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true)
    expect(
      // eslint-disable-next-line no-bitwise
      (target.compareDocumentPosition(accounts) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true)

    // The retirement: no Account size field (or label) anywhere on the page.
    expect(screen.queryByText('Account size')).toBeNull()
    // The old card title is gone too — the group replaced it.
    expect(screen.queryByText('Risk management')).toBeNull()
  })
})

describe('(4) first-launch behavior is byte-identical after the retirement', () => {
  it('the onboarding wizard still writes account_size (source pin)', () => {
    const wizard = src('../../components/onboarding/OnboardingModal.tsx')
    expect(wizard).toMatch(/account_size:\s*accountSize/)
  })

  it('the gate still keys on stored_keys row existence', () => {
    const base = { tradeCount: 0, flagSet: false }
    expect(shouldShowOnboarding({ ...base, accountSizeStored: false })).toBe(true)
    expect(shouldShowOnboarding({ ...base, accountSizeStored: true })).toBe(false)
  })
})

describe('(5)(6)(7) the dead-plumbing sweeps (source pins, comments stripped)', () => {
  const codeLines = (raw: string): string =>
    raw
      .split(/\r?\n/)
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n')

  it('(5) the dashboard payload no longer reads or carries account_size', () => {
    expect(codeLines(src('../../../electron/stats/dashboard.ts'))).not.toMatch(/account_size/)
    expect(codeLines(src('../../../shared/dashboard-types.ts'))).not.toMatch(/account_size/)
  })

  it('(6) the Compare accountSize prop chain is gone end to end', () => {
    expect(codeLines(src('../../components/analytics/tabs/AnalyticsCompareTab.tsx'))).not.toMatch(
      /accountSize|account_size/,
    )
    expect(codeLines(src('../../components/reports/overview/CompareView.tsx'))).not.toMatch(
      /accountSize/,
    )
  })

  it('(7) netPnlPctOfAccount is referenced nowhere (fn, barrel, tests)', () => {
    expect(codeLines(src('../../core/performance/metrics.ts'))).not.toMatch(/netPnlPctOfAccount/)
    expect(codeLines(src('../../core/performance/index.ts'))).not.toMatch(/netPnlPctOfAccount/)
    expect(
      codeLines(src('../../core/performance/__tests__/phase3-metrics.test.ts')),
    ).not.toMatch(/netPnlPctOfAccount/)
  })
})
