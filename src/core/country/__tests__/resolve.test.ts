import { describe, it, expect } from 'vitest'
import { resolveCountryFromPolygon, resolveCountryFromFmp } from '../resolve'

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

  it('locale="us" with no address → US but marked inferred (US-listing ≠ US-domicile)', () => {
    const r = resolveCountryFromPolygon({ results: { locale: 'us' } })
    expect(r.country).toBe('US')
    expect(r.source).toBe('inferred')
  })

  it('falls back to primary_exchange XHKG → HK (inferred from listing)', () => {
    const r = resolveCountryFromPolygon({ results: { primary_exchange: 'XHKG' } })
    expect(r.country).toBe('HK')
    expect(r.source).toBe('inferred')
  })

  it('falls back to primary_exchange XNAS / XNYS → US (inferred)', () => {
    const a = resolveCountryFromPolygon({ results: { primary_exchange: 'XNAS' } })
    const b = resolveCountryFromPolygon({ results: { primary_exchange: 'XNYS' } })
    expect(a.country).toBe('US')
    expect(a.source).toBe('inferred')
    expect(b.country).toBe('US')
    expect(b.source).toBe('inferred')
  })

  it('real foreign address (IL) passes through confident', () => {
    const r = resolveCountryFromPolygon({ results: { address: { country: 'IL' } } })
    expect(r).toMatchObject({ country: 'IL', source: 'polygon' })
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

describe('resolveCountryFromFmp (v0.2.3 Stage 1 — PRIMARY)', () => {
  it('valid alpha-2 → confident source "fmp" with name + region filled', () => {
    expect(resolveCountryFromFmp('IL')).toEqual({
      country: 'IL', country_name: 'Israel', region: 'Israel', source: 'fmp',
    })
  })

  it('the SPRC bug case: FMP returns IL where Polygon would say US (inferred)', () => {
    // SPRC is NASDAQ-listed, so Polygon's locale path yields US/inferred…
    expect(resolveCountryFromPolygon({ results: { locale: 'us' } })).toMatchObject({
      country: 'US', source: 'inferred',
    })
    // …but FMP's domicile resolves IL/fmp — the whole point of Stage 1.
    expect(resolveCountryFromFmp('IL')).toMatchObject({ country: 'IL', source: 'fmp' })
  })

  it('normalizes lowercase to uppercase', () => {
    expect(resolveCountryFromFmp('ca')).toMatchObject({ country: 'CA', source: 'fmp' })
  })

  it('maps an unmapped-but-valid ISO into the Other region (still confident)', () => {
    // AE isn't in REGION_MAP; getRegionForCountry returns 'Other', getCountryName
    // still has a display name. Source stays 'fmp' — it's a real domicile.
    expect(resolveCountryFromFmp('AE')).toEqual({
      country: 'AE', country_name: 'United Arab Emirates', region: 'Other', source: 'fmp',
    })
  })

  it('null → unknown sentinel (orchestrator reads this as "fall back to Polygon")', () => {
    expect(resolveCountryFromFmp(null)).toEqual({
      country: null, country_name: 'Unknown', region: 'Unknown', source: 'unknown',
    })
  })

  it('empty / malformed string → unknown sentinel', () => {
    expect(resolveCountryFromFmp('')).toMatchObject({ country: null, source: 'unknown' })
    expect(resolveCountryFromFmp('USA')).toMatchObject({ country: null, source: 'unknown' })
    expect(resolveCountryFromFmp('1')).toMatchObject({ country: null, source: 'unknown' })
  })
})
