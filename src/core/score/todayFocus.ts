// v0.2.5 EdgeIQ daily-debrief — the today FOCUS line. PURE (ARCHITECTURE #1):
// no electron / fs / DB / React; the only imports are the app's pure money
// formatter (src/lib/format — already a core-side dependency elsewhere) and a
// type. Derives one short focus sentence from today's leaked items — the
// `leaked` column of splitWorkedLeaked (whatWorkedLeaked.ts), which arrives
// worst-first — so it names the day's single biggest leak and prescribes a fix.
//
// No-fabrication rule (mirrors heroCards.ts's money gate): a dollar figure is
// stated ONLY when the leak carries a genuine money value (netPnl present —
// symbol / trade / playbook / day leaks). A mistake-tag leak has no dollar
// (netPnl null), so it surfaces its occurrence COUNT instead — never a derived
// or manufactured dollar. No leaks at all → null (the caller renders a static
// fallback, not an invented focus).

import { money } from '@/lib/format'
import type { WorkedLeakedItem } from '@/core/analytics/whatWorkedLeaked'

export function todayFocus(leaked: WorkedLeakedItem[]): string | null {
  const worst = leaked[0]
  if (!worst) return null

  // Mistake leak — count-based, NEVER a dollar (netPnl is null for mistakes).
  if (worst.kind === 'mistake') {
    const times = worst.count === 1 ? 'once' : `${worst.count} times`
    return `Watch the "${worst.label}" mistake — it showed up ${times} today.`
  }

  // Money-bearing leak (symbol / trade / playbook / day): state the realized
  // loss. `leaked` items are sign-gated negative by splitWorkedLeaked, so the
  // magnitude reads cleanly after the verb "leaked".
  if (worst.netPnl !== null) {
    return `Tighten ${worst.label} — it leaked ${money(Math.abs(worst.netPnl))} today.`
  }

  // Defensive: a non-mistake leak with no netPnl (not produced for a day) —
  // name it without inventing a number.
  return `Tighten ${worst.label} today.`
}
