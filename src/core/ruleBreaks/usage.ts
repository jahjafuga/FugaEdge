// Rule-break USAGE tally — PURE (zero electron / db / DOM imports, per ARCHITECTURE #1).
//
// Beat 2 "stop the bleeding". Rule-breaks have no id and no archived flag: a day links to one
// by NAME (journal.rule_breaks, a JSON array of label strings) and Analytics groups by that raw
// string (electron/analytics/get.ts:963-975 -> src/core/analytics/ruleBreaks.ts). So renaming or
// deleting a label in Settings silently ORPHANS every day carrying it — the label keeps counting
// in Analytics while vanishing from the vocabulary, un-restorable.
//
// Until Beat 3 ships a history-preserving rename + an archive model, a label used on >= 1 day is
// FROZEN in Settings. This module answers the only question that guard needs: for each label, on
// how many DISTINCT days does it appear?

/** One journal row, in the shape the repo reads it (electron/analytics/get.ts:963-968). */
export interface JournalRuleBreakRow {
  date: string
  rule_breaks: string | null
}

/** label (trimmed) -> number of DISTINCT journal days it appears on. */
export type RuleBreakUsage = Record<string, number>

// VERBATIM copy of electron/analytics/get.ts:875-883. COPIED, not imported: that module is
// electron-side and core must not import it. It is JSON-or-[] with NO comma fallback — the comma
// fallback in settings/repo.ts:67-80 belongs to the SETTINGS vocabulary and must never leak into
// how a DAY's array is read, or a malformed day cell would silently split into phantom labels.
function parseRuleBreaks(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map((s) => String(s)).filter(Boolean) : []
  } catch {
    return []
  }
}

// Key on the TRIMMED label. Both write paths trim today (day/ruleBreaks.ts:cleanRuleBreaks and
// the daily_rule_break_list branch of settings/repo.ts), but a legacy or hand-edited value can
// still drift. If a stored " Overtrading " failed to match the vocabulary's "Overtrading", the
// guard would read that label as UNUSED and let the user delete it — orphaning the very days it
// exists to protect. Trimming both sides means drift can only ever FREEZE a row, never free one.
//
// Case is deliberately NOT folded. A case-drifted history label ("overtrading") is ALREADY an
// orphan — it is not in the vocabulary at all — so folding case would freeze a live entry on
// account of a lookalike it can never orphan.
const key = (label: string): string => label.trim()

export function tallyRuleBreakUsage(rows: JournalRuleBreakRow[]): RuleBreakUsage {
  const daysByLabel = new Map<string, Set<string>>()

  for (const r of rows) {
    // Dedup within the day, mirroring computeRuleBreaks (src/core/analytics/ruleBreaks.ts:47):
    // a label tagged twice on one date is still ONE day.
    for (const raw of new Set(parseRuleBreaks(r.rule_breaks))) {
      const k = key(raw)
      if (!k) continue
      let days = daysByLabel.get(k)
      if (!days) {
        days = new Set<string>()
        daysByLabel.set(k, days)
      }
      days.add(r.date)
    }
  }

  const out: RuleBreakUsage = {}
  for (const [label, days] of daysByLabel) out[label] = days.size
  return out
}
