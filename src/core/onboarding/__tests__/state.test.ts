import { describe, expect, it } from 'vitest'
import { shouldShowOnboarding } from '../state'

// v0.2.5 Phase B Session 5 (L24) — the fresh-install detector. The old
// heuristic read the DEFAULTED account_size (25,000 on a fresh DB), so the
// acct > 0 branch suppressed onboarding on every fresh install. The fix
// detects "configured" via RAW ROW EXISTENCE (settings stored_keys), which
// the defaulting layer can never fake.

describe('shouldShowOnboarding (L24)', () => {
  it('fresh install — no trades, no stored account_size, no flag → true', () => {
    expect(
      shouldShowOnboarding({
        tradeCount: 0,
        accountSizeStored: false,
        flagSet: false,
      }),
    ).toBe(true)
  })

  it('a STORED account_size suppresses (the user configured it)', () => {
    expect(
      shouldShowOnboarding({
        tradeCount: 0,
        accountSizeStored: true,
        flagSet: false,
      }),
    ).toBe(false)
  })

  it('trades present suppress regardless of storage', () => {
    expect(
      shouldShowOnboarding({
        tradeCount: 3,
        accountSizeStored: false,
        flagSet: false,
      }),
    ).toBe(false)
  })

  it('the completion flag suppresses', () => {
    expect(
      shouldShowOnboarding({
        tradeCount: 0,
        accountSizeStored: false,
        flagSet: true,
      }),
    ).toBe(false)
  })

  it('the force token short-circuits everything (Restart onboarding)', () => {
    expect(
      shouldShowOnboarding({
        tradeCount: 9,
        accountSizeStored: true,
        flagSet: true,
        forceRestart: true,
      }),
    ).toBe(true)
  })
})
