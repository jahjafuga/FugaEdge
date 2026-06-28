import { describe, it, expect } from 'vitest'
import type { JournalRule } from '@shared/journal-types'
import {
  makeJournalRule,
  resolveRuleName,
  resolveRuleId,
  activeRules,
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
