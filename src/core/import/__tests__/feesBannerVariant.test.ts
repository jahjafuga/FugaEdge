import { describe, expect, it } from 'vitest'
import { deriveFeesBannerVariant } from '../feesBannerVariant'

describe('deriveFeesBannerVariant', () => {
  it('DAS-only (deduped) → das', () => {
    expect(deriveFeesBannerVariant(['DAS', 'DAS'])).toBe('das')
  })

  it('ThinkorSwim-only → thinkorswim (keys on the EMITTED literal, not the dead "ToS")', () => {
    expect(deriveFeesBannerVariant(['ThinkorSwim', 'ThinkorSwim'])).toBe('thinkorswim')
  })

  it('single non-DAS/non-ThinkorSwim broker → generic', () => {
    expect(deriveFeesBannerVariant(['Lightspeed'])).toBe('generic')
  })

  it('mixed brokers → generic (neutral)', () => {
    expect(deriveFeesBannerVariant(['DAS', 'ThinkorSwim'])).toBe('generic')
  })

  it('no brokers → generic (defensive)', () => {
    expect(deriveFeesBannerVariant([])).toBe('generic')
  })
})
