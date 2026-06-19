import { useMemo } from 'react'
import Card from '@/components/ui/Card'
import { money, percent, signed, pnlClass } from '@/lib/format'
import {
  computeSignalBuckets,
  type SignalBucketRow,
} from '@/core/playbook/signalBuckets'
import type { TradeListRow } from '@shared/trades-types'

interface ConfluencePerformanceCardProps {
  trades: readonly TradeListRow[]
}

// signalCount per trade: a non-system primary setup counts as 1 signal, plus
// each secondary confluence tag (secondary_tag_count). Route-A inference — a
// non-system primary always carries a real tier, so `playbook_tier != null`
// distinguishes it from the system "No Setup" primary (Route A nulls that
// tier). This is the pre-classification the pure bucketer is handed; the
// bucketer itself knows nothing about tiers / is_system.
function signalCount(t: TradeListRow): number {
  const primary = t.playbook_id != null && t.playbook_tier != null ? 1 : 0
  return primary + t.secondary_tag_count
}

// A No-Setup primary: a playbook IS assigned (playbook_id) but Route A nulled
// its tier because it's the system "No Setup" playbook. These feed the cost
// line — the honest tally of trades taken without a setup, never a verdict.
function isSystemPrimary(t: TradeListRow): boolean {
  return t.playbook_id != null && t.playbook_tier == null
}

// Confluence performance — does stacking more signals pay? Buckets trades by
// signal count (1 / 2 / 3+) and shows the Convention-A stats per bucket, with a
// neutral No-Setup cost line beside them. All-time (Analytics is unfiltered).
export default function ConfluencePerformanceCard({
  trades,
}: ConfluencePerformanceCardProps) {
  const { buckets, signalledTotal, noSetupCount, noSetupNet } = useMemo(() => {
    const buckets = computeSignalBuckets(
      trades.map((t) => ({ net_pnl: t.net_pnl, signalCount: signalCount(t) })),
    )
    const signalledTotal = buckets.reduce((n, b) => n + b.count, 0)
    const noSetup = trades.filter(isSystemPrimary)
    const noSetupNet = noSetup.reduce((s, t) => s + t.net_pnl, 0)
    return {
      buckets,
      signalledTotal,
      noSetupCount: noSetup.length,
      noSetupNet,
    }
  }, [trades])

  if (signalledTotal === 0 && noSetupCount === 0) {
    return (
      <Card
        title="Confluence"
        subtitle="Does stacking more signals pay off?"
      >
        <div className="rounded-md border border-border-subtle/40 bg-bg-1/40 p-4 text-sm text-fg-tertiary">
          No confluence-tagged trades yet. Assign a setup and add confluence
          signals in the trade detail to see whether more signals pays.
        </div>
      </Card>
    )
  }

  return (
    <Card
      title="Confluence"
      subtitle="Does stacking more signals pay off? Primary setup plus confluence tags, all-time."
      padded={false}
    >
      {signalledTotal > 0 ? (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle/60 text-[10px] uppercase tracking-wider text-fg-tertiary">
                <th className="px-3 py-2 text-left font-semibold">Signals</th>
                <th className="px-3 py-2 text-right font-semibold">Trades</th>
                <th className="px-3 py-2 text-right font-semibold">Win %</th>
                <th className="px-3 py-2 text-right font-semibold">Net P&amp;L</th>
                <th className="px-3 py-2 text-right font-semibold">Expectancy</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <BucketRow key={b.bucket} row={b} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-3 py-3 text-sm text-fg-tertiary">
          No multi-signal trades tagged yet.
        </div>
      )}

      {noSetupCount > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle/60 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
              Taken without a setup
            </span>
            <span className="tnum text-[10px] text-fg-tertiary">
              {noSetupCount} {noSetupCount === 1 ? 'trade' : 'trades'}
            </span>
          </div>
          <span
            className={`tnum font-mono text-sm font-medium ${pnlClass(noSetupNet)}`}
          >
            {signed(noSetupNet)}
          </span>
        </div>
      )}
    </Card>
  )
}

function BucketRow({ row: b }: { row: SignalBucketRow }) {
  const label =
    b.bucket === '1' ? '1 signal' : b.bucket === '2' ? '2 signals' : '3+ signals'
  const empty = b.count === 0
  return (
    <tr className="border-b border-border-subtle/40 last:border-b-0">
      <td className="px-3 py-2">
        <span className={empty ? 'text-fg-tertiary' : 'text-fg-primary'}>
          {label}
        </span>
      </td>
      <td className="tnum px-3 py-2 text-right font-mono text-fg-primary">
        {b.count}
      </td>
      <td className="tnum px-3 py-2 text-right font-mono">
        {b.win_rate == null ? (
          <span className="text-fg-tertiary">—</span>
        ) : (
          <span className="text-gold">{percent(b.win_rate, 0)}</span>
        )}
      </td>
      <td
        className={`tnum px-3 py-2 text-right font-mono font-medium ${
          empty ? 'text-fg-tertiary' : pnlClass(b.net_pnl)
        }`}
      >
        {empty ? '—' : signed(b.net_pnl)}
      </td>
      <td className="tnum px-3 py-2 text-right font-mono">
        {b.expectancy == null ? (
          <span className="text-fg-tertiary">—</span>
        ) : (
          <span className={pnlClass(b.expectancy)}>
            {money(b.expectancy)}/trade
          </span>
        )}
      </td>
    </tr>
  )
}
