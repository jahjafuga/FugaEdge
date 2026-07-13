// Rule-break USAGE tally — the pure half of Beat 2's "stop the bleeding" guard.
//
// A rule-break label used on >= 1 journal day is FROZEN in Settings (no rename, no delete)
// until Beat 3 ships a history-preserving rename. This module answers the only question the
// guard needs: for each label, on how many DISTINCT days does it appear?
//
// The rows come from the SAME query the analytics rollup already runs
// (electron/analytics/get.ts:963-968) and are parsed with the SAME parser
// (electron/analytics/get.ts:875-883 — JSON-or-[], NO comma fallback; that fallback is
// settings-only and must not leak in here).

import { describe, expect, it } from 'vitest'
import { tallyRuleBreakUsage } from '@/core/ruleBreaks/usage'

const row = (date: string, rule_breaks: string | null) => ({ date, rule_breaks })

describe('tallyRuleBreakUsage — distinct-day counts', () => {
  it('(1) a label on 3 distinct dates counts 3', () => {
    const usage = tallyRuleBreakUsage([
      row('2026-05-01', '["Overtrading"]'),
      row('2026-05-02', '["Overtrading"]'),
      row('2026-05-03', '["Overtrading"]'),
    ])
    expect(usage['Overtrading']).toBe(3)
  })

  it('(2) a label appearing TWICE inside one date counts that date ONCE', () => {
    const usage = tallyRuleBreakUsage([
      row('2026-05-01', '["Overtrading","Overtrading"]'),
    ])
    expect(usage['Overtrading']).toBe(1)
  })

  it('(3) two different labels on the same date each count that date', () => {
    const usage = tallyRuleBreakUsage([
      row('2026-05-01', '["Overtrading","Revenge trade"]'),
    ])
    expect(usage['Overtrading']).toBe(1)
    expect(usage['Revenge trade']).toBe(1)
  })

  it('(4) a malformed-JSON row contributes nothing and does not throw', () => {
    expect(() =>
      tallyRuleBreakUsage([
        row('2026-05-01', '{not json'),
        row('2026-05-02', '["Overtrading"]'),
      ]),
    ).not.toThrow()

    const usage = tallyRuleBreakUsage([
      row('2026-05-01', '{not json'),
      row('2026-05-02', '["Overtrading"]'),
    ])
    expect(usage['Overtrading']).toBe(1)
    expect(Object.keys(usage)).toHaveLength(1)
  })

  it('(5) rows the production WHERE filters out (null / empty / "[]") contribute nothing', () => {
    // These never reach the repo fn in production (the SELECT excludes them), but the pure
    // tally must be defensive rather than assume its caller filtered correctly.
    const usage = tallyRuleBreakUsage([
      row('2026-05-01', null),
      row('2026-05-02', ''),
      row('2026-05-03', '[]'),
      row('2026-05-04', '["Overtrading"]'),
    ])
    expect(usage['Overtrading']).toBe(1)
    expect(Object.keys(usage)).toHaveLength(1)
  })

  it('(6) DRIFT/SAFETY: a whitespace-drifted history label still reads as USED for the clean vocab label', () => {
    // The write paths trim on both sides today (day/ruleBreaks.ts:cleanRuleBreaks and
    // settings/repo.ts's daily_rule_break_list branch), but a legacy or hand-edited value can
    // still carry drift. If " Overtrading " failed to match the vocabulary's "Overtrading",
    // the guard would read the label as UNUSED and let the user delete it -- orphaning the very
    // days we are trying to protect. Trim both sides so drift can only ever FREEZE, never free.
    const usage = tallyRuleBreakUsage([
      row('2026-05-01', '["Overtrading "]'),
      row('2026-05-02', '[" Overtrading"]'),
    ])
    expect(usage['Overtrading']).toBe(2)
  })

  it('an empty input yields an empty map', () => {
    expect(tallyRuleBreakUsage([])).toEqual({})
  })
})
