import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildRoundTrips,
  hashFillsByContent,
} from '../build-round-trips'
import type { Execution } from '@shared/import-types'

// Tests for the v0.2.1 content_hash dedup safety net. Covers the 10
// scenarios that exercise the pure helper: cross-format overlap (b1/b2),
// account_name handling (b3), negative cases that must NOT collide, sort
// independence, multi-fill coverage, and the documented multi-account
// false-positive.
//
// DB-glue tests (migration backfill, idempotency, OR-query through
// annotateTripStatus) live in the Section 6 smoke script — better-sqlite3
// is built for Electron's ABI and won't load under vitest's plain-Node
// runner, so live-DB tests aren't possible here. Same pattern as
// electron/db/__tests__/migrate-tz-utc.test.ts.

// Test-only Execution factory — auto-assigns trade_id/order_id so hash
// assertions don't drift between runs.
let idCounter = 0
beforeEach(() => {
  idCounter = 0
})

interface ExecOverrides {
  symbol: string
  side: 'B' | 'S'
  qty: number
  price: number
  time: string
  trade_id?: string
  order_id?: string
  account_name?: string
}

function exec(o: ExecOverrides): Execution {
  idCounter += 1
  const id = String(idCounter)
  return {
    trade_id: o.trade_id ?? `T${id}`,
    order_id: o.order_id ?? `O${id}`,
    is_short: o.side === 'S',
    date: o.time.slice(0, 10),
    symbol: o.symbol,
    side: o.side,
    qty: o.qty,
    price: o.price,
    time: o.time,
    account_name: o.account_name,
  }
}

describe('hashFillsByContent — core contract', () => {
  it('scenario (a): same fills twice → identical content_hash', () => {
    // Same logical input → deterministic output.
    const execsA = [
      exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' }),
      exec({ symbol: 'CLRB', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' }),
    ]
    idCounter = 0
    const execsB = [
      exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' }),
      exec({ symbol: 'CLRB', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' }),
    ]
    expect(hashFillsByContent(execsA)).toBe(hashFillsByContent(execsB))
  })

  it('scenario (b1): same fill, two synthetic IDs (th- vs wbm-) → exec_hash differs, content_hash matches', () => {
    // Same logical fill expressed under DAS tradehistory ('th-' prefix) vs
    // Webull mobile ('wbm-' prefix) parsers. Per-fill IDs differ; symbol/
    // time/side/qty/price are identical.
    const th = [
      exec({ trade_id: 'th-abc123', order_id: 'th-abc123', symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' }),
      exec({ trade_id: 'th-def456', order_id: 'th-def456', symbol: 'CLRB', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' }),
    ]
    const wbm = [
      exec({ trade_id: 'wbm-xyz999', order_id: 'wbm-xyz999', symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' }),
      exec({ trade_id: 'wbm-uvw888', order_id: 'wbm-uvw888', symbol: 'CLRB', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' }),
    ]
    const tripsTh = buildRoundTrips(th)
    const tripsWbm = buildRoundTrips(wbm)
    expect(tripsTh[0].exec_hash).not.toBe(tripsWbm[0].exec_hash)
    expect(tripsTh[0].content_hash).toBe(tripsWbm[0].content_hash)
  })

  it('scenario (b2): real DAS TradeID vs synthetic tw- → exec_hash differs, content_hash matches', () => {
    // DAS Trades.csv real TradeID/OrderID vs DAS trades-window synthetic tw-.
    const dasReal = [
      exec({ trade_id: '12345', order_id: 'OID-67890', symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' }),
      exec({ trade_id: '12346', order_id: 'OID-67891', symbol: 'CLRB', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' }),
    ]
    const dasSynth = [
      exec({ trade_id: 'tw-aaa111', order_id: 'Cloid-bbb', symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' }),
      exec({ trade_id: 'tw-ccc222', order_id: 'Cloid-ddd', symbol: 'CLRB', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' }),
    ]
    const tripsReal = buildRoundTrips(dasReal)
    const tripsSynth = buildRoundTrips(dasSynth)
    expect(tripsReal[0].exec_hash).not.toBe(tripsSynth[0].exec_hash)
    expect(tripsReal[0].content_hash).toBe(tripsSynth[0].content_hash)
  })

  it('scenario (b3): account_name "" vs "ACCT_A" → exec_hash differs, content_hash matches', () => {
    // account_name participates in exec_hash conditionally (v0.1.6 contract).
    // content_hash EXCLUDES it entirely (v0.2.1 decision option b), so a
    // file that emits account_name and one that doesn't still dedup.
    const noAcct = [
      exec({ trade_id: '1', order_id: 'A1', symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' }),
      exec({ trade_id: '2', order_id: 'A2', symbol: 'CLRB', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' }),
    ]
    const withAcct = noAcct.map((e) => ({ ...e, account_name: 'ACCT_A' }))
    const tripsNo = buildRoundTrips(noAcct)
    const tripsWith = buildRoundTrips(withAcct)
    expect(tripsNo[0].exec_hash).not.toBe(tripsWith[0].exec_hash)
    expect(tripsNo[0].content_hash).toBe(tripsWith[0].content_hash)
  })
})

describe('hashFillsByContent — negative cases (must NOT collide)', () => {
  it('different timestamp (1 second apart) → different content_hash', () => {
    const a = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' })]
    const b = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:01Z' })]
    expect(hashFillsByContent(a)).not.toBe(hashFillsByContent(b))
  })

  it('different price (4th decimal) → different content_hash', () => {
    const a = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0000, time: '2026-05-05T13:30:00Z' })]
    const b = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0001, time: '2026-05-05T13:30:00Z' })]
    expect(hashFillsByContent(a)).not.toBe(hashFillsByContent(b))
  })

  it('different quantity → different content_hash', () => {
    const a = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' })]
    const b = [exec({ symbol: 'CLRB', side: 'B', qty: 200, price: 5.0, time: '2026-05-05T13:30:00Z' })]
    expect(hashFillsByContent(a)).not.toBe(hashFillsByContent(b))
  })

  it('different symbol → different content_hash', () => {
    const a = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' })]
    const b = [exec({ symbol: 'RYOJ', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' })]
    expect(hashFillsByContent(a)).not.toBe(hashFillsByContent(b))
  })

  it('different side → different content_hash', () => {
    const a = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' })]
    const b = [exec({ symbol: 'CLRB', side: 'S', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' })]
    expect(hashFillsByContent(a)).not.toBe(hashFillsByContent(b))
  })
})

describe('hashFillsByContent — sort & normalization', () => {
  it('fills in reversed order produce identical content_hash', () => {
    const forward = [
      exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' }),
      exec({ symbol: 'CLRB', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' }),
    ]
    idCounter = 0
    const reverse = [
      exec({ symbol: 'CLRB', side: 'S', qty: 100, price: 5.5, time: '2026-05-05T13:31:00Z' }),
      exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' }),
    ]
    expect(hashFillsByContent(forward)).toBe(hashFillsByContent(reverse))
  })

  it('lowercase symbol is normalised to uppercase (same hash)', () => {
    const upper = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' })]
    const lower = [{ ...upper[0], symbol: 'clrb' }]
    expect(hashFillsByContent(upper)).toBe(hashFillsByContent(lower))
  })

  it('bare ISO time without Z normalises to Z-suffixed UTC (same hash)', () => {
    // localEasternToUtc already emits Z; this guards the edge case of a
    // hand-edited / legacy blob without a Z.
    const withZ = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' })]
    const noZ = [{ ...withZ[0], time: '2026-05-05T13:30:00' }]
    expect(hashFillsByContent(withZ)).toBe(hashFillsByContent(noZ))
  })

  it('subsecond precision is stripped (same second = same hash)', () => {
    const exact = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' })]
    const sub = [{ ...exact[0], time: '2026-05-05T13:30:00.123Z' }]
    expect(hashFillsByContent(exact)).toBe(hashFillsByContent(sub))
  })

  it('throws on unparseable timestamp (caller treats as malformed)', () => {
    const bad = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: 'not-a-date' })]
    expect(() => hashFillsByContent(bad)).toThrow()
  })

  it('throws on invalid side (data corruption guard)', () => {
    const bad = [{ ...exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z' }), side: 'X' as 'B' | 'S' }]
    expect(() => hashFillsByContent(bad)).toThrow()
  })
})

describe('hashFillsByContent — multi-fill coverage', () => {
  it('all fills contribute (subset has different hash)', () => {
    const full = [
      exec({ symbol: 'ODYS', side: 'B', qty: 500, price: 2.0, time: '2026-05-11T13:30:00Z' }),
      exec({ symbol: 'ODYS', side: 'S', qty: 100, price: 2.1, time: '2026-05-11T13:31:00Z' }),
      exec({ symbol: 'ODYS', side: 'S', qty: 100, price: 2.15, time: '2026-05-11T13:32:00Z' }),
      exec({ symbol: 'ODYS', side: 'S', qty: 100, price: 2.2, time: '2026-05-11T13:33:00Z' }),
      exec({ symbol: 'ODYS', side: 'S', qty: 100, price: 2.25, time: '2026-05-11T13:34:00Z' }),
      exec({ symbol: 'ODYS', side: 'S', qty: 100, price: 2.3, time: '2026-05-11T13:35:00Z' }),
    ]
    const subset = full.slice(0, 5)
    expect(hashFillsByContent(full)).not.toBe(hashFillsByContent(subset))
  })
})

describe('hashFillsByContent — documented false-positive (known limit)', () => {
  it('multi-account same-second identical fill collides (option-b tradeoff)', () => {
    // This is the documented failure mode of option (b) excluding
    // account_name from content_hash. Two genuinely different trades
    // (different accounts) with identical symbol/time/side/qty/price will
    // share content_hash. For FugaEdge's solo-trader audience this is
    // acceptable; recovery = manual edit. Multi-account support (v0.3.0
    // Pro tier) will reconsider.
    const acctA = [exec({ symbol: 'CLRB', side: 'B', qty: 100, price: 5.0, time: '2026-05-05T13:30:00Z', account_name: 'ACCT_A' })]
    const acctB = [{ ...acctA[0], account_name: 'ACCT_B' }]
    // Documents the behavior — if this test ever flips to .not.toBe, we've
    // accidentally added account_name back to content_hash.
    expect(hashFillsByContent(acctA)).toBe(hashFillsByContent(acctB))
  })
})
