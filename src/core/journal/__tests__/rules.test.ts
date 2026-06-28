import { describe, it, expect } from 'vitest'
import type { JournalRule } from '@shared/journal-types'
import {
  makeJournalRule,
  resolveRuleName,
  resolveRuleId,
  activeRules,
  parseJournalRules,
  cleanJournalRules,
  splitRuleMarks,
  rulesEqual,
  type RuleState,
} from '../rules'

describe('makeJournalRule', () => {
  it('creates a rule with a fresh id, trimmed name, archived=false', () => {
    const r = makeJournalRule('  Honored stop loss  ')
    expect(r.name).toBe('Honored stop loss')
    expect(r.archived).toBe(false)
    expect(typeof r.id).toBe('string')
    expect(r.id.length).toBeGreaterThan(0)
  })

  it('mints a unique id per call', () => {
    const a = makeJournalRule('A')
    const b = makeJournalRule('B')
    expect(a.id).not.toBe(b.id)
  })
})

describe('resolveRuleName / resolveRuleId', () => {
  const rules: JournalRule[] = [
    { id: 'r1', name: 'Honored stop loss', archived: false },
    { id: 'r2', name: 'Avoided FOMO entries', archived: true },
  ]

  it('round-trips id <-> name', () => {
    expect(resolveRuleName(rules, 'r1')).toBe('Honored stop loss')
    expect(resolveRuleId(rules, 'Honored stop loss')).toBe('r1')
  })

  it('resolveRuleName returns null for an unknown id', () => {
    expect(resolveRuleName(rules, 'nope')).toBeNull()
  })

  it('resolveRuleId returns null for an unknown name (THE orphan case — Beat 2 resurrects these as archived)', () => {
    expect(resolveRuleId(rules, 'No revenge trading')).toBeNull()
  })

  it('resolves names/ids regardless of a rule being archived', () => {
    expect(resolveRuleName(rules, 'r2')).toBe('Avoided FOMO entries')
    expect(resolveRuleId(rules, 'Avoided FOMO entries')).toBe('r2')
  })
})

describe('activeRules', () => {
  it('filters out archived rules, preserving order', () => {
    const rules: JournalRule[] = [
      { id: 'r1', name: 'A', archived: false },
      { id: 'r2', name: 'B', archived: true },
      { id: 'r3', name: 'C', archived: false },
    ]
    expect(activeRules(rules).map((r) => r.id)).toEqual(['r1', 'r3'])
  })
})

describe('parseJournalRules (stored JSON -> JournalRule[])', () => {
  it('parses objects, preserving id/name/archived (incl. archived:true)', () => {
    const json = JSON.stringify([
      { id: 'r1', name: 'Honored stop loss', archived: false },
      { id: 'r2', name: 'Old rule', archived: true },
    ])
    expect(parseJournalRules(json)).toEqual([
      { id: 'r1', name: 'Honored stop loss', archived: false },
      { id: 'r2', name: 'Old rule', archived: true },
    ])
  })
  it('coerces a missing archived to false; trims the name', () => {
    expect(parseJournalRules(JSON.stringify([{ id: 'r1', name: '  A  ' }]))).toEqual([
      { id: 'r1', name: 'A', archived: false },
    ])
  })
  it('drops entries missing id or name', () => {
    const json = JSON.stringify([
      { id: '', name: 'no id', archived: false },
      { id: 'r2', name: '', archived: false },
      { id: 'r3', name: 'ok', archived: false },
    ])
    expect(parseJournalRules(json)).toEqual([{ id: 'r3', name: 'ok', archived: false }])
  })
  it('degrades safely: null / non-JSON / non-array -> []', () => {
    expect(parseJournalRules(null)).toEqual([])
    expect(parseJournalRules('')).toEqual([])
    expect(parseJournalRules('not json')).toEqual([])
    expect(parseJournalRules('{"a":1}')).toEqual([])
  })
})

describe('cleanJournalRules (validate for save)', () => {
  it('trims names and drops malformed entries', () => {
    const rules = [
      { id: 'r1', name: '  Keep me  ', archived: false },
      { id: '', name: 'drop: no id', archived: false },
      { id: 'r3', name: '   ', archived: false },
    ] as JournalRule[]
    expect(cleanJournalRules(rules)).toEqual([{ id: 'r1', name: 'Keep me', archived: false }])
  })
  it('KEEPS archived rules (dropping them would re-orphan history)', () => {
    const rules: JournalRule[] = [
      { id: 'r1', name: 'Active', archived: false },
      { id: 'r2', name: 'Archived', archived: true },
    ]
    const out = cleanJournalRules(rules)
    expect(out).toHaveLength(2)
    expect(out.find((r) => r.id === 'r2')!.archived).toBe(true)
  })
})

describe('splitRuleMarks (id-keyed states -> followed/violated id arrays)', () => {
  it('splits followed/violated and omits neutral', () => {
    const states: Record<string, RuleState> = { a: 'followed', b: 'violated', c: 'neutral' }
    expect(splitRuleMarks(states)).toEqual({ followed: ['a'], violated: ['b'] })
  })
  it('empty map -> empty arrays', () => {
    expect(splitRuleMarks({})).toEqual({ followed: [], violated: [] })
  })
  it('RE-ORPHAN GUARD: includes a marked id even if it is not an active rule (archived history preserved)', () => {
    const states: Record<string, RuleState> = { activeId: 'followed', archivedId: 'violated' }
    const out = splitRuleMarks(states)
    expect(out.violated).toContain('archivedId') // not dropped just because it's archived
    expect(out.followed).toEqual(['activeId'])
  })
})

describe('rulesEqual (dirty check by id + name + archived + order)', () => {
  const base: JournalRule[] = [
    { id: 'r1', name: 'A', archived: false },
    { id: 'r2', name: 'B', archived: false },
  ]
  it('equal when id+name+archived+order match', () => {
    expect(rulesEqual(base, [
      { id: 'r1', name: 'A', archived: false },
      { id: 'r2', name: 'B', archived: false },
    ])).toBe(true)
  })
  it('a rename (name change, same id) is NOT equal', () => {
    expect(rulesEqual(base, [
      { id: 'r1', name: 'A renamed', archived: false },
      { id: 'r2', name: 'B', archived: false },
    ])).toBe(false)
  })
  it('an archive toggle is NOT equal', () => {
    expect(rulesEqual(base, [
      { id: 'r1', name: 'A', archived: true },
      { id: 'r2', name: 'B', archived: false },
    ])).toBe(false)
  })
  it('add / remove (length change) is NOT equal', () => {
    expect(rulesEqual(base, base.slice(0, 1))).toBe(false)
  })
  it('order change is NOT equal', () => {
    expect(rulesEqual(base, [base[1], base[0]])).toBe(false)
  })
})
