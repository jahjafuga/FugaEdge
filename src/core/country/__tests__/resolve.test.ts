import { describe, it, expect } from 'vitest'
import { resolveCountryFromPolygon } from '../resolve'

describe('resolveCountryFromPolygon', () => {
  it('plain US ticker', () => {
    const r = resolveCountryFromPolygon({ results: { address: { country: 'US' } } })
    expect(r).toEqual({
      country: 'US', country_name: 'United States', region: 'USA', source: 'polygon',
    })
  })

  it('Chinese ADR shelled in Cayman → CN via name heuristic', () => {
    const r = resolveCountryFromPolygon({
      results: {
        address: { country: 'KY' },
        name: 'Some Pharmaceutical (China) Holdings',
      },
    })
    expect(r.country).toBe('CN')
    expect(r.region).toBe('China')
    expect(r.source).toBe('polygon')
  })

  it('Hong Kong direct', () => {
    const r = resolveCountryFromPolygon({ results: { address: { country: 'HK' } } })
    expect(r.country).toBe('HK')
    expect(r.region).toBe('Hong Kong')
  })

  it('Singapore via shell jurisdiction with description hint', () => {
    const r = resolveCountryFromPolygon({
      results: {
        address: { country: 'VG' },
        name: 'Acme Holdings',
        description: 'Headquartered in Singapore with regional offices in Bangkok.',
      },
    })
    expect(r.country).toBe('SG')
    expect(r.region).toBe('Singapore')
  })

  it('empty response → Unknown', () => {
    expect(resolveCountryFromPolygon({})).toEqual({
      country: null, country_name: 'Unknown', region: 'Unknown', source: 'unknown',
    })
  })

  it('falls back to locale="us" when address is missing', () => {
    const r = resolveCountryFromPolygon({ results: { locale: 'us' } })
    expect(r.country).toBe('US')
    expect(r.source).toBe('polygon')
  })

  it('falls back to primary_exchange XHKG → HK', () => {
    const r = resolveCountryFromPolygon({ results: { primary_exchange: 'XHKG' } })
    expect(r.country).toBe('HK')
  })

  it('falls back to primary_exchange XNAS / XNYS → US', () => {
    expect(resolveCountryFromPolygon({ results: { primary_exchange: 'XNAS' } }).country).toBe('US')
    expect(resolveCountryFromPolygon({ results: { primary_exchange: 'XNYS' } }).country).toBe('US')
  })

  it('falls back to primary_exchange XSES → SG', () => {
    expect(resolveCountryFromPolygon({ results: { primary_exchange: 'XSES' } }).country).toBe('SG')
  })

  it('shell with no name/description hints → Unknown (does not silently keep KY)', () => {
    const r = resolveCountryFromPolygon({ results: { address: { country: 'KY' } } })
    expect(r.country).toBeNull()
    expect(r.region).toBe('Unknown')
    expect(r.source).toBe('unknown')
  })

  it('non-shell European country passes through unchanged', () => {
    const r = resolveCountryFromPolygon({ results: { address: { country: 'DE' } } })
    expect(r.country).toBe('DE')
    expect(r.region).toBe('Europe')
  })

  it('uppercases lowercase ISO from address', () => {
    const r = resolveCountryFromPolygon({ results: { address: { country: 'us' } } })
    expect(r.country).toBe('US')
  })

  it('sic_description hint when name/description omitted', () => {
    const r = resolveCountryFromPolygon({
      results: {
        address: { country: 'KY' },
        sic_description: 'Pharmaceuticals manufacturing in Tel Aviv area',
      },
    })
    expect(r.country).toBe('IL')
  })
})
