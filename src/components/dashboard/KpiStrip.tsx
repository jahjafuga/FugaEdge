import type { OverviewStats } from '@shared/dashboard-types'
import { formatPnlRatio } from '@/lib/format'
import StatStrip, {
  type Kpi,
  intCount,
  moneyOrDash,
  pctOrDash,
  signedOrDash,
} from '@/components/ui/StatStrip'

interface KpiStripProps {
  overview: OverviewStats
}

// Dashboard KPI strip — builds the 10-card list and renders the shared
// StatStrip. Card 6 is P&L Ratio (avg win ÷ |avg loss|), not Profit Factor.
export default function KpiStrip({ overview }: KpiStripProps) {
  const items: Kpi[] = [
    { label: 'Net P&L',         value: overview.net_pnl,        format: signedOrDash,  tone: 'auto' },
    { label: 'Gross P&L',       value: overview.gross_pnl,      format: signedOrDash,  tone: 'auto' },
    { label: 'Total fees',      value: overview.total_fees,     format: moneyOrDash,   tone: 'red' },
    { label: 'Trade count',     value: overview.trade_count,    format: intCount,      tone: 'neutral' },
    { label: 'Win rate',        value: overview.win_rate,       format: pctOrDash,     tone: 'gold' },
    { label: 'P&L ratio',       value: overview.pnl_ratio,      format: formatPnlRatio, tone: 'gold' },
    { label: 'Avg winner',      value: overview.avg_winner,     format: moneyOrDash,   tone: 'green' },
    { label: 'Avg loser',       value: overview.avg_loser,      format: moneyOrDash,   tone: 'red' },
    { label: 'Largest winner',  value: overview.largest_winner, format: moneyOrDash,   tone: 'green' },
    { label: 'Largest loser',   value: overview.largest_loser,  format: moneyOrDash,   tone: 'red' },
  ]

  return <StatStrip items={items} />
}
