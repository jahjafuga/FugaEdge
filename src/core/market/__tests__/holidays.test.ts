import { describe, it, expect } from 'vitest'
import { isMarketHoliday, marketHolidayName, easterSunday } from '../holidays'

// The schedule's CORRECTNESS is the whole feature. These lock a known year
// (2026) plus every edge: the computus (Good Friday), the observed-shift rules
// (incl. the Saturday-New-Year's exception), Juneteenth year-gating, and the
// nth-weekday vs last-weekday distinction.

describe('easterSunday (Gregorian computus / Meeus)', () => {
  it('matches known Easter Sundays', () => {
    expect(easterSunday(2024)).toBe('2024-03-31')
    expect(easterSunday(2025)).toBe('2025-04-20')
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')
  })
})

describe('isMarketHoliday — full 2026 NYSE closure set', () => {
  const set: [string, string][] = [
    ['2026-01-01', "New Year's Day"], //               Thu
    ['2026-01-19', 'Martin Luther King Jr. Day'], //   3rd Mon Jan
    ['2026-02-16', "Presidents' Day"], //              3rd Mon Feb
    ['2026-04-03', 'Good Friday'], //                  Easter Apr 5 - 2
    ['2026-05-25', 'Memorial Day'], //                 last Mon May
    ['2026-06-19', 'Juneteenth National Independence Day'], // Fri
    ['2026-07-03', 'Independence Day'], //             Jul 4 is Sat -> observed Fri Jul 3
    ['2026-09-07', 'Labor Day'], //                    1st Mon Sep
    ['2026-11-26', 'Thanksgiving Day'], //             4th Thu Nov
    ['2026-12-25', 'Christmas Day'], //                Fri
  ]
  it.each(set)('%s is a market holiday (%s)', (date, name) => {
    expect(isMarketHoliday(date)).toBe(true)
    expect(marketHolidayName(date)).toBe(name)
  })

  it('a normal trading day is not a holiday', () => {
    expect(isMarketHoliday('2026-07-07')).toBe(false) // a random Tuesday
    expect(marketHolidayName('2026-07-07')).toBeNull()
  })
})

describe('Good Friday across years (Easter - 2 days)', () => {
  it.each([['2024-03-29'], ['2025-04-18'], ['2026-04-03'], ['2027-03-26']])(
    '%s is Good Friday',
    (date) => {
      expect(marketHolidayName(date)).toBe('Good Friday')
    },
  )
})

describe('observed-shift edges', () => {
  it('Independence Day 2026: Sat Jul 4 -> observed Fri Jul 3 (Jul 4 itself false)', () => {
    expect(isMarketHoliday('2026-07-03')).toBe(true)
    expect(isMarketHoliday('2026-07-04')).toBe(false)
  })

  it('Christmas 2027: Sat Dec 25 -> observed Fri Dec 24 (Dec 25 itself false)', () => {
    expect(isMarketHoliday('2027-12-24')).toBe(true)
    expect(isMarketHoliday('2027-12-25')).toBe(false)
  })

  it("New Year's Saturday exception: Jan 1 2022 (Sat) NOT observed; Dec 31 2021 stays a trading day", () => {
    expect(isMarketHoliday('2021-12-31')).toBe(false)
    expect(isMarketHoliday('2022-01-01')).toBe(false)
  })

  it("New Year's Sunday: Jan 1 2023 (Sun) -> observed Mon Jan 2 2023", () => {
    expect(isMarketHoliday('2023-01-01')).toBe(false)
    expect(isMarketHoliday('2023-01-02')).toBe(true)
    expect(marketHolidayName('2023-01-02')).toBe("New Year's Day")
  })
})

describe('Juneteenth gating (NYSE holiday only from 2022)', () => {
  it('pre-2022: no Juneteenth closure in 2021', () => {
    expect(isMarketHoliday('2021-06-18')).toBe(false)
    expect(isMarketHoliday('2021-06-19')).toBe(false)
  })

  it('2022: Jun 19 is a SUNDAY -> observed Mon Jun 20 (Jun 19 itself false)', () => {
    expect(isMarketHoliday('2022-06-20')).toBe(true)
    expect(isMarketHoliday('2022-06-19')).toBe(false)
    expect(marketHolidayName('2022-06-20')).toBe('Juneteenth National Independence Day')
  })

  it('2026: Jun 19 is a Friday -> Jun 19 itself', () => {
    expect(isMarketHoliday('2026-06-19')).toBe(true)
  })
})

describe('nth-weekday vs last-weekday', () => {
  it('Memorial Day = LAST Monday of May, not the 4th (May 2027 has 5 Mondays)', () => {
    expect(isMarketHoliday('2027-05-31')).toBe(true) //  last Monday
    expect(isMarketHoliday('2027-05-24')).toBe(false) // 4th Monday — a normal trading day
    expect(marketHolidayName('2027-05-31')).toBe('Memorial Day')
  })

  it('Thanksgiving = 4th Thursday of November', () => {
    expect(marketHolidayName('2026-11-26')).toBe('Thanksgiving Day')
  })

  it('MLK = 3rd Monday of January', () => {
    expect(marketHolidayName('2026-01-19')).toBe('Martin Luther King Jr. Day')
  })
})

describe('input robustness', () => {
  it('returns false / null for a malformed date string', () => {
    expect(isMarketHoliday('not-a-date')).toBe(false)
    expect(marketHolidayName('')).toBeNull()
  })
})
