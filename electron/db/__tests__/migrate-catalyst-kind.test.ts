// Catalyst-as-a-pillar Beat 1 — the schema 48 -> 49 bump for catalyst_def.kind.
// The BEHAVIOR (column add, default, the derive-by-seeded-name law, rename safety,
// archived rows, idempotency) is proven against a REAL in-memory engine in
// electron/db/__tests__/catalyst-kind.inmemory.ts, run via `npm run test:catalyst-kind`
// (better-sqlite3's Electron ABI won't load under vitest). This file locks the pure,
// sqlite-free part: the version bump, the migration's target constant, and the closed
// kind set that the CHECK constraint and the shared type both mirror.

import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../schema'
import {
  CATALYST_KIND_TARGET_SCHEMA_VERSION,
  CATALYST_KINDS,
  NO_CATALYST_SEED_NAME,
} from '../migrate-catalyst-kind'

describe('migrate-catalyst-kind — schema 48 -> 49 version bump', () => {
  it('holds SCHEMA_VERSION at the catalyst-kind floor of 49 or later (later beats advance it)', () => {
    expect(Number(SCHEMA_VERSION)).toBeGreaterThanOrEqual(49)
  })

  it('targets schema 49', () => {
    expect(CATALYST_KIND_TARGET_SCHEMA_VERSION).toBe(49)
  })

  it('the kind set is exactly news / technical / none — the CHECK constraint mirrors it', () => {
    expect([...CATALYST_KINDS]).toEqual(['news', 'technical', 'none'])
  })

  it('the derive anchor is the SEEDED name, so the migration can match it in the data', () => {
    // If this literal ever drifts from migrate-catalyst-vocabulary's SEED[13], the
    // one-time derive silently matches nothing and every book ships all-'news'.
    expect(NO_CATALYST_SEED_NAME).toBe('Technical / No Catalyst')
  })
})
