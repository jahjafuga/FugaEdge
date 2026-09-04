// THE LONG-VS-SHORT TAB'S OWN WORDS, in one place, on the period-wording
// pattern: a documented interface plus the strings, so the copy can be checked
// against what shipped rather than against memory. shared/ is the lowest
// layer and imports from nothing above it.
//
// THE STRINGS ARE THE RULED COPY of beat 283, verbatim. Placeholders in curly
// braces are filled at render time by fillDirection below; every number a
// sentence carries ({N}, {R}) is a constant from src/core/performance/
// direction.ts, threaded in by the caller so this file stays pure prose.
//
// NO EM DASH anywhere in this file, by law; the app's null CELLS still render
// the formatters' own null string, which is not authored here.

/** How much the sample has earned. Insufficient until BOTH sides reach the
 *  floor; reliable only once BOTH reach the reliable count. */
export type DirectionTier = 'insufficient' | 'preliminary' | 'reliable'

/** Which way the edge reads. Null exactly when the tier is insufficient:
 *  under the floor there is no verdict at all, not a hedged one. */
export type DirectionVerdict = 'long' | 'short' | 'balanced' | null

export interface DirectionWordingShape {
  /** The Analytics tab strip entry, and nothing else. */
  tabLabel: string
  /** The three metric-grid column headers. */
  colLong: string
  colShort: string
  colDelta: string
  /** The identity card's tier chip, one per DirectionTier. */
  tierInsufficient: string
  tierPreliminary: string
  tierReliable: string
  /** One side has zero trades. {side} long|short, {N} the floor. */
  noSideYet: string
  /** One side is under the floor, the other is not. {side} {n} {N}. */
  oneSideThin: string
  /** Both sides under the floor. {L} {S} {N}. */
  bothThin: string
  /** The six earned sentences: tier x verdict. {L} {S} {R}. */
  prelimLong: string
  prelimShort: string
  prelimBalanced: string
  reliableLong: string
  reliableShort: string
  reliableBalanced: string
  /** The chart caption when one side has no curve. {side}. */
  curveNoSide: string
  /** The excursion rows' coverage sub-line (beat 284). {k} counts rows with a
   *  non-null value; nulls are outside the mean AND the denominator. */
  excursionCoverage: string
  /** The grid's four section header rows (beat 287), in render order. */
  sectionOutcome: string
  sectionSize: string
  sectionRisk: string
  sectionExcursion: string
  /** The hero cards' big-figure label. */
  heroNet: string
  /** The identity card's per-side progress line under the floor. {n} {N}. */
  progressLabel: string
  /** The same line once a side has reached the floor. {n}. */
  progressCleared: string
  /** Shown in the grid while leaders are suppressed. {n} = the low-sample
   *  floor, so the line explains the silence rather than leaving it odd. */
  leadersHidden: string
  /** The 95% band line on an earned card. {lLo} {lHi} {sLo} {sHi}. */
  bandLine: string
  /** Shown on the card when a filter narrows the book. {n} = the filtered
   *  trade count, so a slice can never read as the whole book. */
  filterScope: string
  /** The metric grid's row labels, keyed by row id. */
  rowLabels: Record<string, string>
}

export const DirectionWording: DirectionWordingShape = {
  tabLabel: 'Long vs Short',
  colLong: 'Long',
  colShort: 'Short',
  colDelta: 'Delta (long minus short)',
  tierInsufficient: 'Not enough data yet',
  tierPreliminary: 'Preliminary',
  tierReliable: 'Reliable read',
  noSideYet: 'No {side} trades yet. The comparison opens at {N} trades per side.',
  oneSideThin: 'Not enough {side} trades yet to compare sides: {n} of {N}.',
  bothThin: 'Not enough trades on either side yet: long {L} of {N}, short {S} of {N}.',
  prelimLong:
    'Preliminary read on a thin sample: your long trades show the higher expectancy per trade, and the gap sits outside the confidence bands. Long {L} trades, short {S}. This firms up at {R} per side.',
  prelimShort:
    'Preliminary read on a thin sample: your short trades show the higher expectancy per trade, and the gap sits outside the confidence bands. Short {S} trades, long {L}. This firms up at {R} per side.',
  prelimBalanced:
    'Preliminary read on a thin sample: long and short perform similarly so far. The gap sits inside the confidence bands. Long {L} trades, short {S}.',
  reliableLong:
    'Your edge reads long: higher expectancy per trade, outside the confidence bands, on {L} long and {S} short trades.',
  reliableShort:
    'Your edge reads short: higher expectancy per trade, outside the confidence bands, on {S} short and {L} long trades.',
  reliableBalanced:
    'Long and short perform alike on {L} long and {S} short trades. The gap sits inside the confidence bands.',
  curveNoSide: 'No {side} trades in this range.',
  excursionCoverage: 'of {k} trades with excursion data',
  sectionOutcome: 'Outcome',
  sectionSize: 'Trade size',
  sectionRisk: 'Timing and risk',
  sectionExcursion: 'Excursion',
  heroNet: 'Net P&L',
  progressLabel: '{n} of {N} trades',
  progressCleared: '{n} trades, floor cleared',
  leadersHidden: 'Leaders hidden while a side has fewer than {n} trades.',
  bandLine: 'Expectancy per trade, 95% range: long {lLo} to {lHi}, short {sLo} to {sHi}.',
  filterScope: 'These counts are for the {n} trades this filter selects, not the whole book.',
  rowLabels: {
    netPnL: 'Total P&L',
    trades: 'Trades',
    winRate: 'Win rate',
    profitFactor: 'Profit factor',
    plRatio: 'P&L ratio',
    expectancy: 'Expectancy',
    expectancyR: 'Expectancy (R)',
    avgWinner: 'Avg winner',
    avgLoser: 'Avg loser',
    largestWinner: 'Largest winner',
    largestLoser: 'Largest loser',
    avgHold: 'Avg hold time',
    maxDrawdown: 'Max drawdown',
    dnaScore: 'Rules score (of 5)',
    avgMfe: 'Avg MFE (per share)',
    avgMae: 'Avg MAE (per share)',
  },
}

/** The sentence key for an earned (tier, verdict) pair. The insufficient tier
 *  maps to bothThin as its base sentence; the card refines to oneSideThin or
 *  noSideYet from the counts it alone holds. Exhaustive by construction: the
 *  switch has no default and the compiler checks every arm. */
export function directionSentenceKey(
  tier: DirectionTier,
  verdict: DirectionVerdict,
): keyof DirectionWordingShape {
  if (tier === 'insufficient') return 'bothThin'
  if (tier === 'preliminary') {
    return verdict === 'long' ? 'prelimLong' : verdict === 'short' ? 'prelimShort' : 'prelimBalanced'
  }
  return verdict === 'long' ? 'reliableLong' : verdict === 'short' ? 'reliableShort' : 'reliableBalanced'
}

/** Fill {name} placeholders. Numbers are rendered as-is; the caller formats
 *  anything that needs more than String(). */
export function fillDirection(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`,
  )
}
