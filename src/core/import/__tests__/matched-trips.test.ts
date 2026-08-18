// v0.2.7 Bug 5, Commit 3 — the import preview's "Trips" count.
//
// It was computed twice and added together: once from the DB (round trips already
// in the book for this date+symbol+account) and once from the batch (every trip
// arriving in the file). On a RE-IMPORT the same seven round trips are in BOTH, so
// the column read 14 on a seven-trip day.
//
// RULED CONTRACT: matchedTrips is the number of LIVE round trips this fee row
// belongs to for (date, symbol, account), counted ONCE. It deliberately does NOT
// adopt the pro-rata divisor's `fees_reported = 0` clause — every Ocean One trip is
// fees_reported = 1, so the divisor is empty for that broker and a column reading 0
// on a seven-trade day would be worse than one reading 14.

import { describe, expect, it } from 'vitest'
import { withMatchedTrips, type IncomingTrip } from '../matched-trips'

const fee = (matchedTrips: number) => ({
  date: '2026-07-13',
  symbol: 'VEEE',
  matchedTrips,
})

const trip = (status: IncomingTrip['status']): IncomingTrip => ({
  date: '2026-07-13',
  symbol: 'VEEE',
  status,
})

const seven = (status: IncomingTrip['status']) => Array.from({ length: 7 }, () => trip(status))

describe('withMatchedTrips — counted once', () => {
  it('T10 a REPLACE re-import shows 7 both times, not 7 then 14', () => {
    // pass 1: nothing in the book, 7 arriving and all insertable
    const pass1 = withMatchedTrips([fee(0)], seven('new'))
    expect(pass1[0].matchedTrips).toBe(7)

    // pass 2: the same 7 are now IN the book, and the same 7 arrive as duplicates
    const pass2 = withMatchedTrips([fee(7)], seven('duplicate'))
    expect(pass2[0].matchedTrips).toBe(7)
  })

  it('T12 duplicates that will never be inserted do not bump the count', () => {
    const r = withMatchedTrips([fee(3)], [trip('duplicate'), trip('duplicate')])
    expect(r[0].matchedTrips).toBe(3)
  })

  it('T13 THE INVARIANT: the count equals live-in-book plus what will be inserted', () => {
    const inBook = 3
    const arriving = [trip('new'), trip('new'), trip('duplicate'), trip('new')]
    const insertable = arriving.filter((t) => t.status === 'new').length
    const r = withMatchedTrips([fee(inBook)], arriving)
    // Asserted against the rule, never a literal.
    expect(r[0].matchedTrips).toBe(inBook + insertable)
  })

  it('T14 an all-Ocean-One symbol-day with 7 trips shows 7, NOT 0', () => {
    // Pins the ruling against the divisor: OO trips are fees_reported = 1 and the
    // pro-rata skips every one of them, but the user still has seven trades.
    const r = withMatchedTrips([fee(7)], [])
    expect(r[0].matchedTrips).toBe(7)
  })

  it('T15 STAND-DOWN: a genuinely NEW symbol-day still shows the arriving trips', () => {
    const r = withMatchedTrips([fee(0)], seven('new'))
    expect(r[0].matchedTrips).toBe(7)
  })

  it('only bumps the matching (date, symbol) — another symbol is untouched', () => {
    const other = { date: '2026-07-13', symbol: 'AAPL', matchedTrips: 0 }
    const r = withMatchedTrips([fee(0), other], seven('new'))
    expect(r[0].matchedTrips).toBe(7)
    expect(r[1].matchedTrips).toBe(0)
  })
})
