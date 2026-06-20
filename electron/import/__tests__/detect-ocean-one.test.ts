import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { matchesOceanOneHeader, detectOceanOneXls } from '../parse-ocean-one'

// The full Ocean One column-header row (confirmed against the real fixture in
// beat 1). Used as the positive synthetic case.
const OO_HEADER = [
  'Opened', 'Closed', 'Held', 'Symbol', 'Type', 'Entry', 'Exit', 'Qty', 'Gross',
  'Comm', 'Ecn Fee', 'SEC', 'ORF', 'CAT', 'TAF', 'OCC', 'NSCC', 'Acc', 'Clr', 'Misc', 'Net',
]

// Pure matcher — runs on CI without the (gitignored) fixture.
describe('matchesOceanOneHeader — the Ocean One signature', () => {
  it('matches the full Ocean One header row', () => {
    expect(matchesOceanOneHeader(OO_HEADER)).toBe(true)
  })

  it('matches even with surrounding whitespace on the labels', () => {
    expect(matchesOceanOneHeader(OO_HEADER.map((h) => `  ${h} `))).toBe(true)
  })

  it('rejects a DAS tradehistory header (Date/Time/Symbol/...)', () => {
    expect(matchesOceanOneHeader(['Date', 'Time', 'Symbol', 'Side', 'Quantity', 'Price'])).toBe(false)
  })

  it('rejects a Webull desktop header (User ID/Symbol/Name/...)', () => {
    expect(
      matchesOceanOneHeader(['User ID', 'Symbol', 'Name', 'Ticker Type', 'Side', 'Total Qty']),
    ).toBe(false)
  })

  it('rejects the lead columns without the Comm/Net fee bookends', () => {
    expect(
      matchesOceanOneHeader(['Opened', 'Closed', 'Held', 'Symbol', 'Type', 'Entry', 'Exit', 'Qty', 'Gross']),
    ).toBe(false)
  })
})

// Real-fixture sniff — skipped when the gitignored fixtures aren't present.
const OO_FIXTURE = resolve(
  __dirname,
  '../../../test-fixtures/dtsm-dave-ocean-one-trades-may-2026.xls',
)
const WEBULL_FIXTURE = resolve(
  __dirname,
  '../../../test-fixtures/webull-desktop-paper-2026-05-14.xlsx',
)

describe('detectOceanOneXls — sheet sniff on real fixtures', () => {
  if (existsSync(OO_FIXTURE)) {
    it('detects the real Ocean One .xls as Ocean One', () => {
      expect(detectOceanOneXls(readFileSync(OO_FIXTURE))).toBe(true)
    })
  } else {
    it.skip('skipped: Ocean One fixture not present', () => {})
  }

  if (existsSync(WEBULL_FIXTURE)) {
    it('does NOT detect a Webull desktop .xlsx as Ocean One (disambiguation)', () => {
      expect(detectOceanOneXls(readFileSync(WEBULL_FIXTURE))).toBe(false)
    })
  } else {
    it.skip('skipped: Webull fixture not present', () => {})
  }

  it('returns false (no crash) on non-spreadsheet bytes', () => {
    expect(detectOceanOneXls(Buffer.from('this is not a spreadsheet'))).toBe(false)
  })
})
