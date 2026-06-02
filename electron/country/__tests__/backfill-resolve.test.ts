import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.3 Stage 1.5 — the country backfill batch path now resolves FMP-primary,
// Polygon-fallback (mirrors resolveForTicker / the import orchestrator). We mock
// the provider fetches + repo writes but keep the PURE resolvers real, so the
// source assignment ('fmp' / 'polygon' / 'inferred') is genuinely exercised.
// The worklist's confident/manual exclusion lives in isCountryReResolvable
// (kept real here too — its full table is in core/country/__tests__/source).

let settingsValues: Record<string, unknown> = { polygon_api_key: 'pk', fmp_api_key: 'fk' }

vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: settingsValues }),
}))

vi.mock('@/services/fmp', () => ({ fetchCompanyProfile: vi.fn() }))

vi.mock('../../market/massive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../market/massive')>()
  return { ...actual, fetchTickerReference: vi.fn() } // keep real MassiveError
})

vi.mock('../../market/rate-limit', () => ({
  withRateLimitRetry: (fn: () => unknown) => fn(),
}))

vi.mock('../../trades/country', () => ({
  tradesNeedingCountryFetch: vi.fn(),
  applyCountryToBoth: vi.fn(() => 1),
  saveTradeCountry: vi.fn(),
}))

import { backfillAllCountries } from '../fetch'
import { isCountryReResolvable } from '@/core/country/source'
import { fetchCompanyProfile } from '@/services/fmp'
import { fetchTickerReference } from '../../market/massive'
import { tradesNeedingCountryFetch, applyCountryToBoth } from '../../trades/country'

const fmpMock = fetchCompanyProfile as unknown as ReturnType<typeof vi.fn>
const refMock = fetchTickerReference as unknown as ReturnType<typeof vi.fn>
const worklistMock = tradesNeedingCountryFetch as unknown as ReturnType<typeof vi.fn>
const applyMock = applyCountryToBoth as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  settingsValues = { polygon_api_key: 'pk', fmp_api_key: 'fk' }
  worklistMock.mockReturnValue([{ symbol: 'SPRC', trade_ids: [1] }])
  applyMock.mockReturnValue(1)
  fmpMock.mockResolvedValue(null)
  refMock.mockResolvedValue({ results: {} })
})

describe('backfillAllCountries — FMP-primary batch resolution (Stage 1.5)', () => {
  it('(a) FMP country hit → applies source=fmp and never calls Polygon', async () => {
    fmpMock.mockResolvedValue({ country: 'IL' })
    await backfillAllCountries({})
    expect(applyMock).toHaveBeenCalledWith(
      'SPRC',
      expect.objectContaining({ country: 'IL', source: 'fmp' }),
    )
    expect(refMock).not.toHaveBeenCalled() // short-circuit
  })

  it('(b) FMP null country → Polygon address.country fallback, source=polygon', async () => {
    fmpMock.mockResolvedValue({ country: null })
    refMock.mockResolvedValue({ results: { address: { country: 'US' } } })
    await backfillAllCountries({})
    expect(refMock).toHaveBeenCalled()
    expect(applyMock).toHaveBeenCalledWith(
      'SPRC',
      expect.objectContaining({ country: 'US', source: 'polygon' }),
    )
  })

  it('(b2) FMP null country → Polygon listing-only guess, source=inferred', async () => {
    fmpMock.mockResolvedValue({ country: null })
    refMock.mockResolvedValue({ results: { locale: 'us' } }) // US-listed, no domicile
    await backfillAllCountries({})
    expect(applyMock).toHaveBeenCalledWith(
      'SPRC',
      expect.objectContaining({ country: 'US', source: 'inferred' }),
    )
  })

  it('(c) FMP throws → falls through to Polygon, no batch failure', async () => {
    fmpMock.mockRejectedValue(new Error('Request timed out after 15000ms'))
    refMock.mockResolvedValue({ results: { address: { country: 'US' } } })
    const res = await backfillAllCountries({})
    expect(refMock).toHaveBeenCalled()
    expect(applyMock).toHaveBeenCalledWith('SPRC', expect.objectContaining({ source: 'polygon' }))
    expect(res.failed).toBe(0) // FMP error suppressed, not a per-symbol failure
  })

  it('(d) force=true is passed through to the worklist', async () => {
    worklistMock.mockReturnValue([])
    await backfillAllCountries({ force: true })
    expect(worklistMock).toHaveBeenCalledWith(true)
  })

  it('(e) incremental (no force) passes false to the worklist', async () => {
    worklistMock.mockReturnValue([])
    await backfillAllCountries({})
    expect(worklistMock).toHaveBeenCalledWith(false)
  })

  it('(d/e semantics) force re-resolves polygon-confident rows; incremental skips them', () => {
    expect(isCountryReResolvable('polygon', true)).toBe(true) // force includes confident
    expect(isCountryReResolvable('polygon', false)).toBe(false) // incremental excludes
  })

  it('(f) manual rows are never re-resolvable, force or not', () => {
    expect(isCountryReResolvable('manual', true)).toBe(false)
    expect(isCountryReResolvable('manual', false)).toBe(false)
  })

  it('(g) apiKeyMissing only when BOTH keys are absent', async () => {
    settingsValues = { polygon_api_key: '', fmp_api_key: '' }
    expect((await backfillAllCountries({})).apiKeyMissing).toBe(true)

    // FMP-only is enough to run now — no apiKeyMissing short-circuit.
    settingsValues = { polygon_api_key: '', fmp_api_key: 'fk' }
    worklistMock.mockReturnValue([])
    expect((await backfillAllCountries({})).apiKeyMissing).toBe(false)
  })
})
