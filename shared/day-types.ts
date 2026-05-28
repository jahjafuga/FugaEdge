import type { TradeListRow } from './trades-types'

export interface DayMetrics {
  date: string                    // ISO YYYY-MM-DD
  dayOfWeek: string               // "Wednesday", etc. — derived from `date`
  grossPnl: number
  totalFees: number
  netPnl: number
  tradeCount: number
  winCount: number
  lossCount: number
  scratchCount: number
  // 0..1 ratio (winners / decided, scratches excluded) — matches existing
  // app convention used in electron/analytics/get.ts. UI multiplies by 100
  // for display. Null when no trades are decided (all scratches or empty day).
  winRate: number | null
  biggestWin: { symbol: string; pnl: number } | null
  worstLoss: { symbol: string; pnl: number } | null
  firstTradePnl: { symbol: string; pnl: number; rMultiple: number | null } | null
  avgRMultiple: number | null     // null when no trades have planned risk
  avgWin: number | null           // null when winCount = 0
  avgLoss: number | null          // null when lossCount = 0
  sessionFirstTradeTime: string | null   // HH:MM, null when tradeCount = 0
  sessionLastTradeTime: string | null    // HH:MM, null when tradeCount = 0
  symbolsTraded: string[]
  topThreeSymbols: { symbol: string; tradeCount: number }[]
  totalShares: number
  totalDollarVolume: number
  mostUsedPlaybook: { playbook: string; tradeCount: number; winRate: number | null } | null
  // Day-scoped derivation of Deep Analytics → Execution's "money left on table"
  // (sum of per-trade ExitDelta.delta). Null when no trades on the day have MFE data.
  moneyLeftOnTable: number | null
  moneyLeftCoverage: { withMfe: number; total: number } | null
}

export interface DayDetail {
  date: string
  metrics: DayMetrics
  trades: TradeListRow[]
  // Day-level notes and mistakes ship in Day 4; placeholders here so the
  // shape is stable across the v0.2.2 build sequence.
  note: string | null
  dayMistakes: string[]
}
