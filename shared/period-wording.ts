// THE PERIOD'S OWN WORDS, supplied by whoever mounts the review tabs.
//
// The five Week* tabs each hardcoded the noun "week" in their copy -- sixteen
// strings across five files. Every number they render is period-agnostic and
// always was, so the only thing standing between those tabs and a longer
// window was the wording.
//
// THIS IS THE SHAPE DetailNotesTab HAS ALWAYS USED. That tab takes `label` and
// `placeholder` from its host (WeekReviewModal/index.tsx:182 passes "Week
// notes"), which is why it is the one tab of the six that needed no change.
// The other five now follow it.
//
// EVERY FIELD NAMES THE STRING IT REPLACES AND WHERE THAT STRING LIVED, so the
// weekly wording can be checked against what shipped rather than against
// memory.
export interface PeriodWording {
  /** WeekOverviewTab.tsx:69 -- the review card's heading.
   *  Week: "Weekly review" */
  reviewTitle: string
  /** WeekOverviewTab.tsx:72 -- shown once the review is logged.
   *  Week: "Logged for this week — weekly-review XP banked." */
  reviewDone: string
  /** WeekOverviewTab.tsx:73 -- shown before it is logged.
   *  Week: "Mark this week reviewed to bank the weekly-review XP." */
  reviewPrompt: string
  /** WeekOverviewTab.tsx:100, WeekPerformanceTab.tsx:29, WeekTradesTab.tsx:63
   *  -- the same sentence in three tabs, which is why it is ONE field.
   *  Week: "No trades this week." */
  noTrades: string
  /** WeekOverviewTab.tsx:129 -- the equity curve's subtitle.
   *  Week: "Cumulative net P&L across the week — steps at each trade close." */
  equitySubtitle: string
  /** WeekOverviewTab.tsx:190 and WeekPerformanceTab.tsx:151 -- one field, two
   *  tabs. Week: "Streak into next week" */
  streakLabel: string
  /** WeekPerformanceTab.tsx:78 -- when there are winners but no losers.
   *  Week: "No losing trades — profit factor is undefined (winning-only week)." */
  profitFactorUndefined: string
  /** WeekPerformanceTab.tsx:167 -- the per-playbook empty row.
   *  Week: "No playbooks tagged this week." */
  noPlaybooks: string
  /** WeekPerformanceTab.tsx:247 -- the day-by-day card's subtitle.
   *  Week: "Which days carried the week." */
  dayByDaySubtitle: string
  /** WeekMistakesTab.tsx:21 -- the mistakes card's subtitle.
   *  Week: "Aggregated across the week's trades." */
  mistakesSubtitle: string
  /** WeekPatternsTab.tsx:96 -- the patterns card's title.
   *  Week: "Patterns this week" */
  patternsTitle: string
  /** WeekPatternsTab.tsx:99 -- shown when no topic recurs.
   *  Week: "No recurring topics yet — they'll appear as you journal this week." */
  patternsEmpty: string
  /** WeekPatternsTab.tsx:104 -- the patterns card's explanatory line.
   *  Week: "Topics you wrote across this week's entries — counts, not judgments." */
  patternsSubtitle: string
}
