import { describe, it, expect } from 'vitest'
import { convertLegacyJournalRules } from '../rules'

// Stored TEXT format mirrors saveJournalDay (JSON arrays). The conversion is the
// dangerous beat: it must preserve EVERY recorded mark (conservation) and
// resurrect orphaned names as ARCHIVED rules (deduped) rather than dropping them.
const J = (names: string[]) => JSON.stringify(names)
const idOf = (
  res: ReturnType<typeof convertLegacyJournalRules>,
  name: string,
): string | undefined => res.newRulesList.find((r) => r.name === name)?.id

describe('convertLegacyJournalRules', () => {
  it('(1) clean match: maps followed/violations to their rule ids; rules stay active', () => {
    const res = convertLegacyJournalRules(J(['A', 'B']), [
      { date: 'd1', rules_followed: J(['A']), rule_violations: J(['B']) },
    ])
    expect(res.newRulesList).toHaveLength(2)
    expect(res.newRulesList.every((r) => !r.archived)).toBe(true)
    expect(res.rowUpdates[0].rules_followed).toEqual([idOf(res, 'A')])
    expect(res.rowUpdates[0].rule_violations).toEqual([idOf(res, 'B')])
  })

  it('(2) orphan: a name not in the rules list is resurrected as an archived rule', () => {
    const res = convertLegacyJournalRules(J(['A']), [
      { date: 'd1', rules_followed: J(['A', 'GONE']), rule_violations: J([]) },
    ])
    expect(res.newRulesList).toHaveLength(2)
    expect(res.newRulesList.find((r) => r.name === 'A')!.archived).toBe(false)
    expect(res.newRulesList.find((r) => r.name === 'GONE')!.archived).toBe(true)
    expect(res.rowUpdates[0].rules_followed).toEqual([idOf(res, 'A'), idOf(res, 'GONE')])
  })

  it('(3) orphan dedupe: same orphan across two rows -> ONE resurrected rule, same id', () => {
    const res = convertLegacyJournalRules(J(['A']), [
      { date: 'd1', rules_followed: J(['GONE']), rule_violations: J([]) },
      { date: 'd2', rules_followed: J(['GONE']), rule_violations: J([]) },
    ])
    const archived = res.newRulesList.filter((r) => r.archived)
    expect(archived).toHaveLength(1)
    expect(res.rowUpdates[0].rules_followed[0]).toBe(idOf(res, 'GONE'))
    expect(res.rowUpdates[1].rules_followed[0]).toBe(idOf(res, 'GONE'))
  })

  it('(4) orphan appearing in followed AND violations across rows -> one resurrected rule', () => {
    const res = convertLegacyJournalRules(J([]), [
      { date: 'd1', rules_followed: J(['GONE']), rule_violations: J([]) },
      { date: 'd2', rules_followed: J([]), rule_violations: J(['GONE']) },
    ])
    expect(res.newRulesList.filter((r) => r.archived)).toHaveLength(1)
    expect(res.rowUpdates[0].rules_followed[0]).toBe(idOf(res, 'GONE'))
    expect(res.rowUpdates[1].rule_violations[0]).toBe(idOf(res, 'GONE'))
  })

  it('(5) empty: empty rules + empty arrays -> empty list, empty updates, no crash', () => {
    const res = convertLegacyJournalRules(J([]), [
      { date: 'd1', rules_followed: J([]), rule_violations: J([]) },
    ])
    expect(res.newRulesList).toHaveLength(0)
    expect(res.rowUpdates[0].rules_followed).toEqual([])
    expect(res.rowUpdates[0].rule_violations).toEqual([])
  })

  it('(6) a rule used in followed (one row) and violations (another) gets a consistent id', () => {
    const res = convertLegacyJournalRules(J(['A']), [
      { date: 'd1', rules_followed: J(['A']), rule_violations: J([]) },
      { date: 'd2', rules_followed: J([]), rule_violations: J(['A']) },
    ])
    expect(res.rowUpdates[0].rules_followed[0]).toBe(idOf(res, 'A'))
    expect(res.rowUpdates[1].rule_violations[0]).toBe(idOf(res, 'A'))
  })

  it('(7) CONSERVATION: total name-refs in == total id-refs out (zero marks dropped)', () => {
    const rows = [
      { date: 'd1', rules_followed: J(['A', 'GONE1']), rule_violations: J(['B']) },
      { date: 'd2', rules_followed: J(['C']), rule_violations: J(['GONE1', 'GONE2']) },
    ]
    const namesIn = 2 + 1 + 1 + 2 // 6
    const res = convertLegacyJournalRules(J(['A', 'B', 'C']), rows)
    const idsOut = res.rowUpdates.reduce(
      (s, r) => s + r.rules_followed.length + r.rule_violations.length,
      0,
    )
    expect(idsOut).toBe(namesIn)
    expect(res.newRulesList.filter((r) => !r.archived)).toHaveLength(3) // A,B,C
    expect(res.newRulesList.filter((r) => r.archived)).toHaveLength(2) // GONE1,GONE2
  })

  it('(8) duplicate name within one row array is PRESERVED 1:1 (conservation exact)', () => {
    const res = convertLegacyJournalRules(J(['A']), [
      { date: 'd1', rules_followed: J(['A', 'A']), rule_violations: J([]) },
    ])
    expect(res.rowUpdates[0].rules_followed).toEqual([idOf(res, 'A'), idOf(res, 'A')])
  })
})
