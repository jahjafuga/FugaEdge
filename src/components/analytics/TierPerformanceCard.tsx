import { Fragment, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import Card from '@/components/ui/Card'
import TierBadge from '@/components/playbook/TierBadge'
import SystemTierChip from '@/components/playbook/SystemTierChip'
import AccordionPanel from '@/components/analytics/tabs/technicals/AccordionPanel'
import { useMultiBucketBand } from '@/components/analytics/tabs/technicals/useMultiBucketBand'
import { money, percent, signed, pnlClass, formatPnlRatio } from '@/lib/format'
import {
  aggregateTierPerformance,
  type TierPerformanceRow,
  type PlaybookPerfRow,
} from '@/core/playbook/tiers'
import { primaryState } from '@/core/playbook/primaryState'
import { computeOutcomeStats, type OutcomeStats } from '@/core/stats/outcomeStats'
import type { PlaybookTier } from '@shared/playbook-types'
import type { TradeListRow } from '@shared/trades-types'

interface TierPerformanceCardProps {
  trades: readonly TradeListRow[]
}

// The table is 7 columns wide (Tier · Setups · Trades · Win% · Net P&L ·
// Expectancy · P/L ratio); the expansion row spans all of them.
const TIER_COL_COUNT = 7

// Tier Performance — the headline insight view for v0.1.5. Proves (or
// disproves) whether A+ discipline actually pays. Pure render off the
// trade list joined with playbooks.tier from the IPC. Each tier row expands
// (djsevans87) into its per-playbook breakdown — same stats, grouped by the
// playbook inside the tier — reusing the Technicals inline-accordion machine.
export default function TierPerformanceCard({ trades }: TierPerformanceCardProps) {
  const rows = useMemo(() => aggregateTierPerformance(trades), [trades])

  // MULTI-open accordion (parent-owned). Tiers exist to be COMPARED — djsevans87 could not see
  // A+ and B at once, because single-open collapsed the first the moment he opened the second.
  // Any number of tiers stay open now, and each closing panel keeps its content mounted through
  // its OWN collapse (the per-key lag; see useMultiBucketBand).
  //
  // This deliberately does NOT use useBucketBand, and the v0.2.4 rule it enforces — "only one
  // expansion open per section at a time" — is untouched: the five Technicals sections still use
  // it, and each holds its own instance. AccordionPanel never enforced exclusivity; it takes a
  // plain `open` boolean per panel. So this is a local change, not a shared-behaviour change.
  const { isBucketOpen, isBucketDisplayed, onToggle } = useMultiBucketBand<PlaybookTier>()

  // Idea 3 — the gradeless No-Setup row, computed SEPARATELY from the tier
  // aggregation (whose null-tier skip would otherwise leak untagged trades).
  // primaryState isolates system-primary trades; computeOutcomeStats is the same
  // helper the tier rows use, so the numbers stay consistent by construction.
  const noSetup = useMemo(
    () => trades.filter((t) => primaryState(t) === 'no-setup'),
    [trades],
  )
  const noSetupStats = useMemo(() => computeOutcomeStats(noSetup), [noSetup])

  if (rows.length === 0) {
    return (
      <Card
        title="Tier performance"
        subtitle="Does A+ discipline pay? Tag a setup tier in the Setup Library to populate this."
      >
        <div className="rounded-md border border-border-subtle/40 bg-bg-1/40 p-4 text-sm text-fg-tertiary">
          No tier-tagged trades yet. Open Setup Library, set a tier on each
          playbook, then assign playbooks to your trades.
        </div>
      </Card>
    )
  }

  return (
    <Card
      title="Tier performance"
      subtitle="One row per setup tier with at least one tagged trade, A+ → A → B → C, plus a gradeless No-Setup row when present. Click a tier to break it down by playbook."
      padded={false}
    >
      <div className="overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle/60 text-[10px] uppercase tracking-wider text-fg-tertiary">
              <th className="px-3 py-2 text-left font-semibold">Tier</th>
              <th className="px-3 py-2 text-right font-semibold">Setups</th>
              <th className="px-3 py-2 text-right font-semibold">Trades</th>
              <th className="px-3 py-2 text-right font-semibold">Win %</th>
              <th className="px-3 py-2 text-right font-semibold">Net P&amp;L</th>
              <th className="px-3 py-2 text-right font-semibold">Expectancy</th>
              <th className="px-3 py-2 text-right font-semibold">P/L ratio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <TierRow
                key={r.tier}
                row={r}
                isOpen={isBucketOpen(r.tier)}
                isDisplayed={isBucketDisplayed(r.tier)}
                onToggle={() => onToggle(r.tier)}
              />
            ))}
            {noSetup.length > 0 && (
              <NoSetupRow count={noSetup.length} stats={noSetupStats} />
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function TierRow({
  row: r,
  isOpen,
  isDisplayed,
  onToggle,
}: {
  row: TierPerformanceRow
  isOpen: boolean
  isDisplayed: boolean
  onToggle: () => void
}) {
  // A real tier always has at least one playbook; the guard keeps the row inert
  // (no chevron, no toggle) for the degenerate no-playbook case so the accordion
  // never opens onto an empty panel.
  const expandable = r.playbooks.length > 0
  return (
    <Fragment>
      <tr
        className={`border-b border-border-subtle/40 transition-colors ${
          expandable ? 'cursor-pointer' : ''
        } ${
          isOpen
            ? 'bg-gold/[0.04]'
            : expandable
              ? 'hover:bg-fg-muted/[0.04]'
              : ''
        }`}
        onClick={expandable ? onToggle : undefined}
        onKeyDown={
          expandable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggle()
                }
              }
            : undefined
        }
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? isOpen : undefined}
      >
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            {expandable && (
              <ChevronRight
                aria-hidden
                size={14}
                strokeWidth={2}
                className={`shrink-0 text-fg-tertiary transition-transform duration-200 ${
                  isOpen ? 'rotate-90' : ''
                }`}
              />
            )}
            <TierBadge tier={r.tier} />
            <span className="text-[10px] text-fg-tertiary tnum">
              {r.winners}W / {r.losers}L
              {r.scratches > 0 ? ` / ${r.scratches}S` : ''}
            </span>
          </div>
        </td>
        <td className="px-3 py-2 text-right font-mono text-fg-secondary tnum">
          {r.setups}
        </td>
        <td className="px-3 py-2 text-right font-mono text-fg-primary tnum">
          {r.trades}
        </td>
        <td className="px-3 py-2 text-right font-mono tnum">
          {r.win_rate == null ? (
            <span className="text-fg-tertiary">—</span>
          ) : (
            <span className="text-gold">{percent(r.win_rate, 0)}</span>
          )}
        </td>
        <td
          className={`px-3 py-2 text-right font-mono font-medium tnum ${pnlClass(r.net_pnl)}`}
        >
          {signed(r.net_pnl)}
        </td>
        <td className="px-3 py-2 text-right font-mono tnum">
          {r.expectancy == null ? (
            <span className="text-fg-tertiary">—</span>
          ) : (
            <span className={pnlClass(r.expectancy)}>{money(r.expectancy)}/trade</span>
          )}
        </td>
        <td className="px-3 py-2 text-right font-mono tnum">
          {r.pnl_ratio == null ? (
            <span className="text-fg-tertiary">—</span>
          ) : (
            <span className="text-fg-primary">{formatPnlRatio(r.pnl_ratio)}</span>
          )}
        </td>
      </tr>
      {expandable && (
        <tr>
          <td colSpan={TIER_COL_COUNT} className="p-0">
            <AccordionPanel open={isOpen}>
              {isDisplayed && <PlaybookSubTable playbooks={r.playbooks} />}
            </AccordionPanel>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

// The nested per-playbook breakdown for one expanded tier. Same stat columns as
// the parent (minus Setups — a playbook IS one setup), indented and sub-styled.
// Uses the SAME formatters as the tier row, so the playbook rows reconcile with
// the tier total above them by inspection.
function PlaybookSubTable({ playbooks }: { playbooks: PlaybookPerfRow[] }) {
  return (
    <div className="bg-bg-1/40 px-3 pb-3">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-fg-tertiary">
            <th className="py-1.5 pl-7 pr-3 text-left font-semibold">Setup</th>
            <th className="px-3 py-1.5 text-right font-semibold">Trades</th>
            <th className="px-3 py-1.5 text-right font-semibold">Win %</th>
            <th className="px-3 py-1.5 text-right font-semibold">Net P&amp;L</th>
            <th className="px-3 py-1.5 text-right font-semibold">Expectancy</th>
            <th className="px-3 py-1.5 text-right font-semibold">P/L ratio</th>
          </tr>
        </thead>
        <tbody>
          {playbooks.map((p) => (
            <tr key={p.playbook_id} className="border-t border-border-subtle/30">
              <td className="py-1.5 pl-7 pr-3 text-left">
                <span className="text-fg-primary">{p.name}</span>
                <span className="ml-2 text-[10px] text-fg-tertiary tnum">
                  {p.winners}W / {p.losers}L
                  {p.scratches > 0 ? ` / ${p.scratches}S` : ''}
                </span>
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-fg-primary tnum">
                {p.trades}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tnum">
                {p.win_rate == null ? (
                  <span className="text-fg-tertiary">—</span>
                ) : (
                  <span className="text-gold">{percent(p.win_rate, 0)}</span>
                )}
              </td>
              <td
                className={`px-3 py-1.5 text-right font-mono font-medium tnum ${pnlClass(p.net_pnl)}`}
              >
                {signed(p.net_pnl)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tnum">
                {p.expectancy == null ? (
                  <span className="text-fg-tertiary">—</span>
                ) : (
                  <span className={pnlClass(p.expectancy)}>
                    {money(p.expectancy)}/trade
                  </span>
                )}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tnum">
                {p.pnl_ratio == null ? (
                  <span className="text-fg-tertiary">—</span>
                ) : (
                  <span className="text-fg-primary">{formatPnlRatio(p.pnl_ratio)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// The gradeless No-Setup companion row — demarcated (heavy top divider + a faint
// neutral wash + the grey N/A chip + a "not graded" label) so it reads as a
// completeness footnote, NOT a 5th grade and NOT part of the A+ → C ranking.
// Same columns/formatting as TierRow; the grade identity is muted (grey chip,
// dimmer count / P/L ratio) while the MONEY stays honest (pnlClass net, gold
// win%). Neutral throughout — a tally of trading without a setup, never a verdict.
// Setups is "—": these trades have no playbook, so a setup count is meaningless.
// Not expandable (no playbooks to break out).
function NoSetupRow({ count, stats }: { count: number; stats: OutcomeStats }) {
  return (
    <tr className="border-t-2 border-border-strong bg-fg-muted/[0.05]">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <SystemTierChip />
          <span className="text-[10px] text-fg-tertiary">not graded</span>
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-fg-tertiary tnum">—</td>
      <td className="px-3 py-2 text-right font-mono text-fg-secondary tnum">
        {count}
      </td>
      <td className="px-3 py-2 text-right font-mono tnum">
        {stats.win_rate == null ? (
          <span className="text-fg-tertiary">—</span>
        ) : (
          <span className="text-gold">{percent(stats.win_rate, 0)}</span>
        )}
      </td>
      <td
        className={`px-3 py-2 text-right font-mono font-medium tnum ${pnlClass(stats.net_pnl)}`}
      >
        {signed(stats.net_pnl)}
      </td>
      <td className="px-3 py-2 text-right font-mono tnum">
        {stats.expectancy == null ? (
          <span className="text-fg-tertiary">—</span>
        ) : (
          <span className={pnlClass(stats.expectancy)}>{money(stats.expectancy)}/trade</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tnum">
        {stats.pnl_ratio == null ? (
          <span className="text-fg-tertiary">—</span>
        ) : (
          <span className="text-fg-secondary">{formatPnlRatio(stats.pnl_ratio)}</span>
        )}
      </td>
    </tr>
  )
}
