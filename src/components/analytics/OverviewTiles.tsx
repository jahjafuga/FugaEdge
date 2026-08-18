import { money, int, percent, signed, pnlClass } from '@/lib/format'
import type { PeriodMetrics } from '@/core/performance/types'

// v0.2.7 Feature 1 — the Overview's twelve headline tiles.
//
// PRESENTATION ONLY. Every figure and every denominator below already exists on
// PeriodMetrics; nothing here computes a statistic. The one derived value, P&L Ratio,
// is PeriodMetrics.winLossRatio, which was already there.
//
// THE GUARD, and why it is keyed to each metric's OWN denominator. A ratio over a
// handful of trades is not a small truth — it is noise wearing a percentage sign. But
// the relevant sample differs per tile: a 200-trade book with 3 losers has a perfectly
// solid win rate and a meaningless average loser. So the floor is applied to the
// denominator that actually feeds the number, never to the trade count.
//
// Three states, deliberately distinct:
//   NONE  the denominator is 0 — no value EXISTS. Not "thin", and emphatically not 0.
//   THIN  0 < denominator < floor — the value is shown, muted, never bare.
//   OK    at or above the floor.
// The denominator is visible in ALL THREE, the way Win Rate already read "415 W / 598 L".
// Absolute money and counts are never guarded: filtering to two trades must still tell
// the honest truth about what those two trades did.

/** Minimum denominator before a ratio is presented without a caveat. */
export const RATIO_MIN_SAMPLE = 20

type GuardState = 'absolute' | 'none' | 'thin' | 'ok'

function guardFor(denominators: number[]): GuardState {
  // Every side must clear on its own — P&L Ratio needs winners AND losers, and a
  // guard that checks only one of them is half a guard.
  if (denominators.some((d) => d <= 0)) return 'none'
  return denominators.every((d) => d >= RATIO_MIN_SAMPLE) ? 'ok' : 'thin'
}

function Tile({
  id,
  label,
  value,
  state,
  denominator,
  tone,
}: {
  id: string
  label: string
  value: string
  state: GuardState
  denominator?: string
  tone?: string
}) {
  const muted = state === 'thin' || state === 'none'
  return (
    <div
      data-testid={`tile-${id}`}
      data-state={state}
      className={`rounded-md border bg-bg-1 p-3 ${
        state === 'thin' ? 'border-dashed border-border-subtle' : 'border-border-subtle'
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {label}
      </div>
      <div
        data-testid="tile-value"
        className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
          muted ? 'text-fg-tertiary' : (tone ?? 'text-fg-primary')
        }`}
      >
        {value}
      </div>
      {denominator !== undefined && (
        <div
          data-testid="tile-den"
          className="mt-1.5 font-mono text-[10px] text-fg-tertiary tnum"
        >
          {state === 'thin' ? `${denominator} · thin sample` : denominator}
        </div>
      )}
    </div>
  )
}

export default function OverviewTiles({ metrics: m }: { metrics: PeriodMetrics }) {
  const decided = m.winners + m.losers
  const dash = '—'

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Tile id="net" label="Net P&L" state="absolute" value={signed(m.netPnL)} tone={pnlClass(m.netPnL)} />
      <Tile id="gross" label="Gross P&L" state="absolute" value={signed(m.grossPnL)} tone={pnlClass(m.grossPnL)} />
      <Tile id="fees" label="Total fees" state="absolute" value={money(m.fees)} />
      <Tile id="count" label="Trade count" state="absolute" value={int(m.trades)} />

      <Tile
        id="winrate" label="Win rate" state={guardFor([decided])}
        value={m.winRate == null ? dash : percent(m.winRate, 0)}
        denominator={`${m.winners} W / ${m.losers} L`}
      />
      <Tile
        id="plratio" label="P&L ratio" state={guardFor([m.winners, m.losers])}
        value={m.winLossRatio == null ? dash : m.winLossRatio.toFixed(2)}
        denominator={`${m.winners} W / ${m.losers} L`}
      />
      <Tile
        id="avgwin" label="Avg winner" state={guardFor([m.winners])}
        value={m.avgWinner == null ? dash : signed(m.avgWinner)}
        tone="text-win" denominator={`${m.winners} winners`}
      />
      <Tile
        id="avgloss" label="Avg loser" state={guardFor([m.losers])}
        value={m.avgLoser == null ? dash : signed(m.avgLoser)}
        tone="text-loss" denominator={`${m.losers} losers`}
      />

      <Tile
        id="largestwin" label="Largest winner" state="absolute"
        value={m.largestWinner == null ? dash : signed(m.largestWinner)} tone="text-win"
      />
      <Tile
        id="largestloss" label="Largest loser" state="absolute"
        value={m.largestLoser == null ? dash : signed(m.largestLoser)} tone="text-loss"
      />
      <Tile
        id="expectancy" label="Expectancy (R)" state={guardFor([m.rCoverage])}
        value={m.expectancyR == null ? dash : `${m.expectancyR.toFixed(2)}R`}
        denominator={`${m.rCoverage} with R`}
      />
      <Tile
        id="profitfactor" label="Profit factor" state={guardFor([decided])}
        value={m.profitFactor == null ? dash : m.profitFactor.toFixed(2)}
        denominator={`${m.winners} W / ${m.losers} L`}
      />
    </div>
  )
}
