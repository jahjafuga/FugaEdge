import Card from '@/components/ui/Card'
import Tooltip from '@/components/ui/Tooltip'
import type { FullStats, ReportsData } from '@shared/reports-types'
import { duration, money, pnlClass } from '@/lib/format'

interface QualityTabProps {
  data: ReportsData
}

export default function QualityTab({ data }: QualityTabProps) {
  const fs = data.fullStats

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <SqnHero sqn={fs.sqn} stdDev={fs.std_dev_pnl} avgPnl={fs.avg_trade_pnl} n={fs.trade_count} />
        <KellyCard kelly={fs.kelly_pct} winners={fs.winners} losers={fs.losers} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <KRatioCard kRatio={fs.k_ratio} tradingDays={fs.trading_days} />
        <RandomChanceCard randomChance={fs.random_chance_pct} sqn={fs.sqn} />
      </div>

      <Card title="Hold time" subtitle="Average duration from open to close." hover>
        <HoldTimeBars stats={fs} />
      </Card>

      <Card title="Execution quality" subtitle="Adverse and favorable excursion." hover>
        <MaeMfe stats={fs} />
      </Card>
    </div>
  )
}

// ── SQN hero ────────────────────────────────────────────────────────────────

interface SqnHeroProps {
  sqn: number | null
  stdDev: number | null
  avgPnl: number | null
  n: number
}

function sqnRating(n: number | null): { label: string; tone: string; pct: number } {
  if (n == null) return { label: 'no data', tone: 'text-fg-tertiary', pct: 0 }
  if (n < 1) return { label: 'poor', tone: 'text-loss', pct: Math.max(8, Math.min(25, n * 25)) }
  if (n < 2) return { label: 'average', tone: 'text-gold/70', pct: 25 + ((n - 1) / 1) * 25 }
  if (n < 3) return { label: 'good', tone: 'text-gold', pct: 50 + ((n - 2) / 1) * 25 }
  return { label: 'excellent', tone: 'text-win', pct: Math.min(100, 75 + ((n - 3) / 3) * 25) }
}

function SqnHero({ sqn, stdDev, avgPnl, n }: SqnHeroProps) {
  const rating = sqnRating(sqn)
  return (
    <Card title="System Quality Number" subtitle="(Avg trade P&L / std dev) × √N — higher is better." hover>
      <div className="flex items-baseline justify-between">
        <div>
          <div className={`font-mono text-5xl font-medium tracking-tight ${rating.tone}`}>
            {sqn == null ? '—' : sqn.toFixed(2)}
          </div>
          <div className={`mt-1 text-xs uppercase tracking-wider ${rating.tone}`}>
            {rating.label}
          </div>
        </div>
        <div className="text-right text-xs text-fg-tertiary">
          <div>
            avg{' '}
            <span className={`font-mono ${avgPnl != null ? pnlClass(avgPnl) : 'text-fg-tertiary'}`}>
              {avgPnl == null ? '—' : money(avgPnl)}
            </span>
          </div>
          <div>
            sd{' '}
            <span className="font-mono text-fg-primary">
              {stdDev == null ? '—' : money(stdDev)}
            </span>
          </div>
          <div>
            n <span className="font-mono text-fg-primary">{n}</span>
          </div>
        </div>
      </div>

      {/* Rating gauge */}
      <div className="mt-5">
        <div className="relative h-2 overflow-hidden rounded-sm bg-white/[0.04]">
          {/* Tick marks at 1, 2, 3 */}
          <div className="absolute left-1/4 top-0 h-full w-px bg-border" />
          <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
          <div className="absolute left-3/4 top-0 h-full w-px bg-border" />
          {sqn != null && (
            <div
              className={`absolute left-0 top-0 h-full ${
                sqn < 1
                  ? 'bg-loss/70'
                  : sqn < 2
                    ? 'bg-gold/40'
                    : sqn < 3
                      ? 'bg-gold/80'
                      : 'bg-win/80'
              }`}
              style={{ width: `${rating.pct}%` }}
            />
          )}
        </div>
        <div className="mt-1 grid grid-cols-4 text-[10px] uppercase tracking-wider text-fg-tertiary">
          <span>0</span>
          <span>1</span>
          <span>2</span>
          <span className="text-right">3+</span>
        </div>
      </div>
    </Card>
  )
}

// ── Kelly card ─────────────────────────────────────────────────────────────

function KellyCard({
  kelly,
  winners,
  losers,
}: {
  kelly: number | null
  winners: number
  losers: number
}) {
  return (
    <Card
      title="Kelly %"
      subtitle="(W − L × |avg loss| / avg win) × 100 — fraction of bankroll the edge supports."
      hover
    >
      <div className="flex flex-col gap-2">
        <div
          className={`font-mono text-5xl font-medium tracking-tight ${
            kelly == null
              ? 'text-fg-tertiary'
              : kelly > 0
                ? 'text-win'
                : kelly < 0
                  ? 'text-loss'
                  : 'text-fg-tertiary'
          }`}
        >
          {kelly == null ? '—' : `${kelly >= 0 ? '+' : ''}${kelly.toFixed(1)}%`}
        </div>
        <div className="text-xs text-fg-secondary">
          {kelly == null && 'Kelly is undefined until you have both winning and losing trades.'}
          {kelly != null && kelly > 0 && (
            <>
              Positive edge. Half-Kelly{' '}
              <span className="font-mono text-gold">
                {(kelly / 2).toFixed(1)}%
              </span>{' '}
              is a common, less-volatile fraction.
            </>
          )}
          {kelly != null && kelly <= 0 && (
            <>Edge does not favor trading at this win rate × payoff ratio.</>
          )}
        </div>
        <div className="mt-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
          based on {winners} winners · {losers} losers
        </div>
      </div>
    </Card>
  )
}

// ── K-Ratio + Random Chance cards ──────────────────────────────────────────

function kRatioRating(n: number | null): { label: string; tone: string } {
  if (n == null) return { label: 'no data', tone: 'text-fg-tertiary' }
  if (n < 0.5) return { label: 'noisy', tone: 'text-loss' }
  if (n < 1.5) return { label: 'developing', tone: 'text-gold/70' }
  if (n < 3) return { label: 'consistent', tone: 'text-gold' }
  return { label: 'highly consistent', tone: 'text-win' }
}

function KRatioCard({
  kRatio,
  tradingDays,
}: {
  kRatio: number | null
  tradingDays: number
}) {
  const r = kRatioRating(kRatio)
  return (
    <Card
      title="K-Ratio"
      subtitle="Kestner's measure of equity-curve consistency over time."
      hover
      right={
        <Tooltip
          content={
            <>
              Regresses daily cumulative P&L on trading-day index. Returns the
              t-statistic of the slope divided by √N. Higher = more linear,
              less choppy equity growth. Above 1.5 indicates a consistent edge.
              Requires at least 3 trading days.
            </>
          }
        >
          <span className="cursor-help text-[11px] text-fg-tertiary">ⓘ</span>
        </Tooltip>
      }
    >
      <div className="flex items-baseline justify-between">
        <div>
          <div className={`font-mono text-5xl font-medium tracking-tight ${r.tone}`}>
            {kRatio == null ? '—' : kRatio.toFixed(2)}
          </div>
          <div className={`mt-1 text-xs uppercase tracking-wider ${r.tone}`}>
            {r.label}
          </div>
        </div>
        <div className="text-right text-xs text-fg-tertiary">
          <div>
            days <span className="font-mono text-fg-primary">{tradingDays}</span>
          </div>
        </div>
      </div>
      <div className="mt-5">
        <div className="relative h-2 overflow-hidden rounded-sm bg-white/[0.04]">
          {/* Bands at 0.5, 1.5, 3 */}
          <div className="absolute left-[16.67%] top-0 h-full w-px bg-border" />
          <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
          <div className="absolute left-[83.33%] top-0 h-full w-px bg-border" />
          {kRatio != null && (
            <div
              className={`absolute left-0 top-0 h-full ${
                kRatio < 0.5
                  ? 'bg-loss/70'
                  : kRatio < 1.5
                    ? 'bg-gold/40'
                    : kRatio < 3
                      ? 'bg-gold/80'
                      : 'bg-win/80'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, ((kRatio + 1) / 5) * 100))}%` }}
            />
          )}
        </div>
        <div className="mt-1 grid grid-cols-4 text-[10px] uppercase tracking-wider text-fg-tertiary">
          <span>noisy</span>
          <span>developing</span>
          <span>consistent</span>
          <span className="text-right">strong</span>
        </div>
      </div>
    </Card>
  )
}

function RandomChanceCard({
  randomChance,
  sqn,
}: {
  randomChance: number | null
  sqn: number | null
}) {
  return (
    <Card
      title="Probability of random chance"
      subtitle="How likely your results came from luck."
      hover
      right={
        <Tooltip
          content={
            <>
              Computed as 1 / (1 + SQN² × 0.1). Lower is better. Getting under
              5% in practice requires SQN ≫ 5 — a very high bar even for
              edge-driven systems.
            </>
          }
        >
          <span className="cursor-help text-[11px] text-fg-tertiary">ⓘ</span>
        </Tooltip>
      }
    >
      <div className="flex items-baseline justify-between">
        <div>
          <div
            className={`font-mono text-5xl font-medium tracking-tight ${
              randomChance == null
                ? 'text-fg-tertiary'
                : randomChance < 0.05
                  ? 'text-win'
                  : randomChance < 0.3
                    ? 'text-gold'
                    : 'text-loss'
            }`}
          >
            {randomChance == null ? '—' : `${(randomChance * 100).toFixed(1)}%`}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wider text-fg-tertiary">
            {randomChance == null
              ? 'no data'
              : randomChance < 0.05
                ? 'likely skill'
                : randomChance < 0.3
                  ? 'edge developing'
                  : 'too noisy to tell'}
          </div>
        </div>
        <div className="text-right text-xs text-fg-tertiary">
          <div>
            sqn{' '}
            <span className="font-mono text-fg-primary">
              {sqn == null ? '—' : sqn.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-4 text-[11px] text-fg-secondary">
        Lower = stronger evidence the results aren't luck. As your trade count
        and SQN grow, this metric drops.
      </div>
    </Card>
  )
}

// ── Hold time comparison ───────────────────────────────────────────────────

function HoldTimeBars({ stats }: { stats: FullStats }) {
  const items: { label: string; seconds: number | null; tone: string }[] = [
    { label: 'Winners', seconds: stats.avg_hold_seconds_winners, tone: 'bg-win/70' },
    { label: 'Losers', seconds: stats.avg_hold_seconds_losers, tone: 'bg-loss/70' },
    { label: 'Scratches', seconds: stats.avg_hold_seconds_scratches, tone: 'bg-muted' },
    { label: 'All trades', seconds: stats.avg_hold_seconds, tone: 'bg-gold/70' },
  ]
  const max = Math.max(1, ...items.map((i) => i.seconds ?? 0))

  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="grid grid-cols-[120px_1fr_80px] items-center gap-3">
          <div className="text-sm text-fg-secondary">{it.label}</div>
          <div className="relative h-5 rounded-sm bg-white/[0.025]">
            {it.seconds != null && it.seconds > 0 && (
              <div
                className={`absolute left-0 top-0 h-full rounded-sm ${it.tone}`}
                style={{ width: `${(it.seconds / max) * 100}%` }}
              />
            )}
          </div>
          <div className="text-right font-mono text-sm text-fg-primary">
            {duration(it.seconds)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── MAE / MFE ───────────────────────────────────────────────────────────────

function MaeMfe({ stats }: { stats: FullStats }) {
  // Both are always null today (we don't have intraday market data). Surface
  // the structure with a clear explanation so the slot is visible.
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ExcursionRow
        label="Average MAE"
        full="Maximum Adverse Excursion"
        value={stats.avg_mae}
        kind="adverse"
      />
      <ExcursionRow
        label="Average MFE"
        full="Maximum Favorable Excursion"
        value={stats.avg_mfe}
        kind="favorable"
      />
    </div>
  )
}

function ExcursionRow({
  label,
  full,
  value,
  kind,
}: {
  label: string
  full: string
  value: number | null
  kind: 'adverse' | 'favorable'
}) {
  return (
    <div className="rounded-md border border-border-subtle/40 bg-bg-1/30 p-4">
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div className="mt-1 font-mono text-2xl text-fg-tertiary">
        {value == null ? '—' : money(value)}
      </div>
      <div className="mt-2 text-[11px] text-fg-secondary">{full}</div>
      <div className="mt-2 text-[11px] text-fg-tertiary">
        Requires intraday market data — Massive's daily aggregates don't cover{' '}
        {kind === 'adverse' ? 'how far against' : 'how far in favor'} the trade
        went between your fills. Wire up 1-minute bars to populate this.
      </div>
    </div>
  )
}
