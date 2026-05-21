// Tests for the Day 8.5 Commit B timestamp migration.
//
// These exercise the PURE conversion helpers (barLocalToUtcField,
// convertExecutionsJsonBlob) — the parts that carry the data-integrity risk.
// The DB glue (migrateTimestampsToUtc: guards + SELECT/UPDATE/transaction) is
// not unit-tested here: better-sqlite3's native binary is built for Electron's
// ABI and cannot load under vitest's plain-Node runner, so a live-DB test is
// impossible in this environment (same constraint that kept every other
// repo test off SQLite — see backup-fs.test.ts, which uses raw byte buffers).
// The glue is thin and diff-reviewable, and a real-DB runtime smoke test
// covers it before ship.

import { describe, it, expect } from 'vitest'
import { barLocalToUtcField, convertExecutionsJsonBlob } from '../migrate-tz-utc'

describe('barLocalToUtcField — bare-local-Eastern → true UTC', () => {
  it('converts ordinary EDT market hours (+4)', () => {
    expect(barLocalToUtcField('2026-05-14T06:54:05')).toBe('2026-05-14T10:54:05Z')
    expect(barLocalToUtcField('2026-07-15T09:30:00')).toBe('2026-07-15T13:30:00Z')
  })

  it('converts ordinary EST market hours (+5)', () => {
    expect(barLocalToUtcField('2026-01-15T09:30:00')).toBe('2026-01-15T14:30:00Z')
  })

  it('is idempotent — an already-Z value is returned unchanged', () => {
    expect(barLocalToUtcField('2026-05-14T10:54:05Z')).toBe('2026-05-14T10:54:05Z')
    // and a re-run on that output is still a no-op
    expect(barLocalToUtcField(barLocalToUtcField('2026-05-14T06:54:05'))).toBe(
      '2026-05-14T10:54:05Z',
    )
  })

  it('returns null for null / undefined / blank input', () => {
    expect(barLocalToUtcField(null)).toBeNull()
    expect(barLocalToUtcField(undefined)).toBeNull()
    expect(barLocalToUtcField('')).toBeNull()
    expect(barLocalToUtcField('   ')).toBeNull()
  })

  it('rolls the date forward for an after-hours fill (20:00 ET → next-day UTC)', () => {
    // 20:00 EDT 2026-07-15 = 00:00 UTC 2026-07-16.
    expect(barLocalToUtcField('2026-07-15T20:00:00')).toBe('2026-07-16T00:00:00Z')
  })

  it('throws on a non-blank unparseable string (caller treats as malformed)', () => {
    expect(() => barLocalToUtcField('garbage')).toThrow()
  })
})

describe('convertExecutionsJsonBlob — convert every fill time in a blob', () => {
  it('converts every fill time to UTC and reports the count', () => {
    const blob = JSON.stringify([
      { trade_id: '1', order_id: 'A1', side: 'B', qty: 100, price: 5, time: '2026-05-14T06:54:05' },
      { trade_id: '2', order_id: 'A2', side: 'S', qty: 100, price: 6, time: '2026-05-14T09:30:00' },
    ])
    const res = convertExecutionsJsonBlob(blob)
    expect(res.malformed).toBe(false)
    expect(res.converted).toBe(2)
    expect(res.skippedFills).toBe(0)
    const fills = JSON.parse(res.json)
    expect(fills[0].time).toBe('2026-05-14T10:54:05Z')
    expect(fills[1].time).toBe('2026-05-14T13:30:00Z')
    // Non-time fields are untouched.
    expect(fills[0].trade_id).toBe('1')
    expect(fills[0].order_id).toBe('A1')
    expect(fills[0].price).toBe(5)
  })

  it('is idempotent — an already-converted blob is returned byte-identical', () => {
    const blob = JSON.stringify([
      { trade_id: '1', order_id: 'A1', side: 'B', qty: 100, price: 5, time: '2026-05-14T10:54:05Z' },
    ])
    const res = convertExecutionsJsonBlob(blob)
    expect(res.malformed).toBe(false)
    expect(res.converted).toBe(0)
    expect(res.json).toBe(blob)
  })

  it('flags a non-JSON blob as malformed and leaves it untouched', () => {
    const res = convertExecutionsJsonBlob('not json')
    expect(res.malformed).toBe(true)
    expect(res.converted).toBe(0)
    expect(res.json).toBe('not json')
  })

  it('flags a non-array JSON blob as malformed and leaves it untouched', () => {
    const input = '{"time":"2026-05-14T06:54:05"}'
    const res = convertExecutionsJsonBlob(input)
    expect(res.malformed).toBe(true)
    expect(res.json).toBe(input)
  })

  it('leaves a fill with no time field intact (converted=0, not malformed)', () => {
    const blob = JSON.stringify([
      { trade_id: '1', order_id: 'A1', side: 'B', qty: 100, price: 5 },
    ])
    const res = convertExecutionsJsonBlob(blob)
    expect(res.malformed).toBe(false)
    expect(res.converted).toBe(0)
    expect(res.json).toBe(blob)
  })

  it('converts the good fills and counts unparseable ones (log-and-continue)', () => {
    const blob = JSON.stringify([
      { trade_id: '1', order_id: 'A1', side: 'B', qty: 100, price: 5, time: '2026-05-14T06:54:05' },
      { trade_id: '2', order_id: 'A2', side: 'S', qty: 100, price: 6, time: 'garbage' },
    ])
    const res = convertExecutionsJsonBlob(blob)
    expect(res.malformed).toBe(false)
    expect(res.converted).toBe(1)
    expect(res.skippedFills).toBe(1)
    const fills = JSON.parse(res.json)
    expect(fills[0].time).toBe('2026-05-14T10:54:05Z')
    expect(fills[1].time).toBe('garbage') // unparseable → left exactly as-is
  })

  it('rolls an after-hours fill to the next UTC day', () => {
    const blob = JSON.stringify([
      { trade_id: '1', order_id: 'A1', side: 'S', qty: 100, price: 5, time: '2026-07-15T20:00:00' },
    ])
    const res = convertExecutionsJsonBlob(blob)
    expect(JSON.parse(res.json)[0].time).toBe('2026-07-16T00:00:00Z')
  })

  it('handles an empty fills array', () => {
    const res = convertExecutionsJsonBlob('[]')
    expect(res.malformed).toBe(false)
    expect(res.converted).toBe(0)
    expect(res.json).toBe('[]')
  })
})
