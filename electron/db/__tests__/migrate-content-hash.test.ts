// Tests for the v0.2.1 content_hash backfill migration.
//
// Same constraint as migrate-tz-utc.test.ts: better-sqlite3's native binary
// is built for Electron's ABI and won't load under vitest's plain-Node
// runner. So this file only exercises the PURE helper
// (computeContentHashFromBlob). The DB-glue (migrateContentHash: guards,
// SELECT, UPDATE, transaction, latch) is diff-reviewable and covered by
// the Section 6 smoke test against a real fresh DB before ship.

import { describe, expect, it } from 'vitest'
import { computeContentHashFromBlob } from '../migrate-content-hash'
import { hashFillsByContent } from '@/core/import/build-round-trips'
import type { Execution } from '@shared/import-types'

function execFrom(
  symbol: string,
  fills: Array<{ side: 'B' | 'S'; qty: number; price: number; time: string }>,
): Execution[] {
  return fills.map((f, i) => ({
    trade_id: `T${i + 1}`,
    order_id: `O${i + 1}`,
    is_short: f.side === 'S',
    date: f.time.slice(0, 10),
    symbol,
    side: f.side,
    qty: f.qty,
    price: f.price,
    time: f.time,
  }))
}

describe('computeContentHashFromBlob — round-trip with hashFillsByContent', () => {
  it('produces the SAME hash as hashFillsByContent for an Execution[] of the same fills', () => {
    // The migration reconstructs Execution[] from RoundTripExecution[] + the
    // trade-row symbol, then calls hashFillsByContent. This test pins that
    // the round-trip is hash-preserving — a backfilled row will dedup
    // against a freshly-built RoundTrip of the same content.
    const fills = [
      { side: 'B' as const, qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' },
      { side: 'S' as const, qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' },
    ]
    const blob = JSON.stringify(
      fills.map((f, i) => ({
        trade_id: `T${i + 1}`,
        order_id: `O${i + 1}`,
        side: f.side,
        qty: f.qty,
        price: f.price,
        time: f.time,
      })),
    )
    const fromBlob = computeContentHashFromBlob('CLRB', blob)
    const fromExec = hashFillsByContent(execFrom('CLRB', fills))
    expect(fromBlob.hash).toBe(fromExec)
  })

  it('symbol comes from the trade row, not the blob (blobs don\'t carry symbol)', () => {
    // RoundTripExecution shape has no symbol field. The migration injects
    // the trades.symbol into each reconstructed Execution. Two blobs with
    // identical fill content but different trade-row symbols should hash
    // differently.
    const blob = JSON.stringify([
      { trade_id: '1', order_id: 'A1', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' },
    ])
    expect(computeContentHashFromBlob('CLRB', blob).hash).not.toBe(
      computeContentHashFromBlob('RYOJ', blob).hash,
    )
  })
})

describe('computeContentHashFromBlob — malformed blobs', () => {
  it('returns hash=null with reason="malformed-json" for non-JSON', () => {
    const res = computeContentHashFromBlob('CLRB', 'not json {{{')
    expect(res.hash).toBeNull()
    expect(res.reason).toBe('malformed-json')
  })

  it('returns hash=null with reason="not-an-array" for a JSON object', () => {
    const res = computeContentHashFromBlob('CLRB', JSON.stringify({ wrong: 'shape' }))
    expect(res.hash).toBeNull()
    expect(res.reason).toBe('not-an-array')
  })

  it('returns hash=null with reason="empty-fills" for an empty array', () => {
    const res = computeContentHashFromBlob('CLRB', JSON.stringify([]))
    expect(res.hash).toBeNull()
    expect(res.reason).toBe('empty-fills')
  })

  it('returns hash=null with reason="no-valid-fills" when every fill is missing required fields', () => {
    const res = computeContentHashFromBlob(
      'CLRB',
      JSON.stringify([{ wrong: 'shape' }, { also: 'wrong' }]),
    )
    expect(res.hash).toBeNull()
    expect(res.reason).toBe('no-valid-fills')
  })

  it('skips individual invalid fills but hashes the rest', () => {
    const blob = JSON.stringify([
      { trade_id: '1', order_id: 'A1', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' },
      { wrong: 'shape' }, // skipped
      { trade_id: '2', order_id: 'A2', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' },
    ])
    const res = computeContentHashFromBlob('CLRB', blob)
    expect(res.hash).not.toBeNull()
    // Should match a 2-fill blob (the bad one is silently dropped).
    const cleanBlob = JSON.stringify([
      { trade_id: '1', order_id: 'A1', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' },
      { trade_id: '2', order_id: 'A2', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' },
    ])
    expect(res.hash).toBe(computeContentHashFromBlob('CLRB', cleanBlob).hash)
  })

  it('returns hash=null when timestamp is unparseable', () => {
    const blob = JSON.stringify([
      { trade_id: '1', order_id: 'A1', side: 'B', qty: 100, price: 5.0, time: 'not-a-date' },
    ])
    const res = computeContentHashFromBlob('CLRB', blob)
    expect(res.hash).toBeNull()
    expect(res.reason).toBe('malformed-json')
  })
})
