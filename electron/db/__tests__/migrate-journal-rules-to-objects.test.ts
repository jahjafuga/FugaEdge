import { describe, it, expect } from 'vitest'
import { detectJournalRulesShape } from '../migrate-journal-rules-to-objects'

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
