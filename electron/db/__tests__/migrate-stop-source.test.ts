// Auto-fill-stop Beat 1 — the schema 50 -> 51 bump for trades.stop_source.
// The BEHAVIOR (column add, the 'manual' stamp on every pre-existing stop, the NULL
// rule, idempotency, the CHECK) is proven against a REAL in-memory engine in
// electron/db/__tests__/stop-source.inmemory.ts, run via `npm run test:stop-source`
// (better-sqlite3's Electron ABI won't load under vitest, and a fake connection cannot
// enforce a CHECK — which is the whole point of that constraint). This file locks the
// pure, sqlite-free part: the version floor and the closed source set that the CHECK
// constraint and TradeListRow both mirror.
//
// There is deliberately NO target-version constant, for the same reason as
// migrate-catalyst-kind: this migration is NOT version-gated — it self-guards on column
// presence so fresh installs are covered — and exporting a TARGET_SCHEMA_VERSION whose
// only reader was a test asserting its own value would imply a gate that does not exist.

import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../schema'
import { STOP_SOURCES } from '../migrate-stop-source'

describe('migrate-stop-source — schema 50 -> 51 version bump', () => {
  it('holds SCHEMA_VERSION at the stop-source floor of 51 or later (later beats advance it)', () => {
    expect(Number(SCHEMA_VERSION)).toBeGreaterThanOrEqual(51)
  })

  it('the source set is exactly manual / auto — the CHECK constraint mirrors it', () => {
    // NULL is legal too, but it is absence rather than a value, so it is not a member:
    // the CHECK spells it as `stop_source IS NULL OR stop_source IN (...)`.
    expect([...STOP_SOURCES]).toEqual(['manual', 'auto'])
  })

  it("'manual' leads the set — it is the value the migration stamps, and the one nothing may overwrite", () => {
    expect(STOP_SOURCES[0]).toBe('manual')
  })
})
