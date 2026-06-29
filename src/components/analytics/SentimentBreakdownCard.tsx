import Card from '@/components/ui/Card'
import { Info } from 'lucide-react'
import Tooltip from '@/components/ui/Tooltip'
import type { SentimentAnalytics } from '@shared/analytics-types'
import { int, money, percent, signed, pnlClass } from '@/lib/format'
import { SENTIMENT_ICONS } from '@/components/sentiment/SentimentIconPicker'

interface SentimentBreakdownCardProps {
  data: SentimentAnalytics
}

// "By Market Sentiment" breakdown. One row per sentiment level 1..5 plus
// an "Unrated" row for trades from days the user never tagged. Always
// emits all rows even at zero coverage so the layout is stable and the
// user sees what's missing.

export default function SentimentBreakdownCard({ data }: SentimentBreakdownCardProps) {
  const ratedPct =
    data.total_days > 0 ? (data.rated_days / data.total_days) * 100 : 0

  return (
    <Card
      title="By market sentiment"
      subtitle="Performance grouped by the per-day sentiment rating you set in Journal or Calendar."
      hover
      right={
        <Tooltip
          content={
            <>
              Sentiment is the trader's read on the day's market environment.
              5 = 3+ stocks running &gt;100% (best). 1 = 0 stocks &gt;50%
              (worst). Set it on the Journal page or by clicking the badge
              in a Calendar day cell.
            </>
          }
        >
          <Info size={14} strokeWidth={2} aria-hidden="true" className="cursor-help text-fg-tertiary" />
        </Tooltip>
      }
    >
      <div className="overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle/60 text-[10px] uppercase tracking-wider text-fg-tertiary">
              <th className="px-3 py-2 text-left font-semibold">Sentiment</th>
              <th className="px-3 py-2 text-right font-semibold">Trades</th>
              <th className="px-3 py-2 text-right font-semibold">Net P&amp;L</th>
              <th className="px-3 py-2 text-right font-semibold">Win rate</th>
              <th className="px-3 py-2 text-right font-semibold">Avg winner</th>
              <th className="px-3 py-2 text-right font-semibold">Avg loser</th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((b) => (
              <tr
                key={String(b.level)}
                className={`border-b border-border-subtle/40 last:border-b-0 ${
                  b.trade_count === 0 ? 'opacity-60' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    {b.level != null && (
                      <img
                        src={SENTIMENT_ICONS[b.level]}
                        alt=""
                        aria-hidden="true"
                        className="h-7 w-7 shrink-0"
                      />
                    )}
                    <span className="text-fg-primary">{stripLevelPrefix(b.label)}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-fg-primary tnum">
                  {int(b.trade_count)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono font-medium tnum ${
                    b.trade_count > 0 ? pnlClass(b.net_pnl) : 'text-fg-muted'
                  }`}
                >
                  {b.trade_count > 0 ? signed(b.net_pnl) : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono tnum">
                  {b.win_rate == null ? (
                    <span className="text-fg-muted">—</span>
                  ) : (
                    <span className="text-gold">
                      {percent(b.win_rate, 0)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tnum">
                  {b.avg_winner == null ? (
                    <span className="text-fg-muted">—</span>
                  ) : (
                    <span className="text-win">{money(b.avg_winner)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tnum">
                  {b.avg_loser == null ? (
                    <span className="text-fg-muted">—</span>
                  ) : (
                    <span className="text-loss">{money(b.avg_loser)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-baseline gap-3 text-[11px] text-fg-tertiary">
        <span className="uppercase tracking-wider">Coverage</span>
        <span className="font-mono text-fg-primary tnum">
          {int(data.rated_days)} / {int(data.total_days)} days rated
        </span>
        <span className="font-mono text-gold tnum">{ratedPct.toFixed(0)}%</span>
      </div>
    </Card>
  )
}

// Server sentiment labels are "5 — 3+ stocks >100%" (electron/analytics/get.ts).
// The icon now carries the digit, so drop a leading "<n> — " (em dash) prefix for
// display only — the server label data is untouched. "Unrated" has no prefix and
// passes through unchanged.
function stripLevelPrefix(label: string): string {
  return label.replace(/^\d+\s*—\s*/, '')
}
