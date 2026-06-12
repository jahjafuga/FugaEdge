import { describe, expect, it } from 'vitest'
import { resolveActivationStatus, GRACE_DAYS } from '../status'

// v0.2.5 §C / D2 decision table. now is fixed; graceStartedAt offsets are
// computed from it so the boundary cases are exact.

const NOW = '2026-06-12T12:00:00.000Z'

const daysBeforeNow = (n: number) =>
  new Date(Date.parse(NOW) - n * 86_400_000).toISOString()

const base = {
  isPackaged: true,
  forceGate: false,
  hasVerifiedKey: false,
  tradeCount: 0,
  graceStartedAt: null as string | null,
  now: NOW,
}

describe('resolveActivationStatus', () => {
  it('dev without the force flag bypasses the gate entirely (R2)', () => {
    expect(
      resolveActivationStatus({
        ...base,
        isPackaged: false,
        tradeCount: 42,
        graceStartedAt: daysBeforeNow(99),
      }),
    ).toEqual({ mode: 'activated' })
  })

  it('a verified key activates everywhere (packaged and dev+force)', () => {
    expect(
      resolveActivationStatus({ ...base, hasVerifiedKey: true }),
    ).toEqual({ mode: 'activated' })
    expect(
      resolveActivationStatus({
        ...base,
        isPackaged: false,
        forceGate: true,
        hasVerifiedKey: true,
      }),
    ).toEqual({ mode: 'activated' })
  })

  it('no key + zero trades → gate (ahead of onboarding)', () => {
    expect(resolveActivationStatus(base)).toEqual({ mode: 'gate' })
  })

  it('dev + force flag enforces the same gate as packaged (R2)', () => {
    expect(
      resolveActivationStatus({ ...base, isPackaged: false, forceGate: true }),
    ).toEqual({ mode: 'gate' })
  })

  it('no key + existing trades + no stamp → full grace, asks to stamp', () => {
    expect(resolveActivationStatus({ ...base, tradeCount: 7 })).toEqual({
      mode: 'grace',
      graceDaysLeft: GRACE_DAYS,
      shouldStampGraceStart: true,
    })
  })

  it('an existing stamp is respected — no re-stamp (idempotence)', () => {
    expect(
      resolveActivationStatus({
        ...base,
        tradeCount: 7,
        graceStartedAt: daysBeforeNow(2),
      }),
    ).toEqual({ mode: 'grace', graceDaysLeft: 12 })
  })

  it('day-13 boundary: still grace with 1 day left', () => {
    expect(
      resolveActivationStatus({
        ...base,
        tradeCount: 7,
        graceStartedAt: daysBeforeNow(13),
      }),
    ).toEqual({ mode: 'grace', graceDaysLeft: 1 })
  })

  it('13 days and 21 hours elapsed: still grace with 1 day left', () => {
    const start = new Date(
      Date.parse(NOW) - (13 * 24 + 21) * 3_600_000,
    ).toISOString()
    expect(
      resolveActivationStatus({ ...base, tradeCount: 7, graceStartedAt: start }),
    ).toEqual({ mode: 'grace', graceDaysLeft: 1 })
  })

  it('day-14 boundary: grace expired → locked', () => {
    expect(
      resolveActivationStatus({
        ...base,
        tradeCount: 7,
        graceStartedAt: daysBeforeNow(14),
      }),
    ).toEqual({ mode: 'locked' })
  })

  it('day-15: locked', () => {
    expect(
      resolveActivationStatus({
        ...base,
        tradeCount: 7,
        graceStartedAt: daysBeforeNow(15),
      }),
    ).toEqual({ mode: 'locked' })
  })

  it('a future stamp (clock skew) clamps to full grace and does not re-stamp', () => {
    expect(
      resolveActivationStatus({
        ...base,
        tradeCount: 7,
        graceStartedAt: daysBeforeNow(-1),
      }),
    ).toEqual({ mode: 'grace', graceDaysLeft: GRACE_DAYS })
  })

  it('an unparseable stamp heals: full grace + re-stamp requested', () => {
    expect(
      resolveActivationStatus({
        ...base,
        tradeCount: 7,
        graceStartedAt: 'not-a-timestamp',
      }),
    ).toEqual({
      mode: 'grace',
      graceDaysLeft: GRACE_DAYS,
      shouldStampGraceStart: true,
    })
  })
})
