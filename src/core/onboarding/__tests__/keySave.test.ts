import { describe, expect, it } from 'vitest'
import { buildOnboardingKeySave } from '../keySave'

// isPlausibleApiKey requires >= 16 chars matching [A-Za-z0-9_-].
const MASSIVE = 'massive-key-1234567890'
const FMP = 'fmpkey1234567890ABCD'

describe('buildOnboardingKeySave', () => {
  it('both plausible -> both keys, trimmed', () => {
    expect(buildOnboardingKeySave(`  ${MASSIVE}  `, FMP)).toEqual({
      polygon_api_key: MASSIVE,
      fmp_api_key: FMP,
    })
  })

  it('Massive only -> polygon_api_key only', () => {
    expect(buildOnboardingKeySave(MASSIVE, '')).toEqual({ polygon_api_key: MASSIVE })
  })

  it('FMP only -> fmp_api_key only (the case ApiKeyEntry cannot handle)', () => {
    expect(buildOnboardingKeySave('', FMP)).toEqual({ fmp_api_key: FMP })
  })

  it('neither plausible -> empty payload', () => {
    expect(buildOnboardingKeySave('too-short', '   ')).toEqual({})
  })
})
