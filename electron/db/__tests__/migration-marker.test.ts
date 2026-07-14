// The in-progress marker — SQL contract.
//
// Lives in _meta, NOT settings. Repo-wide, _meta has EXACTLY ONE writer: schema.ts:735's
// key-scoped `INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ...)`, which
// provably cannot touch another key. There is no UPDATE, no DELETE, no DROP of _meta anywhere.
// `settings` also survives SCHEMA_SQL (its seeds are INSERT OR IGNORE) but it is the USER-FACING
// KV store with many writers — one future "reset settings" feature silently destroys an in-flight
// marker, and destroying it means losing the resume point, which is this bug all over again.
//
// SQL-contract style (the journal-test convention): better-sqlite3's native binary won't load
// under vitest, so we assert on the SQL prepared. The real engine drives the SEMANTICS in
// electron/db/__tests__/migration-chain.inmemory.ts.

import { afterEach, describe, expect, it } from 'vitest'
import {
  MIGRATION_IN_PROGRESS_KEY,
  readMigrationMarker,
  writeMigrationMarker,
  clearMigrationMarker,
} from '../migration-marker'

let prepared: string[] = []
let row: { value: string } | undefined
let throwOnPrepare = false

const conn: any = {
  prepare: (sql: string) => {
    if (throwOnPrepare) throw new Error('no such table: _meta')
    prepared.push(sql)
    return {
      get: () => row,
      run: () => ({ changes: 1 }),
    }
  },
}

afterEach(() => {
  prepared = []
  row = undefined
  throwOnPrepare = false
})

describe('the marker key', () => {
  it('is migration_in_progress, and it lives in _meta', () => {
    expect(MIGRATION_IN_PROGRESS_KEY).toBe('migration_in_progress')
    writeMigrationMarker(conn, 46)
    expect(prepared[0]).toMatch(/_meta/i)
    expect(prepared[0]).not.toMatch(/\bsettings\b/i)
  })
})

describe('[F] *** INSERT OR IGNORE, NEVER INSERT OR REPLACE *** — the double-crash pin', () => {
  it('the write is INSERT OR IGNORE', () => {
    writeMigrationMarker(conn, 28)
    expect(prepared[0]).toMatch(/INSERT\s+OR\s+IGNORE\s+INTO\s+_meta/i)
  })

  it('it is NOT INSERT OR REPLACE, and it carries no ON CONFLICT DO UPDATE', () => {
    // DOUBLE CRASH. Boot 1: _meta=28, no marker -> write marker=28. Stamp -> 47. CRASH.
    // Boot 2: reads marker=28 (correct). If the write were INSERT OR REPLACE and boot 2
    // re-wrote it from readSchemaVersion() = 47, it would CLOBBER the resume point. CRASH.
    // Boot 3: marker=47 -> effective=47 -> every gate says 'already-migrated' -> we are back
    // to the original bug, silently and permanently. The resume point must be write-once.
    writeMigrationMarker(conn, 28)
    expect(prepared[0]).not.toMatch(/INSERT\s+OR\s+REPLACE/i)
    expect(prepared[0]).not.toMatch(/ON\s+CONFLICT/i)
  })
})

describe('readMigrationMarker', () => {
  it('reads the key back as a NUMBER (the original priorVersion, not a boolean)', () => {
    // A boolean cannot work: the retry must know WHERE to resume from, and it cannot pass 0 —
    // every migration guard reads `if (priorVersion === 0) return {reason:'fresh-install'}`,
    // so 0 would make the whole chain skip.
    row = { value: '46' }
    expect(readMigrationMarker(conn)).toBe(46)
  })

  it('absent -> null', () => {
    row = undefined
    expect(readMigrationMarker(conn)).toBeNull()
  })

  it('[H] *** FRESH INSTALL: _meta does not exist yet -> null, NEVER a throw ***', () => {
    // On a fresh install _meta is created by SCHEMA_SQL, which has not run yet at the point
    // the marker is read. readSchemaVersion returns 0 through exactly this catch
    // (database.ts:110-112). If the marker read threw instead, our own fail-closed boot
    // (bootOrFail -> dialog -> exit 1) would brick EVERY fresh install.
    throwOnPrepare = true
    expect(() => readMigrationMarker(conn)).not.toThrow()
    expect(readMigrationMarker(conn)).toBeNull()
  })

  it('garbage / non-numeric / zero -> null (never a bogus resume point)', () => {
    row = { value: 'banana' }
    expect(readMigrationMarker(conn)).toBeNull()
    row = { value: '0' }
    expect(readMigrationMarker(conn)).toBeNull()
    row = { value: '-3' }
    expect(readMigrationMarker(conn)).toBeNull()
  })
})

describe('clearMigrationMarker', () => {
  it('DELETEs only the marker key, never the schema_version row', () => {
    clearMigrationMarker(conn)
    expect(prepared[0]).toMatch(/DELETE\s+FROM\s+_meta/i)
    expect(prepared[0]).toMatch(/WHERE\s+key\s*=\s*\?/i)
    // it must not be a blunt DELETE FROM _meta with no predicate
    expect(prepared[0]).not.toMatch(/DELETE\s+FROM\s+_meta\s*$/i)
  })
})
