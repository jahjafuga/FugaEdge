// Shared equity-curve + drawdown utilities. The implementation moved to
// src/core/performance/equity.ts (a pure module the renderer can also use for
// the per-period Compare K-Ratio). This file is now a re-export shim so any
// importer of '../lib/equity' keeps working unchanged.
export {
  buildEquityCurve,
  computeDrawdown,
  type DrawdownEquityPoint,
  type DrawdownInfo,
  type EquityPoint,
} from '@/core/performance/equity'
