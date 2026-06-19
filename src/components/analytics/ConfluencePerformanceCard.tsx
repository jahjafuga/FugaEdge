import { useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import { money, percent, signed, pnlClass } from '@/lib/format'
import { computeSignalBuckets } from '@/core/playbook/signalBuckets'
import { computeOutcomeStats } from '@/core/stats/outcomeStats'
import { primaryState } from '@/core/playbook/primaryState'
import type { TradeListRow } from '@shared/trades-types'

interface ConfluencePerformanceCardProps {
  trades: readonly TradeListRow[]
}

type Mode = 'with-vs-without' | 'by-signal'

// signalCount per trade: a graded (non-system) primary counts as 1 signal, plus
// each secondary confluence tag. Reuses primaryState's Route-A classification so
// MODE 1 and MODE 2 derive "is there a real primary" the same way. Drives the
// signal-count buckets (MODE 2).
function signalCount(t: TradeListRow): number {
  const primary = primaryState(t) === 'graded' ? 1 : 0
  return primary + t.secondary_tag_count
}

// One stat row, shared by both modes so their columns line up exactly:
// Trades · Win% · Net P&L · Expectancy.
interface StatRowData {
  id: string
  label: string
  count: number
  win_rate: number | null
  net_pnl: number
  expectancy: number | null
}

const MODES: readonly { key: Mode; label: string }[] = [
  { key: 'with-vs-without', label: 'With vs Without' },
  { key: 'by-signal', label: 'By signal count' },
]

// Confluence performance — two lenses on the same trades, switched by a
// segmented toggle. MODE 1 "With a setup vs No setup" compares the edge of a
// graded primary against a deliberate No-Setup primary (untagged trades
// excluded); MODE 2 "By signal count" buckets by total signals (primary plus
// confluence tags). All-time (Analytics is unfiltered). Neutral framing
// throughout — honest numbers, never a verdict.
export default function ConfluencePerformanceCard({
  trades,
}: ConfluencePerformanceCardProps) {
  const [mode, setMode] = useState<Mode>('with-vs-without')

  // MODE 1 — partition primaries into graded / no-setup (drop untagged), then
  // the Convention-A stats per subset.
  const compareRows = useMemo<StatRowData[]>(() => {
    const graded: { net_pnl: number }[] = []
    const noSetup: { net_pnl: number }[] = []
    for (const t of trades) {
      const st = primaryState(t)
      if (st === 'graded') graded.push(t)
      else if (st === 'no-setup') noSetup.push(t)
      // 'untagged' → excluded (Option A; mirrors the signal-count buckets)
    }
    const toRow = (
      id: string,
      label: string,
      subset: { net_pnl: number }[],
    ): StatRowData => {
      const s = computeOutcomeStats(subset)
      return {
        id,
        label,
        count: subset.length,
        win_rate: s.win_rate,
        net_pnl: s.net_pnl,
        expectancy: s.expectancy,
      }
    }
    return [
      toRow('graded', 'With a setup', graded),
      toRow('no-setup', 'No setup', noSetup),
    ]
  }, [trades])

  // MODE 2 — the existing 1 / 2 / 3+ signal-count buckets.
  const signalRows = useMemo<StatRowData[]>(() => {
    const label = (k: string) =>
      k === '1' ? '1 signal' : k === '2' ? '2 signals' : '3+ signals'
    return computeSignalBuckets(
      trades.map((t) => ({ net_pnl: t.net_pnl, signalCount: signalCount(t) })),
    ).map((b) => ({
      id: b.bucket,
      label: label(b.bucket),
      count: b.count,
      win_rate: b.win_rate,
      net_pnl: b.net_pnl,
      expectancy: b.expectancy,
    }))
  }, [trades])

  const comparedTotal = compareRows.reduce((n, r) => n + r.count, 0)
  const signalledTotal = signalRows.reduce((n, r) => n + r.count, 0)

  const subtitle =
    mode === 'with-vs-without'
      ? 'Does following a setup pay off?'
      : 'Does stacking signals pay off?'

  const toggle = (
    <div
      role="tablist"
      aria-label="Confluence view"
      className="inline-flex items-center rounded-md border border-border-subtle bg-bg-2 p-0.5"
    >
      {MODES.map((m) => {
        const active = mode === m.key
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setMode(m.key)}
            className={`cursor-pointer rounded-[6px] px-3 py-1 text-[11px] font-semibold tracking-wider transition-colors duration-150 ease-out-soft ${
              active
                ? 'bg-gold text-accent-ink'
                : 'text-fg-tertiary hover:bg-bg-3 hover:text-fg-primary'
            }`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <Card title="Confluence" subtitle={subtitle} right={toggle} padded={false}>
      {mode === 'with-vs-without' ? (
        comparedTotal > 0 ? (
          <StatTable firstCol="Setup" rows={compareRows} />
        ) : (
          <div className="px-4 py-5 text-sm text-fg-tertiary">
            No setup-tagged trades yet. Assign a setup — or No Setup — on your
            trades to compare your edge with a plan versus without.
          </div>
        )
      ) : signalledTotal > 0 ? (
        <StatTable firstCol="Signals" rows={signalRows} />
      ) : (
        <div className="px-3 py-3 text-sm text-fg-tertiary">
          No multi-signal trades tagged yet.
        </div>
      )}
    </Card>
  )
}

function StatTable({ firstCol, rows }: { firstCol: string; rows: StatRowData[] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-subtle/60 text-[10px] uppercase tracking-wider text-fg-tertiary">
            <th className="px-3 py-2 text-left font-semibold">{firstCol}</th>
            <th className="px-3 py-2 text-right font-semibold">Trades</th>
            <th className="px-3 py-2 text-right font-semibold">Win %</th>
            <th className="px-3 py-2 text-right font-semibold">Net P&amp;L</th>
            <th className="px-3 py-2 text-right font-semibold">Expectancy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <StatRow key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatRow({ row: r }: { row: StatRowData }) {
  const empty = r.count === 0
  return (
    <tr className="border-b border-border-subtle/40 last:border-b-0">
      <td className="px-3 py-2">
        <span className={empty ? 'text-fg-tertiary' : 'text-fg-primary'}>
          {r.label}
        </span>
      </td>
      <td className="tnum px-3 py-2 text-right font-mono text-fg-primary">
        {r.count}
      </td>
      <td className="tnum px-3 py-2 text-right font-mono">
        {r.win_rate == null ? (
          <span className="text-fg-tertiary">—</span>
        ) : (
          <span className="text-gold">{percent(r.win_rate, 0)}</span>
        )}
      </td>
      <td
        className={`tnum px-3 py-2 text-right font-mono font-medium ${
          empty ? 'text-fg-tertiary' : pnlClass(r.net_pnl)
        }`}
      >
        {empty ? '—' : signed(r.net_pnl)}
      </td>
      <td className="tnum px-3 py-2 text-right font-mono">
        {r.expectancy == null ? (
          <span className="text-fg-tertiary">—</span>
        ) : (
          <span className={pnlClass(r.expectancy)}>
            {money(r.expectancy)}/trade
          </span>
        )}
      </td>
    </tr>
  )
}
