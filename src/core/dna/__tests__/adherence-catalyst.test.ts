// Catalyst-as-a-pillar Beat 2 — the pillar itself.
//
// The founder-locked rule (a) excluded catalyst from pass/fail because
// "catalyst_type is a name or null, so there's no confirmed no-catalyst value to
// fail against". Schema 49 ended that: catalyst_def.kind carries the meaning, so a
// trade CAN now say "I checked and there was nothing". These tests pin the pillar's
// resolution rules and — the part that would have caught the original defect — that
// the require-catalyst flag actually moves numbers.

import { describe, it, expect } from 'vitest'
import { computeDnaAdherence, type DnaConfig } from '../adherence'
import type { CatalystDef } from '@shared/catalyst-types'
import type { TradeListRow } from '@shared/trades-types'

const BASE: DnaConfig = {
  dna_price_min: 2,
  dna_price_max: 20,
  dna_change_min: 10,
  dna_rvol_min: 5,
  dna_float_min: 1_000_000,
  dna_float_max: 20_000_000,
  dna_require_catalyst: true,
}
const OFF: DnaConfig = { ...BASE, dna_require_catalyst: false }

let nextId = 1
function mk(over: Partial<TradeListRow>): TradeListRow {
  return {
    account_id: 'ACCT-MAIN',
    id: nextId++,
    date: '2026-06-01',
    symbol: 'AAA',
    side: 'long',
    open_time: '2026-06-01T13:30:00Z',
    close_time: '2026-06-01T14:00:00Z',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 5,
    shares_sold: 100,
    avg_sell_price: 5,
    gross_pnl: 0,
    total_fees: 0,
    net_pnl: 0,
    executions: [],
    note: null,
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
    mae: null,
    mfe: null,
    playbook_id: null,
    playbook_name: null,
    playbook_tier: null,
    confidence: null,
    mistakes: [],
    planned_risk: null,
    planned_stop_loss_price: null,
    risk_per_share: null,
    total_risk: null,
    r_multiple: null,
    daily_change_pct: 15,
    rvol: 8,
    float_shares: 5_000_000,
    shares_outstanding: null,
    catalyst_type: 'Earnings',
    days_since_catalyst: null,
    country: null,
    country_name: 'Unknown',
    region: 'Unknown',
    country_source: 'unknown',
    attachment_count: 0,
    secondary_tag_count: 0,
    deleted_at: null,
    ...over,
  }
}

let defId = 1
const def = (name: string, kind: CatalystDef['kind'], is_archived = false): CatalystDef => ({
  id: defId++,
  name,
  sort_position: 0,
  is_custom: false,
  is_archived,
  kind,
})

const DEFS: CatalystDef[] = [
  def('Earnings', 'news'),
  def('Technical / No Catalyst', 'none'),
  def('Continuation', 'technical'),
  def('Old Presser', 'news', true), // archived, but still resolvable
]

describe('catalyst pillar — data resolution', () => {
  it('T6 catalyst_type NULL -> hasData false -> incomplete', () => {
    const r = computeDnaAdherence([mk({ catalyst_type: null })], BASE, DEFS)
    expect(r.perPillar.catalyst).toEqual({ passed: 0, n: 0, pct: null })
    expect(r.buckets.incomplete).toBe(1)
  })

  it("T7 catalyst_type '' -> hasData false -> incomplete", () => {
    const r = computeDnaAdherence([mk({ catalyst_type: '' })], BASE, DEFS)
    expect(r.perPillar.catalyst.n).toBe(0)
    expect(r.buckets.incomplete).toBe(1)
  })

  it("T8 kind 'news' -> passes", () => {
    const r = computeDnaAdherence([mk({ catalyst_type: 'Earnings' })], BASE, DEFS)
    expect(r.perPillar.catalyst).toEqual({ passed: 1, n: 1, pct: 1 })
    expect(r.buckets.fitAll).toBe(1)
  })

  it("T9 kind 'none' -> hasData TRUE, passes FALSE (the whole point)", () => {
    const r = computeDnaAdherence(
      [mk({ catalyst_type: 'Technical / No Catalyst' })],
      BASE,
      DEFS,
    )
    expect(r.perPillar.catalyst).toEqual({ passed: 0, n: 1, pct: 0 })
    expect(r.buckets.incomplete).toBe(0) // judgeable, not unknown
    expect(r.buckets.brokeAny).toBe(1)
  })

  it("T10 kind 'technical' -> hasData true, passes false", () => {
    const r = computeDnaAdherence([mk({ catalyst_type: 'Continuation' })], BASE, DEFS)
    expect(r.perPillar.catalyst).toEqual({ passed: 0, n: 1, pct: 0 })
    expect(r.buckets.brokeAny).toBe(1)
  })

  it('T11 a tag whose def row is ARCHIVED still resolves, not incomplete', () => {
    const r = computeDnaAdherence([mk({ catalyst_type: 'Old Presser' })], BASE, DEFS)
    expect(r.perPillar.catalyst).toEqual({ passed: 1, n: 1, pct: 1 })
    expect(r.buckets.incomplete).toBe(0)
  })

  it('T12 a tag with NO matching def row -> hasData false, never a silent pass', () => {
    const r = computeDnaAdherence([mk({ catalyst_type: 'Ghost Label' })], BASE, DEFS)
    // Unjudgeable, NOT a pass: the vocabulary cannot say what this means.
    expect(r.perPillar.catalyst).toEqual({ passed: 0, n: 0, pct: null })
    expect(r.buckets.incomplete).toBe(1)
    expect(r.buckets.fitAll).toBe(0)
  })

  it('T16 case / whitespace differences still resolve (as lenient as rename)', () => {
    const r = computeDnaAdherence(
      [mk({ catalyst_type: '  eArNiNgS  ' }), mk({ catalyst_type: 'CONTINUATION' })],
      BASE,
      DEFS,
    )
    expect(r.perPillar.catalyst.n).toBe(2)
    expect(r.perPillar.catalyst.passed).toBe(1) // Earnings news, Continuation technical
  })
})

describe('catalyst pillar — the flag', () => {
  const FIXTURE = () => [
    mk({ catalyst_type: 'Earnings' }),
    mk({ catalyst_type: 'Technical / No Catalyst' }),
    mk({ catalyst_type: null }),
  ]

  it('T13 HEALTHY: flag OFF leaves buckets byte-identical, yet still REPORTS coverage', () => {
    const withDefs = computeDnaAdherence(FIXTURE(), OFF, DEFS)
    const withoutDefs = computeDnaAdherence(FIXTURE(), OFF, [])
    // All three trades are complete on price/change/rvol/float and pass all four.
    expect(withDefs.buckets).toEqual({ fitAll: 3, brokeAny: 0, incomplete: 0, total: 3 })
    // And the defs list is irrelevant to the BUCKETS when the pillar isn't required.
    expect(withoutDefs.buckets).toEqual(withDefs.buckets)
    // REPORT vs ENFORCE are different things: the pillar is measured either way, so
    // the tile can show coverage without the flag changing anyone's numbers. Without
    // this assertion T13 would pass against the untouched baseline and guard nothing.
    expect(withDefs.perPillar.catalyst).toEqual({ passed: 1, n: 2, pct: 0.5 })
  })

  it('T14 STAND-DOWN: the SAME fixture, flag OFF vs ON, produces DIFFERENT buckets', () => {
    const off = computeDnaAdherence(FIXTURE(), OFF, DEFS)
    const on = computeDnaAdherence(FIXTURE(), BASE, DEFS)
    expect(off.buckets).not.toEqual(on.buckets)
    expect(off.buckets).toEqual({ fitAll: 3, brokeAny: 0, incomplete: 0, total: 3 })
    // ON: Earnings fits, the no-catalyst trade BREAKS, the untagged one is unjudgeable.
    expect(on.buckets).toEqual({ fitAll: 1, brokeAny: 1, incomplete: 1, total: 3 })
  })

  it('T15 defs unavailable while the flag is ON is a LOAD FAILURE, not an untagged book', () => {
    const r = computeDnaAdherence(FIXTURE(), BASE, [])
    // It must NOT sweep every trade into `incomplete` and read as "go tag your trades".
    expect(r.catalystDefsUnavailable).toBe(true)
    expect(r.buckets).toEqual({ fitAll: 3, brokeAny: 0, incomplete: 0, total: 3 })
    // And the healthy path must say so too, so the UI can trust the flag.
    expect(computeDnaAdherence(FIXTURE(), BASE, DEFS).catalystDefsUnavailable).toBe(false)
  })
})
