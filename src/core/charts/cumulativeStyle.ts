// Shared Recharts curve `type` for cumulative / equity series. A step-after
// curve keeps the line flat across no-trade days and steps only on the
// trading day that produced new P&L — diagonal interpolation between sparse
// trade days reads as if you bled money on flat days, which is wrong.
export const CUMULATIVE_LINE_TYPE = 'stepAfter' as const
export type CumulativeLineType = typeof CUMULATIVE_LINE_TYPE
