// A MONTH NOTE GOES IN ITS OWN TABLE.
//
// week_notes is keyed on a Sunday. Reusing it for a month would mean either
// storing '2026-06' in a column every other reader treats as a date, or
// storing a month's note against its first Sunday -- which is a week that
// already has one. Neither is a note, so month_notes is a new table and this
// case watches the seam: every statement the month notes path issues names
// month_notes, and none of them names week_notes.
import { describe, expect, it, beforeEach, vi } from 'vitest'

let sql: { sql: string; args: unknown[] }[] = []
let stored: string | undefined

const mockDb = {
  prepare(text: string) {
    return {
      run: (...args: unknown[]) => {
        sql.push({ sql: text, args })
        if (/INSERT INTO month_notes/i.test(text)) stored = String(args[1])
        if (/DELETE FROM month_notes/i.test(text)) stored = undefined
        return { changes: 1 }
      },
      get: (...args: unknown[]) => {
        sql.push({ sql: text, args })
        return stored === undefined ? undefined : { text: stored }
      },
      all: (...args: unknown[]) => {
        sql.push({ sql: text, args })
        return []
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { saveMonthNotes, getMonthNotes } from '../notes'

beforeEach(() => {
  sql = []
  stored = undefined
})

const touched = (table: string) => sql.filter((c) => new RegExp(table, 'i').test(c.sql))

describe('AI1 the month note', () => {
  it('AI1 round-trips through month_notes keyed on the month id', () => {
    expect(getMonthNotes('2026-06'), 'an unwritten month is not empty').toBe('')

    const saved = saveMonthNotes({ month_id: '2026-06', text: '  June was choppy.  ' })
    expect(saved).toEqual({ month_id: '2026-06', text: 'June was choppy.' })
    expect(getMonthNotes('2026-06')).toBe('June was choppy.')

    // KEYED ON THE MONTH ID. Every statement carries '2026-06' -- never a date
    // derived from it, which is what reusing week_notes would have forced.
    for (const c of touched('month_notes')) {
      expect(c.args[0], `a statement keyed on ${String(c.args[0])}`).toBe('2026-06')
    }
    expect(touched('month_notes').length, 'nothing reached month_notes').toBeGreaterThan(0)
    expect(touched('week_notes'), 'the month note touched week_notes').toEqual([])
  })

  it('AI1b an emptied note deletes the row, the week_notes contract', () => {
    saveMonthNotes({ month_id: '2026-06', text: 'something' })
    sql = []
    const out = saveMonthNotes({ month_id: '2026-06', text: '   ' })
    expect(out).toEqual({ month_id: '2026-06', text: '' })
    expect(touched('DELETE FROM month_notes').length, 'an emptied note left a row').toBe(1)
    expect(getMonthNotes('2026-06')).toBe('')
    expect(touched('week_notes')).toEqual([])
  })

  it('AI1c a malformed month id is refused before any statement runs', () => {
    for (const bad of ['2026-6', '2026-06-01', '2026', '2026-13', '']) {
      sql = []
      expect(() => saveMonthNotes({ month_id: bad, text: 'x' }), `${bad} was accepted`).toThrow()
      expect(sql, `${bad} reached the database`).toEqual([])
    }
  })
})
