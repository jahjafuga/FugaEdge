// THE ROWS PARTITION THE MONTH. That is the whole claim, and it is the one
// that makes the ladder trustworthy: if the clipped windows did not tile the
// month exactly, the rows would sum to something other than the month's own
// totals and there would be no way to tell which of the two was wrong.
//
// DRIVEN OVER EVERY MONTH OF 2024..2030, not a sampled one. June 2026 is the
// month in the frames and is therefore the LEAST informative case to test: it
// straddles at both ends, so it would never catch a bug that only shows on a
// month that starts on a Sunday or ends on a Saturday.
import { describe, expect, it } from 'vitest'
import { monthWeekRows } from '../monthWeeks'
import { monthWindow, monthIdOf } from '../monthWindow'

const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

const ALL: string[] = []
for (const y of YEARS) for (let m = 1; m <= 12; m++) ALL.push(monthIdOf(y, m))

const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const dayCount = (a: string, b: string) =>
  Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000) + 1
const dowOf = (s: string) => parse(s).getUTCDay()

describe('AK the month clips into weeks', () => {
  it('AK1 the clipped day counts sum to the month, every month', () => {
    const bad: string[] = []
    for (const id of ALL) {
      const { from, to } = monthWindow(id)
      const want = dayCount(from, to)
      const got = monthWeekRows(id).reduce((a, r) => a + r.days, 0)
      if (got !== want) bad.push(`${id}: rows ${got} vs month ${want}`)
    }
    expect(ALL.length, 'the drive ran nothing').toBe(84)
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('AK1b the rows TILE the month -- no gap, no overlap, in order', () => {
    // Summing to the right total is not the same as covering the right days:
    // two rows could overlap by a day and a third be short by one. This walks
    // the boundaries.
    const bad: string[] = []
    for (const id of ALL) {
      const { from, to } = monthWindow(id)
      const rows = monthWeekRows(id)
      if (rows[0].from !== from) bad.push(`${id}: first row starts ${rows[0].from}, month ${from}`)
      if (rows[rows.length - 1].to !== to) {
        bad.push(`${id}: last row ends ${rows[rows.length - 1].to}, month ${to}`)
      }
      for (let i = 1; i < rows.length; i++) {
        const prevEnd = parse(rows[i - 1].to)
        const thisStart = parse(rows[i].from)
        const gap = (thisStart.getTime() - prevEnd.getTime()) / 86400000
        if (gap !== 1) bad.push(`${id}: row ${i} starts ${gap} days after the previous ends`)
      }
    }
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('AK2 no clipped window falls outside the month', () => {
    const bad: string[] = []
    for (const id of ALL) {
      const { from, to } = monthWindow(id)
      for (const r of monthWeekRows(id)) {
        if (r.from < from || r.from > to) bad.push(`${id}: ${r.from} outside`)
        if (r.to < from || r.to > to) bad.push(`${id}: ${r.to} outside`)
        if (r.days < 1 || r.days > 7) bad.push(`${id}: ${r.days} days in a row`)
      }
    }
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('AK3 every row carries its FULL week, distinct when it straddles', () => {
    const bad: string[] = []
    let straddlers = 0
    for (const id of ALL) {
      for (const r of monthWeekRows(id)) {
        // the full week is always a real Sunday..Saturday seven
        if (dowOf(r.weekStart) !== 0) bad.push(`${id}: ${r.weekStart} is not a Sunday`)
        if (dowOf(r.weekEnd) !== 6) bad.push(`${id}: ${r.weekEnd} is not a Saturday`)
        if (dayCount(r.weekStart, r.weekEnd) !== 7) bad.push(`${id}: ${r.weekStart} is not 7 days`)
        // and the clip sits inside it
        if (r.from < r.weekStart || r.to > r.weekEnd) bad.push(`${id}: clip escapes its week`)
        if (r.straddles) {
          straddlers += 1
          const differs = r.from !== r.weekStart || r.to !== r.weekEnd
          if (!differs) bad.push(`${id}: ${r.weekStart} claims to straddle but does not`)
        } else if (r.from !== r.weekStart || r.to !== r.weekEnd) {
          bad.push(`${id}: ${r.weekStart} straddles but does not say so`)
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([])
    expect(straddlers, 'nothing straddled in seven years -- the flag is inert').toBeGreaterThan(100)
  })

  it('AK4 a Sunday start has no leading straddle; a Saturday end no trailing one', () => {
    const sundayStarts: string[] = []
    const saturdayEnds: string[] = []
    for (const id of ALL) {
      const { from, to } = monthWindow(id)
      const rows = monthWeekRows(id)
      if (dowOf(from) === 0) {
        sundayStarts.push(id)
        expect(rows[0].straddles, `${id} starts on a Sunday but its first row straddles`).toBe(
          rows[0].to !== rows[0].weekEnd,
        )
        expect(rows[0].from, `${id}: the first row does not start on its own Sunday`).toBe(
          rows[0].weekStart,
        )
      }
      if (dowOf(to) === 6) {
        saturdayEnds.push(id)
        const last = rows[rows.length - 1]
        expect(last.to, `${id}: the last row does not end on its own Saturday`).toBe(last.weekEnd)
      }
    }
    // NAMED, not merely counted -- if the range contained none, the case above
    // would be vacuous and this says so out loud.
    expect(sundayStarts.length, 'no month in 2024..2030 starts on a Sunday').toBeGreaterThan(0)
    expect(saturdayEnds.length, 'no month in 2024..2030 ends on a Saturday').toBeGreaterThan(0)
  })

  it('AK5 the row count is 4, 5 or 6 and nothing else', () => {
    const dist: Record<number, number> = {}
    const bad: string[] = []
    for (const id of ALL) {
      const n = monthWeekRows(id).length
      dist[n] = (dist[n] ?? 0) + 1
      if (n < 4 || n > 6) bad.push(`${id}: ${n} rows`)
    }
    expect(bad, bad.join('\n')).toEqual([])
    // 4 is the rare one: a 28-day February that starts on a Sunday.
    expect(Object.keys(dist).map(Number).sort(), 'an unexpected row count').toEqual(
      Object.keys(dist).map(Number).sort().filter((n) => n >= 4 && n <= 6),
    )
    expect(Object.values(dist).reduce((a, b) => a + b, 0)).toBe(84)
  })

  it('AK6 June 2026, the month in the frames, spelled out', () => {
    expect(monthWeekRows('2026-06')).toEqual([
      { weekStart: '2026-05-31', weekEnd: '2026-06-06', from: '2026-06-01', to: '2026-06-06', days: 6, straddles: true },
      { weekStart: '2026-06-07', weekEnd: '2026-06-13', from: '2026-06-07', to: '2026-06-13', days: 7, straddles: false },
      { weekStart: '2026-06-14', weekEnd: '2026-06-20', from: '2026-06-14', to: '2026-06-20', days: 7, straddles: false },
      { weekStart: '2026-06-21', weekEnd: '2026-06-27', from: '2026-06-21', to: '2026-06-27', days: 7, straddles: false },
      { weekStart: '2026-06-28', weekEnd: '2026-07-04', from: '2026-06-28', to: '2026-06-30', days: 3, straddles: true },
    ])
  })
})
