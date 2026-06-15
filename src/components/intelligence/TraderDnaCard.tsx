import { Dna } from 'lucide-react'
import type { DnaAdherence } from '@/core/dna/adherence'
import { signed, percent, pnlClass } from '@/lib/format'

// v0.2.5 EdgeIQ Trader DNA — Beat 5 (chunk 5/5). The PRESENTATIONAL card that
// displays computeDnaAdherence's output (chunk 4) on /intelligence — the
// selection-discipline identity card, peer to the Edge Score. Pattern A: it
// takes the already-computed DnaAdherence as a prop (the page composes it from
// useInsights' windowedTrades + useDnaConfig) and does nothing beyond
// display-level division (avg-per-trade, fit-all rate, segment widths). Zero
// IPC, zero compute, type-only DnaAdherence import.
//
// THESIS (the hero): when you traded YOUR setup vs when you didn't — the
// avg-P&L-per-trade contrast, framed honestly over only the trades it can fully
// judge (the 4 numeric pillars present). The honesty contract from chunk 4 is
// carried verbatim into the UI:
//   - the fit/broke comparison excludes the `incomplete` bucket, and the bar
//     ALWAYS shows incomplete as its own segment + count (never folded/hidden);
//   - catalyst is coverage, not a 5th pass/fail pillar — a neutral strip, shown
//     only when require_catalyst;
//   - per-pillar pass rate (passed/n) and data coverage (n/total) are DIFFERENT
//     numbers, both surfaced; pct null (n=0) → "—", never 0% / NaN;
//   - too-few or per-side-thin samples are flagged, never dressed up.

/** Hide the whole hero below this many judgeable (complete-data) trades. */
const MIN_JUDGEABLE = 5
/** A side with 1..(this-1) trades is real but thin — flag it, don't dress it up. */
const LOW_SAMPLE = 5

interface TraderDnaCardProps {
  data: DnaAdherence | null
  loading: boolean
  requireCatalyst: boolean
  rangeLabel: string
}

export default function TraderDnaCard({
  data,
  loading,
  requireCatalyst,
  rangeLabel,
}: TraderDnaCardProps) {
  const judgeable = data ? data.buckets.fitAll + data.buckets.brokeAny : 0

  return (
    <section
      aria-label="Trader DNA"
      className="card-premium card-glow-purple relative overflow-hidden p-5"
    >
      {/* Ornamental helix — oversized + faint, purely decorative (the HeroCards
          Shell pattern). Encodes no data; do NOT replace with the 1-5.svg
          sentiment assets. */}
      <Dna
        size={104}
        strokeWidth={1.5}
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-4 -right-3 opacity-[0.08] text-violet"
      />

      <div className="relative z-10">
        {/* (1) HEADER — always rendered, even while loading / suppressed. */}
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Dna size={13} strokeWidth={2.25} aria-hidden="true" className="text-violet" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
              Trader DNA
            </h2>
          </div>
          {data && !loading && (
            <span className="font-mono text-[10px] text-fg-muted tnum">
              n = {data.buckets.total} · {rangeLabel}
            </span>
          )}
        </div>

        {loading || data === null ? (
          // Don't assert "not enough trades" while data is still inflight — that
          // would state a fact we haven't established. Skeleton until we know
          // (mirrors ScoreCard's own loading branch).
          <div className="skeleton mt-4 h-[180px]" />
        ) : judgeable < MIN_JUDGEABLE ? (
          <div className="mt-4 rounded-md border border-dashed border-border-subtle bg-bg-1 p-6 text-center text-sm text-fg-secondary">
            Not enough fully-tagged trades to read your DNA yet — needs at least 5.
          </div>
        ) : (
          <DnaBody data={data} requireCatalyst={requireCatalyst} />
        )}
      </div>
    </section>
  )
}

function DnaBody({ data, requireCatalyst }: { data: DnaAdherence; requireCatalyst: boolean }) {
  const { pnl, buckets, perPillar, catalystCoverage } = data
  const judgeable = buckets.fitAll + buckets.brokeAny
  const fitAllRate = judgeable > 0 ? buckets.fitAll / judgeable : null

  return (
    <div className="mt-4 space-y-5">
      {/* (2) HERO — the fit-vs-broke avg-P&L contrast. The framing line makes
          clear this excludes the incomplete bucket. The contrast IS the message
          — never collapsed into one "edge gap" number. */}
      <div>
        <div className="text-xs text-fg-tertiary">of the trades I can fully judge</div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SidePanel label="When you fit your DNA" agg={pnl.fitAll} glow="card-glow-green" />
          <SidePanel label="When you broke it" agg={pnl.brokeAny} glow="card-glow-red" />
        </div>
      </div>

      {/* (3) SETUP ADHERENCE (supporting) — fit-all rate among judgeable trades,
          then the honest 3-segment split (incomplete always its own segment). */}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Setup adherence
          </span>
          <span className="font-mono text-sm font-semibold text-violet tnum">
            {percent(fitAllRate, 0)}
          </span>
        </div>
        <BucketBar buckets={buckets} />
      </div>

      {/* (4) PER-PILLAR ROW — pass rate (passed/n) as the figure, coverage (n of
          total with data) as the badge below. Two different numbers. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PillarCell label="Price" stat={perPillar.price} total={buckets.total} />
        <PillarCell label="Day change" stat={perPillar.change} total={buckets.total} />
        <PillarCell label="RVOL" stat={perPillar.rvol} total={buckets.total} />
        <PillarCell label="Float" stat={perPillar.float} total={buckets.total} />
      </div>

      {/* (5) CATALYST STRIP — coverage signal, NOT a pass/fail pillar. Neutral
          violet (no green/red), and only when the profile requires a catalyst. */}
      {requireCatalyst && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-accent-violet/25 bg-accent-violet/[0.05] px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-violet/85">
            Catalyst coverage
          </span>
          <span className="font-mono text-[11px] text-fg-secondary tnum">
            tagged on {catalystCoverage.tagged} of {catalystCoverage.total} ·{' '}
            {percent(catalystCoverage.pct, 0)}
          </span>
        </div>
      )}
    </div>
  )
}

/** One hero side — avg P&L per trade (display-level division), win%, n. A true
 *  zero (no trades) reads "—" with a "no trades" note (NOT a low-sample chip);
 *  a thin 1..4-trade side gets the violet "small sample" chip. */
function SidePanel({
  label,
  agg,
  glow,
}: {
  label: string
  agg: DnaAdherence['pnl']['fitAll']
  glow: string
}) {
  const n = agg.trade_count
  const isZero = n === 0
  const lowSample = n >= 1 && n < LOW_SAMPLE
  const avg = isZero ? null : agg.net_pnl / n

  return (
    <div className={`rounded-md border bg-bg-1 p-4 ${glow}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          {label}
        </span>
        {lowSample && (
          <span className="shrink-0 rounded-md border border-accent-violet/40 bg-accent-violet/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet">
            small sample
          </span>
        )}
      </div>
      {isZero ? (
        <>
          <div className="mt-2 font-mono text-4xl font-semibold leading-none tabular-nums text-fg-muted">
            —
          </div>
          <div className="mt-2 text-[11px] text-fg-muted">no trades</div>
        </>
      ) : (
        <>
          <div
            className={`mt-2 font-mono text-4xl font-semibold leading-none tabular-nums ${pnlClass(avg!)}`}
          >
            {signed(avg!)}
          </div>
          <div className="mt-2 font-mono text-[11px] text-fg-tertiary tnum">
            {percent(agg.win_rate, 0)} win · {n} {n === 1 ? 'trade' : 'trades'}
          </div>
        </>
      )}
    </div>
  )
}

/** The honest 3-segment proportional split — fit (win tone), broke (loss tone),
 *  incomplete (muted neutral). Widths are each bucket / total. Incomplete is
 *  always its own segment AND its own legend count — never folded. */
function BucketBar({ buckets }: { buckets: DnaAdherence['buckets'] }) {
  const { fitAll, brokeAny, incomplete, total } = buckets
  const w = (x: number) => (total > 0 ? `${(x / total) * 100}%` : '0%')
  return (
    <>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-sm bg-bg-3">
        <div className="h-full bg-win/70" style={{ width: w(fitAll) }} />
        <div className="h-full bg-loss/70" style={{ width: w(brokeAny) }} />
        <div className="h-full bg-fg-muted/30" style={{ width: w(incomplete) }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-fg-tertiary tnum">
        <LegendDot dotClass="bg-win/70" label="Fit" count={fitAll} />
        <LegendDot dotClass="bg-loss/70" label="Broke" count={brokeAny} />
        <LegendDot dotClass="bg-fg-muted/30" label="Incomplete" count={incomplete} />
      </div>
    </>
  )
}

function LegendDot({
  dotClass,
  label,
  count,
}: {
  dotClass: string
  label: string
  count: number
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-sm ${dotClass}`} />
      {label} {count}
    </span>
  )
}

/** One numeric pillar — pass rate (passed/n) as the figure, coverage (n of
 *  total with data) as the badge. pct null → "—" (the AxisRow coverage idiom). */
function PillarCell({
  label,
  stat,
  total,
}: {
  label: string
  stat: DnaAdherence['perPillar']['price']
  total: number
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-1 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-fg-primary">
        {percent(stat.pct, 0)}
      </div>
      <div className="mt-1.5 inline-block rounded border border-border-subtle bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-tertiary tnum">
        {stat.n} of {total} with data
      </div>
    </div>
  )
}
