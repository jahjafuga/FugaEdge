import { type LucideIcon, Star, Calendar, Tag, Sun, Scale, TrendingUp } from 'lucide-react'
import type { KpiStripData } from '@/core/insights/kpiStrip'
import { signed, percent, shortDate, pnlClass } from '@/lib/format'

// v0.2.5 EdgeIQ — the bottom KPI strip, styled to the dashboard mockup. Six
// premium "best-of" tiles fed by computeKpiStrip via useInsights (so they
// re-window in step with the hero cards — same window, consistent numbers).
//
// HIERARCHY (mockup): the MONEY is the hero. The IDENTITY (ticker / weekday /
// setup / session date) is a NEUTRAL white label above it — it's a name, not a
// gain, so it carries no green/red. The $ figure is the prominent number,
// colored by sign via the existing pnlClass; trade count + win% are the muted
// meta line. The two non-money tiles lead with their own hero figure instead:
// Reward:risk's ratio (green ≥1× / red <1×) and Expectancy's per-trade $.
//
// CALM + COHESIVE (founder option a, approved): plain `card-premium` surface,
// NO per-tile glow; one consistent gold icon-in-circle. Every tile is HONEST: a
// null field still renders a styled empty tile (icon + label + muted "—" +
// reason), never a fabricated leader.
//
// Styling only — the data shape, formatters, and meta copy are unchanged.

interface FilledBody {
  kind: 'filled'
  /** Neutral white label (ticker / weekday / setup / date). Omitted on the
   *  ratio + expectancy tiles, where the figure itself is the hero. */
  identity?: string
  /** The hero figure — the $ (or the R:R ratio), colored by `figureTone`. */
  figure: string
  figureTone: string
  /** Muted meta line below the figure. */
  detail: string
}
interface EmptyBody {
  kind: 'empty'
  empty: string
}
interface Tile {
  label: string
  Icon: LucideIcon
  body: FilledBody | EmptyBody
}

/** Muted meta for the best-of tiles — "13t · 62%" (the $ moved up to the hero). */
const meta = (b: { trades: number; winRate: number | null }) =>
  `${b.trades}t · ${percent(b.winRate, 0)}`

function expectancyDetail(e: { trades: number; rMultiple?: number }): string {
  const r = e.rMultiple
  const rPart = r === undefined ? '' : ` · ${r >= 0 ? '+' : ''}${r.toFixed(2)}R`
  return `per trade · ${e.trades}t${rPart}`
}

function tiles(d: KpiStripData): Tile[] {
  return [
    {
      label: 'Best symbol',
      Icon: Star,
      body: d.bestSymbol
        ? { kind: 'filled', identity: d.bestSymbol.symbol, figure: signed(d.bestSymbol.netPnl), figureTone: pnlClass(d.bestSymbol.netPnl), detail: meta(d.bestSymbol) }
        : { kind: 'empty', empty: 'Need 3+ trades on a symbol' },
    },
    {
      label: 'Best weekday',
      Icon: Calendar,
      body: d.bestWeekday
        ? { kind: 'filled', identity: d.bestWeekday.day, figure: signed(d.bestWeekday.netPnl), figureTone: pnlClass(d.bestWeekday.netPnl), detail: meta(d.bestWeekday) }
        : { kind: 'empty', empty: 'Need 5+ trades on a weekday' },
    },
    {
      label: 'Best setup',
      Icon: Tag,
      body: d.bestSetup
        ? { kind: 'filled', identity: d.bestSetup.playbook, figure: signed(d.bestSetup.netPnl), figureTone: pnlClass(d.bestSetup.netPnl), detail: meta(d.bestSetup) }
        : { kind: 'empty', empty: 'Tag setups to see this' },
    },
    {
      label: 'Best session',
      Icon: Sun,
      body: d.bestSession
        ? { kind: 'filled', identity: shortDate(d.bestSession.date), figure: signed(d.bestSession.netPnl), figureTone: pnlClass(d.bestSession.netPnl), detail: meta(d.bestSession) }
        : { kind: 'empty', empty: 'No sessions in range' },
    },
    {
      label: 'Reward : risk',
      Icon: Scale,
      body: d.payoffRatio
        ? {
            kind: 'filled',
            figure: `${d.payoffRatio.ratio.toFixed(2)}×`,
            figureTone: d.payoffRatio.ratio >= 1 ? 'text-win' : 'text-loss',
            detail: `avg ${signed(d.payoffRatio.avgWin)} / ${signed(d.payoffRatio.avgLoss)}`,
          }
        : { kind: 'empty', empty: 'Need wins and losses' },
    },
    {
      label: 'Expectancy',
      Icon: TrendingUp,
      body: d.expectancy
        ? { kind: 'filled', figure: signed(d.expectancy.dollars), figureTone: pnlClass(d.expectancy.dollars), detail: expectancyDetail(d.expectancy) }
        : { kind: 'empty', empty: 'No trades in range' },
    },
  ]
}

export default function EdgeStatStrip({ data, loading }: { data: KpiStripData; loading: boolean }) {
  return (
    <section aria-label="EdgeIQ key stats" className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Key stats</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[112px] rounded-2xl" />)
          : tiles(data).map((t) => <TileCard key={t.label} tile={t} />)}
      </div>
    </section>
  )
}

function TileCard({ tile }: { tile: Tile }) {
  const { label, Icon, body } = tile
  return (
    // One uniform, subtle gold glow on every tile — the SAME card-glow-gold the
    // Score/Radar cards use, so the strip lifts into the EdgeIQ band instead of
    // reading flat. Cohesive (one tone, brand gold) — not per-tile color.
    <div className="card-premium card-glow-gold p-4">
      {/* Icon-in-circle + label — one calm, consistent gold treatment across all
          six (founder-approved; unchanged). */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
          <Icon size={15} strokeWidth={2} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{label}</span>
      </div>

      {body.kind === 'filled' ? (
        <>
          {/* IDENTITY — neutral white label (a name, not a gain). */}
          {body.identity && (
            <div className="mt-3 truncate text-sm font-medium text-fg-primary" title={body.identity}>
              {body.identity}
            </div>
          )}
          {/* MONEY / ratio — the prominent hero figure, colored by sign. */}
          <div className={`${body.identity ? 'mt-0.5' : 'mt-3'} truncate font-mono text-xl font-bold tnum ${body.figureTone}`}>
            {body.figure}
          </div>
          {/* META — trade count + win% (or the avg-win/loss / R detail). */}
          <div className="mt-1 truncate font-mono text-[11px] text-fg-tertiary tnum">{body.detail}</div>
        </>
      ) : (
        <>
          <div className="mt-3 font-mono text-xl font-bold text-fg-muted">—</div>
          <div className="mt-1 text-[11px] text-fg-tertiary">{body.empty}</div>
        </>
      )}
    </div>
  )
}
