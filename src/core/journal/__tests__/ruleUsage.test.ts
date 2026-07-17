// THE FINAL TWO, build A — the journal-rule USAGE tally (pure, mirrors
// core/ruleBreaks/usage.ts). For each rule ID: on how many DISTINCT days is
// it marked, counting rules_followed AND rule_violations alike; a rule
// marked twice on one day (or in both arrays) is still ONE day. This is the
// read behind the Remove guard: a used rule cannot be hard-deleted.

import { describe, it, expect } from 'vitest'
import { tallyJournalRuleUsage } from '../rules'

describe('tallyJournalRuleUsage', () => {
  it('(4) exact Record<id, distinct days>: double-marks count once; followed and violated both count', () => {
    const rows = [
      // r1 marked twice on the same day (followed AND violated) -> ONE day.
      {
        date: '2026-07-01',
        rules_followed: '["r1","r2"]',
        rule_violations: '["r1"]',
      },
      // violated-only counts.
      { date: '2026-07-02', rules_followed: '[]', rule_violations: '["r1"]' },
      // followed-only counts.
      { date: '2026-07-03', rules_followed: '["r2"]', rule_violations: '' },
    ]
    expect(tallyJournalRuleUsage(rows)).toEqual({ r1: 2, r2: 2 })
  })

  it('empty / blank / malformed cells contribute nothing; unused ids have no key', () => {
    const rows = [
      { date: '2026-07-04', rules_followed: '[]', rule_violations: '[]' },
      { date: '2026-07-05', rules_followed: '', rule_violations: '' },
      { date: '2026-07-06', rules_followed: 'not-json', rule_violations: '["r9"]' },
    ]
    expect(tallyJournalRuleUsage(rows)).toEqual({ r9: 1 })
  })

  it('the same id across many days counts each day once', () => {
    const rows = [
      { date: '2026-07-07', rules_followed: '["rA"]', rule_violations: '[]' },
      { date: '2026-07-08', rules_followed: '["rA"]', rule_violations: '[]' },
      { date: '2026-07-08', rules_followed: '[]', rule_violations: '["rA"]' }, // dup date row
      { date: '2026-07-09', rules_followed: '[]', rule_violations: '["rA"]' },
    ]
    expect(tallyJournalRuleUsage(rows)).toEqual({ rA: 3 })
  })
})
