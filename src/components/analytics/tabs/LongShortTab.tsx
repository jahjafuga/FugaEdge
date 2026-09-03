// LONG VS SHORT (beat 283, premium pass beat 287) -- the first cohort
// surface: the existing Overview engine once per side, long beside short with
// an explicit delta, both equity curves in one frame, and an identity
// sentence EARNED by sample size.
//
// NO FETCH AND NO FILTER BAR: the page already holds the full trade list and
// hands it down (Analytics.tsx fetches at mount); the side split IS this
// tab's one filter, applied through the same OverviewFilters machinery every
// other surface uses. Open positions are dropped exactly as Overview drops
// them, so the two tabs describe the same book.
//
// LEADERS ARE FACTS, NOT VERDICTS (beat 287). A dot and a tinted delta mark
// which side a row favours, polarity-aware, and they exist AT ALL only while
// both sides have earned them (showLeaders). Nothing in the grid or the
// heroes says "better" or "edge"; those words belong to the identity card,
// and only at its earned tiers. The delta's COLOUR names a side, never a
// sign: green and red stay P&L semantics and appear nowhere here.
import { useMemo } from 'react'
import Card from '@/components/ui/Card'
import SectionHeader from '@/components/ui/SectionHeader'
import DualEquityChart from '@/components/analytics/DualEquityChart'
import LowSampleBadge from '@/components/analytics/tabs/technicals/LowSampleBadge'
import { SIDE_COLORS } from '@/components/analytics/sideColors'
// The row tables and delta arms live in longShortRows.ts (beat 289) so this
// file exports ONLY the component and vite can fast-refresh it again.
import { ROWS, SECTIONS, type MetricRow } from '@/components/analytics/tabs/longShortRows'
import {
  computeDirectionComparison,
  leaderFor,
  showLeaders,
  IDENTITY_FLOOR_N,
  IDENTITY_RELIABLE_N,
  type SideStats,
} from '@/core/performance/direction'
import { LOW_SAMPLE_N } from '@/core/technicals/types'
import {
  DirectionWording as W,
  directionSentenceKey,
  fillDirection,
} from '@shared/direction-wording'
import { formatProfitFactor, money, int } from '@/lib/format'
import type { TradeListRow } from '@shared/trades-types'

/** The app's null cell, taken from the formatters rather than authored here. */
const NULL_CELL = formatProfitFactor(null)

/** THE ONE SUPPRESSION RULE heroes and grid share: an earned ratio is
 *  withheld on a lowSample side (the SS-C:104 convention), and EVERYTHING is
 *  withheld on an EMPTY side (beat 290) -- a side with no trades has no
 *  numbers, only the null cell. The single exception, the Trades row's zero,
 *  lives at the row level (key === 'trades'), not here. */
function withheldOn(s: SideStats, earned: boolean | undefined): boolean {
  return s.empty || Boolean(earned && s.lowSample)
}

interface LongShortTabProps {
  trades: TradeListRow[]
}

export default function LongShortTab({ trades }: LongShortTabProps) {
  // The Overview source exactly: open positions are dropped (OverviewTab:47).
  const closed = useMemo(() => trades.filter((t) => !t.is_open), [trades])
  const d = useMemo(() => computeDirectionComparison(closed), [closed])

  const tierLabel =
    d.read.tier === 'insufficient'
      ? W.tierInsufficient
      : d.read.tier === 'preliminary'
        ? W.tierPreliminary
        : W.tierReliable
  const leaders = showLeaders(d.long, d.short)
  // The heroes take gold from the SAME leaderFor call the grid makes -- one
  // rule, both surfaces -- computed once here and passed down.
  const heroLeaders = Object.fromEntries(
    HERO_STAT_KEYS.map((key) => {
      const row = ROWS.find((r) => r.key === key)!
      const lv = withheldOn(d.long, row.earned) ? null : row.value(d.long)
      const sv = withheldOn(d.short, row.earned) ? null : row.value(d.short)
      return [key, leaderFor(key, lv, sv, d.long, d.short)]
    }),
  ) as Record<(typeof HERO_STAT_KEYS)[number], 'long' | 'short' | null>
  // The headline number joins the same rule: gold when netPnL leads, by the
  // one leaderFor call, gated exactly as every other leader.
  const netRow = ROWS.find((r) => r.key === 'netPnL')!
  const netLeader = leaderFor(
    'netPnL',
    withheldOn(d.long, netRow.earned) ? null : netRow.value(d.long),
    withheldOn(d.short, netRow.earned) ? null : netRow.value(d.short),
    d.long,
    d.short,
  )

  return (
    <div className="space-y-6">
      <SectionHeader title={W.tabLabel} />

      {/* Card takes no data-* props (it spreads nothing), so the hook the
          tests and any future driver query lives on this inner div. */}
      <Card>
        <div data-direction-card>
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-sm bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
              {tierLabel}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-fg-secondary">
            {colourSideWord(
              identitySentence(d.long, d.short, d.read.tier, d.read.verdict),
              d.read.tier === 'insufficient' ? null : d.read.verdict,
            )}
          </p>
          {d.read.tier === 'insufficient' ? (
            <div className="mt-4 space-y-3">
              <FloorProgress side="long" stats={d.long} />
              <FloorProgress side="short" stats={d.short} />
            </div>
          ) : (
            d.long.band &&
            d.short.band && (
              <p className="mt-3 font-mono text-xs text-fg-tertiary">
                {fillDirection(W.bandLine, {
                  lLo: money(d.long.band.lo),
                  lHi: money(d.long.band.hi),
                  sLo: money(d.short.band.lo),
                  sHi: money(d.short.band.hi),
                })}
              </p>
            )
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HeroCard side="long" stats={d.long} leaders={heroLeaders} netLeader={netLeader} />
        <HeroCard side="short" stats={d.short} leaders={heroLeaders} netLeader={netLeader} />
      </div>

      <Card>
        <DualEquityChart curve={d.curve} hasLong={!d.long.empty} hasShort={!d.short.empty} />
      </Card>

      <Card>
        {!leaders && (
          <p className="mb-2 text-[11px] text-fg-muted">
            {fillDirection(W.leadersHidden, { n: LOW_SAMPLE_N })}
          </p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
              <th className="py-2 pr-3 font-semibold" />
              {/* beat 290: the side headers wear their side colours, the one
                  visual echo of the chart's legend. The DELTA header stays
                  plain: a difference has no side until a row earns a leader. */}
              <th className="py-2 pr-3" data-side="long" style={{ color: SIDE_COLORS.long }}>
                <span className="inline-flex items-center gap-1.5">
                  {W.colLong}
                  <LowSampleBadge n={d.long.lowSample ? d.long.n : 0} />
                </span>
              </th>
              <th className="py-2 pr-3" data-side="short" style={{ color: SIDE_COLORS.short }}>
                <span className="inline-flex items-center gap-1.5">
                  {W.colShort}
                  <LowSampleBadge n={d.short.lowSample ? d.short.n : 0} />
                </span>
              </th>
              <th className="py-2">{W.colDelta}</th>
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section) => (
              <SectionRows key={section.wordingKey} section={section} long={d.long} short={d.short} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ── The identity card's pieces ─────────────────────────────────────────────

/** One per-side bar toward the identity floor, on the house progress shape
 *  (GoalChallengeBand.tsx:326-331): an overflow-hidden track, a width-percent
 *  fill, here in the side's own colour and capped at 100%. */
function FloorProgress({ side, stats }: { side: 'long' | 'short'; stats: SideStats }) {
  const cleared = stats.n >= IDENTITY_FLOOR_N
  const pct = Math.min(100, (stats.n / IDENTITY_FLOOR_N) * 100)
  const label = cleared
    ? fillDirection(W.progressCleared, { n: stats.n })
    : fillDirection(W.progressLabel, { n: stats.n, N: IDENTITY_FLOOR_N })
  return (
    <div data-progress={side}>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-semibold" style={{ color: SIDE_COLORS[side] }}>
          {side === 'long' ? W.colLong : W.colShort}
        </span>
        <span className="text-fg-tertiary">{label}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-3">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: SIDE_COLORS[side] }}
        />
      </div>
    </div>
  )
}

/** The leading side's word, in its colour, everywhere it appears in the
 *  sentence; balanced or ungated sentences render plain. */
function colourSideWord(sentence: string, word: 'long' | 'short' | 'balanced' | null) {
  if (word !== 'long' && word !== 'short') return sentence
  const parts = sentence.split(new RegExp(`\\b(${word})\\b`, 'gi'))
  return parts.map((p, i) =>
    p.toLowerCase() === word ? (
      <span key={i} className="font-semibold" style={{ color: SIDE_COLORS[word] }}>
        {p}
      </span>
    ) : (
      p
    ),
  )
}

// ── The heroes ─────────────────────────────────────────────────────────────

/** The three hero stats reuse the GRID's own rows -- same fmt, same earned
 *  flag, same suppression function -- so the two surfaces cannot drift. */
/** Ross's triad (beat 289): rate, payoff, expectancy. Profit factor
 *  stays in the grid, one row below the ratio. */
const HERO_STAT_KEYS = ['winRate', 'plRatio', 'expectancy'] as const

function HeroCard({
  side,
  stats,
  leaders,
  netLeader,
}: {
  side: 'long' | 'short'
  stats: SideStats
  leaders: Record<(typeof HERO_STAT_KEYS)[number], 'long' | 'short' | null>
  netLeader: 'long' | 'short' | null
}) {
  const color = SIDE_COLORS[side]
  return (
    <Card>
      <div data-hero={side}>
        <div className="flex items-center justify-between gap-3">
          {/* The house chip shape (the tier chip's classes), colour swapped. */}
          <span
            className="inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            {side === 'long' ? W.colLong : W.colShort}
            <span className="font-mono">{int(stats.n)}</span>
            <LowSampleBadge n={stats.lowSample ? stats.n : 0} />
          </span>
          <span className="text-[10px] uppercase tracking-wider text-fg-muted">{W.heroNet}</span>
        </div>
        <div
          className={`mt-2 font-mono text-2xl font-semibold ${netLeader === side ? 'text-gold' : 'text-fg-primary'}`}
          data-hero-net
          {...(netLeader === side ? { 'data-leader-style': 'gold' } : {})}
        >
          {stats.empty ? NULL_CELL : money(stats.snapshot.metrics.netPnL)}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border-subtle/50 pt-2">
          {HERO_STAT_KEYS.map((key) => {
            const row = ROWS.find((r) => r.key === key)!
            const v = withheldOn(stats, row.earned) ? null : row.value(stats)
            return (
              <div key={key}>
                <div className="text-[10px] text-fg-muted">{W.rowLabels[key]}</div>
                <div
                  className={`font-mono text-sm ${leaders[key] === side ? 'font-semibold text-gold' : 'text-fg-primary'}`}
                  data-hero-stat={`${key}-${side}`}
                  {...(leaders[key] === side ? { 'data-leader-style': 'gold' } : {})}
                >
                  {v == null ? NULL_CELL : row.fmt(v)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ── The grid ───────────────────────────────────────────────────────────────

function SectionRows({
  section,
  long,
  short,
}: {
  section: (typeof SECTIONS)[number]
  long: SideStats
  short: SideStats
}) {
  return (
    <>
      <tr>
        <td
          colSpan={4}
          data-section
          className="pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-fg-muted"
        >
          {W[section.wordingKey]}
        </td>
      </tr>
      {section.keys.map((key) => {
        const row = ROWS.find((r) => r.key === key)!
        return <MetricRowView key={key} row={row} long={long} short={short} />
      })}
    </>
  )
}

function MetricRowView({ row, long, short }: { row: MetricRow; long: SideStats; short: SideStats }) {
  // The Trades row is the ruled exception: an empty side still counts 0.
  const lv = row.key === 'trades' ? row.value(long) : withheldOn(long, row.earned) ? null : row.value(long)
  const sv = row.key === 'trades' ? row.value(short) : withheldOn(short, row.earned) ? null : row.value(short)
  // A delta against an empty side is null for EVERY row, the Trades row
  // included: 28 minus nothing is not a difference worth printing.
  const delta =
    long.empty || short.empty ? null : lv != null && sv != null ? lv - sv : null
  const dFmt = row.deltaFmt ?? row.fmt
  // A FACT about the pair, or null: unearned samples, null values, ties and
  // no-polarity rows all render exactly as before the leaders existed.
  const leader = leaderFor(row.key, lv, sv, long, short)
  return (
    <tr className="border-b border-border-subtle/50 last:border-0">
      <td className="py-2 pr-3 text-fg-tertiary">{W.rowLabels[row.key]}</td>
      <SideCell
        cellKey={`${row.key}-long`}
        v={lv}
        fmt={row.fmt}
        sub={row.sub ? row.sub(long) : null}
        leader={leader === 'long' ? 'long' : null}
      />
      <SideCell
        cellKey={`${row.key}-short`}
        v={sv}
        fmt={row.fmt}
        sub={row.sub ? row.sub(short) : null}
        leader={leader === 'short' ? 'short' : null}
      />
      {/* THE DELTA IS NEVER COLOURED BY SIGN -- when it takes a colour at all,
          the colour NAMES THE LEADING SIDE, which is a different statement. */}
      <td
        className="py-2 font-mono text-fg-primary"
        data-cell={`${row.key}-delta`}
        {...(leader ? { 'data-leader-color': leader } : {})}
        style={leader ? { color: SIDE_COLORS[leader] } : undefined}
      >
        {delta == null ? NULL_CELL : dFmt(delta)}
      </td>
    </tr>
  )
}

function SideCell({
  cellKey,
  v,
  fmt,
  sub,
  leader,
}: {
  cellKey: string
  v: number | null
  fmt: (v: number) => string
  sub: string | null
  leader: 'long' | 'short' | null
}) {
  return (
    <td
      className="py-2 pr-3 font-mono text-fg-primary"
      data-cell={cellKey}
      {...(leader ? { 'data-leader': leader } : {})}
    >
      {/* The leader is a HIGHLIGHT, not a bullet (beat 288): the value takes
          the app's gold token -- the tier chip's and SectionHeader's own
          text-gold (LongShortTab:178, SectionHeader.tsx:18) -- semibold. */}
      {leader ? (
        <span data-leader-style="gold" className="font-semibold text-gold">
          {v == null ? NULL_CELL : fmt(v)}
        </span>
      ) : v == null ? (
        NULL_CELL
      ) : (
        fmt(v)
      )}
      {sub && <span className="ml-1.5 font-sans text-[10px] text-fg-muted">{sub}</span>}
    </td>
  )
}

/** The card's one sentence. The earned pairs go through the wording's own
 *  (tier, verdict) map; the insufficient tier is refined here from the counts
 *  this component alone holds: an EMPTY side gets noSideYet, ONE thin side
 *  gets oneSideThin, both thin gets bothThin. */
function identitySentence(
  long: SideStats,
  short: SideStats,
  tier: 'insufficient' | 'preliminary' | 'reliable',
  verdict: 'long' | 'short' | 'balanced' | null,
): string {
  const N = IDENTITY_FLOOR_N
  if (tier !== 'insufficient') {
    const key = directionSentenceKey(tier, verdict)
    return fillDirection(W[key] as string, { L: long.n, S: short.n, R: IDENTITY_RELIABLE_N })
  }
  if (long.empty && short.empty) {
    return fillDirection(W.bothThin, { L: 0, S: 0, N })
  }
  if (long.empty) return fillDirection(W.noSideYet, { side: 'long', N })
  if (short.empty) return fillDirection(W.noSideYet, { side: 'short', N })
  const longThin = long.n < N
  const shortThin = short.n < N
  if (longThin && shortThin) {
    return fillDirection(W.bothThin, { L: long.n, S: short.n, N })
  }
  const thin = longThin ? long : short
  return fillDirection(W.oneSideThin, { side: thin.side, n: thin.n, N })
}
