import { describe, it, expect } from 'vitest'
import {
  REGION_MAP,
  REGION_REPRESENTATIVE_COUNTRY,
  SHELL_JURISDICTIONS,
  REGIONS,
  getRegionForCountry,
  getCountryName,
} from '../regions'

describe('regions', () => {
  it('maps every Europe country code', () => {
    for (const iso of ['DE','FR','IT','ES','NL','CH','SE','NO','DK','FI','IE','BE','AT','PT','LU','GR','PL','CZ','HU']) {
      expect(REGION_MAP[iso]).toBe('Europe')
    }
  })

  it('folds Macau into China but keeps Hong Kong separate', () => {
    expect(REGION_MAP['MO']).toBe('China')
    expect(REGION_MAP['CN']).toBe('China')
    expect(REGION_MAP['HK']).toBe('Hong Kong')
  })

  it('lists exactly the seven shell jurisdictions', () => {
    expect([...SHELL_JURISDICTIONS].sort()).toEqual(
      ['BM','GG','IM','JE','KY','MH','VG'].sort(),
    )
  })

  it('REGIONS lists USA first', () => {
    expect(REGIONS[0]).toBe('USA')
    expect(REGIONS).toContain('Unknown')
  })

  it('getRegionForCountry returns Unknown for null/empty/unmapped', () => {
    expect(getRegionForCountry(null)).toBe('Unknown')
    expect(getRegionForCountry('')).toBe('Unknown')
    expect(getRegionForCountry(undefined)).toBe('Unknown')
    expect(getRegionForCountry('ZZ')).toBe('Other')
  })

  it('getRegionForCountry treats malformed codes as Unknown', () => {
    expect(getRegionForCountry('z')).toBe('Unknown')   // single char
    expect(getRegionForCountry('Z1')).toBe('Unknown')  // digit
    expect(getRegionForCountry('zz')).toBe('Other')    // lowercase valid → normalized
  })

  it('getCountryName handles known and unknown codes', () => {
    expect(getCountryName('US')).toBe('United States')
    expect(getCountryName('CN')).toBe('China')
    expect(getCountryName(null)).toBe('Unknown')
    expect(getCountryName('ZZ')).toBe('Unknown')
  })

  it('REGION_REPRESENTATIVE_COUNTRY has an entry for every REGIONS key', () => {
    for (const r of REGIONS) {
      expect(r in REGION_REPRESENTATIVE_COUNTRY).toBe(true)
    }
  })

  it('multi-country regions and Unknown map to null', () => {
    expect(REGION_REPRESENTATIVE_COUNTRY.Europe).toBeNull()
    expect(REGION_REPRESENTATIVE_COUNTRY.LatAm).toBeNull()
    expect(REGION_REPRESENTATIVE_COUNTRY.Other).toBeNull()
    expect(REGION_REPRESENTATIVE_COUNTRY.Unknown).toBeNull()
  })
})
