import { describe, it, expect } from 'vitest'
import {
  detectJournalRulesShape,
  migrateJournalRulesToObjects,
} from '../migrate-journal-rules-to-objects'

// The shape detector is the SAFETY PRIMITIVE Beat 2's conversion gates on:
// convert only 'legacy-strings', skip 'objects' (idempotent), never touch the
// rest. Pure string -> enum; testable without a DB (the module's better-sqlite3
// import is type-only, erased under vitest — same as the other migrate-* tests).
describe('detectJournalRulesShape (Beat-2 safety guard)', () => {
  it('absent when the row value is undefined', () => {
    expect(detectJournalRulesShape(undefined)).toBe('absent')
  })
  it('legacy-strings for the seeded string[] shape', () => {
    expect(
      detectJournalRulesShape('["Honored stop loss","Avoided FOMO entries"]'),
    ).toBe('legacy-strings')
  })
  it('objects for the migrated JournalRule[] shape', () => {
    expect(
      detectJournalRulesShape('[{"id":"r1","name":"Honored stop loss","archived":false}]'),
    ).toBe('objects')
  })
  it('empty for an empty array', () => {
    expect(detectJournalRulesShape('[]')).toBe('empty')
  })
  it('unparseable for non-JSON', () => {
    expect(detectJournalRulesShape('not json')).toBe('unparseable')
  })
  it('unparseable for a non-array JSON value', () => {
    expect(detectJournalRulesShape('{"a":1}')).toBe('unparseable')
  })
  it('unparseable for a mixed/partial array — Beat 2 must NOT touch it', () => {
    expect(
      detectJournalRulesShape('["a",{"id":"r1","name":"b","archived":false}]'),
    ).toBe('unparseable')
  })
})

// Mock-SQL-contract conn: records run() calls + flags transaction use. The
// migration's better-sqlite3 import is type-only, so a structural fake satisfies
// it at runtime (the migrate-* test convention).
type Row = { date: string; rules_followed: string; rule_violations: string }
function fakeConn(settingsValue: string | undefined, journalRows: Row[]) {
  const runs: { sql: string; args: unknown[] }[] = []
  let txnUsed = false
  return {
    get runs() {
      return runs
    },
    get txnUsed() {
      return txnUsed
    },
    prepare(sql: string) {
      return {
        get: () =>
          /FROM settings WHERE key/.test(sql)
            ? settingsValue == null
              ? undefined
              : { value: settingsValue }
            : undefined,
        all: () => (/FROM journal/.test(sql) ? journalRows : []),
        run: (...args: unknown[]) => {
          runs.push({ sql, args })
        },
      }
    },
    transaction(fn: () => void) {
      return () => {
        txnUsed = true
        return fn()
      }
    },
  }
}

describe('migrateJournalRulesToObjects (conversion body)', () => {
  it('converts on legacy-strings: UPDATEs each journal row + settings, in a transaction', () => {
    const conn = fakeConn(JSON.stringify(['A', 'B']), [
      { date: 'd1', rules_followed: JSON.stringify(['A']), rule_violations: JSON.stringify(['B']) },
    ])
    migrateJournalRulesToObjects(conn as never)
    expect(conn.txnUsed).toBe(true)
    expect(conn.runs.filter((r) => /UPDATE journal/i.test(r.sql))).toHaveLength(1)
    const settingsUpdates = conn.runs.filter((r) => /UPDATE settings/i.test(r.sql))
    expect(settingsUpdates).toHaveLength(1)
    const written = JSON.parse(settingsUpdates[0].args[0] as string)
    expect(written).toHaveLength(2)
    expect(
      written.every(
        (r: { id: unknown; name: unknown; archived: unknown }) =>
          typeof r.id === 'string' && typeof r.name === 'string' && typeof r.archived === 'boolean',
      ),
    ).toBe(true)
  })

  it('resurrects an orphan as archived and preserves both row refs (conservation)', () => {
    const conn = fakeConn(JSON.stringify(['A']), [
      { date: 'd1', rules_followed: JSON.stringify(['A', 'GONE']), rule_violations: JSON.stringify([]) },
    ])
    migrateJournalRulesToObjects(conn as never)
    const settingsUpdate = conn.runs.find((r) => /UPDATE settings/i.test(r.sql))!
    const written = JSON.parse(settingsUpdate.args[0] as string)
    expect(written.filter((r: { archived: boolean }) => r.archived)).toHaveLength(1)
    const journalUpdate = conn.runs.find((r) => /UPDATE journal/i.test(r.sql))!
    expect(JSON.parse(journalUpdate.args[0] as string)).toHaveLength(2) // both refs kept
  })

  it('no-op on objects shape (idempotent): no UPDATE, no transaction', () => {
    const conn = fakeConn(JSON.stringify([{ id: 'r1', name: 'A', archived: false }]), [])
    migrateJournalRulesToObjects(conn as never)
    expect(conn.runs.filter((r) => /UPDATE/i.test(r.sql))).toHaveLength(0)
    expect(conn.txnUsed).toBe(false)
  })

  it('no-op when the settings row is absent', () => {
    const conn = fakeConn(undefined, [])
    migrateJournalRulesToObjects(conn as never)
    expect(conn.runs.filter((r) => /UPDATE/i.test(r.sql))).toHaveLength(0)
    expect(conn.txnUsed).toBe(false)
  })
})
