// Public surface of the Performance engine. Every renderer-side consumer
// imports from here so the per-file layout can shuffle without breaking
// callers.

export type {
  AlignedRow,
  AlignedSeries,
  BreakdownComparison,
  BreakdownDimension,
  BreakdownRow,
  ComparisonInsight,
  ComparisonInsightTone,
  ComparisonResult,
  CumulativePoint,
  DailyPnLPoint,
  DailyVolumePoint,
  DailyWinRatePoint,
  DateRange,
  DayPnL,
  DeltaDirection,
  DeltaMetric,
  DurationBucket,
  OverviewFilters,
  PeriodMetrics,
  QuickRange,
  SideFilter,
} from './types'

export {
  PERIOD_PRESET_LABEL,
  addDays,
  addMonths,
  calendarDatesInRange,
  daysBetween,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  isoDate,
  parseDate,
  rangeForPreset,
  rangeForQuick,
  rangeForSameMonthLastYear,
  rangeFromDates,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  type PeriodPreset,
} from './dateUtils'

export {
  applyFilters,
  distinctCatalysts,
  distinctMistakes,
  distinctPlaybooks,
  emptyFilters,
} from './filters'

export {
  calendarDayPnLMap,
  computeCumulativePnL,
  computeDailyPnL,
  computeDailyVolume,
  computeDailyWinRate,
  computePeriodMetrics,
  sortDates,
  tradesInRange,
  tradingDaysInPeriod,
} from './metrics'

export {
  alignByDayOfPeriod,
  buildHeadlineDeltas,
  computeBreakdownComparison,
  computePeriodComparison,
  generateComparisonInsights,
} from './comparison'
