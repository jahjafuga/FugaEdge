// RESTRICT TWO WHOLE-BOOK MAPS TO ONE WINDOW. It filters; it does not
// aggregate.
//
// WHY THIS EXISTS AT ALL. computeRuleBreaks (ruleBreaks.ts:22) is already
// period-agnostic: it takes date -> labels and date -> net and rolls up the
// UNION of their keys. Nothing in it names a day, a week or the book. So a
// window needs no new arithmetic -- it needs its inputs cut down first, and
// that cut is the only new logic in the feature.
//
// BOTH MAPS ARRIVE WHOLE BOOK, AND BOTH MUST BE CUT.
//   the rule-break map because readRuleBreaksByDate (electron/ruleBreaks/
//   repo.ts:67) has no WHERE clause at all -- it returns every dated break in
//   the book in one query, which is why a month costs one read and not thirty.
//   the P&L map because getPeriodDetail keeps it unbounded ON PURPOSE, so the
//   streak can reach back before the window (week/repo.ts:24-26).
//
// CUTTING ONLY THE FIRST IS THE INTERESTING BUG, and it is silent: the flawed
// side would still look right, because breaks drive it, while EVERY TRADED DAY
// IN THE BOOK with no break would count as a clean day of this window. The
// headline would be correct and the comparison beside it nonsense.
//
// WHY IT LIVES IN CORE. It is arithmetic on two plain Maps: no electron, no
// database, no DOM. The main process is where the maps are fetched, not where
// their meaning is decided (ARCHITECTURE rule 1), and a web port would fetch
// them elsewhere and call this unchanged.

/**
 * The two maps, restricted to [from, to].
 *
 * THE BOUNDARY IS INCLUSIVE AT BOTH ENDS. A rule broken on the first day of a
 * month belongs to that month, and so does one broken on its last. Dates are
 * bare YYYY-MM-DD and compare correctly as strings, which is the same
 * comparison the SQL windows use (`date >= ? AND date <= ?`).
 */
export function restrictMapsToWindow(
  ruleBreaksByDate: ReadonlyMap<string, string[]>,
  netPnlByDate: ReadonlyMap<string, number>,
  from: string,
  to: string,
): { ruleBreaksByDate: Map<string, string[]>; netPnlByDate: Map<string, number> } {
  const inWindow = (d: string): boolean => d >= from && d <= to

  const breaks = new Map<string, string[]>()
  for (const [date, labels] of ruleBreaksByDate) {
    if (inWindow(date)) breaks.set(date, labels)
  }

  const net = new Map<string, number>()
  for (const [date, pnl] of netPnlByDate) {
    if (inWindow(date)) net.set(date, pnl)
  }

  return { ruleBreaksByDate: breaks, netPnlByDate: net }
}
