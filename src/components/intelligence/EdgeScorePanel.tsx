import { useMemo } from 'react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { useEdgeScore } from '@/lib/useEdgeScore'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'
import { EDGE_SCORE_BANDS, type AxisKey, type AxisResult } from '@/core/score/edgeScore'

// v0.2.5 Edge Intelligence — Beat 2. The Edge Score surface: the 0–100 composite,
// a 6-axis radar, the published weights + bands (the published-formula rule), the
// per-axis raw value, and the honesty chips — the Discipline data-coverage chip
// ("based on X of Y trades") and the n / provisional gates. Clean D26 grammar —
// no glow; the futuristic skin is the Phase E sweep.

const GOLD = '#d4af37' // brand accent, theme-constant (matches EquityChart)

// Short spoke labels so the 6 radar axes don't overflow the hexagon.
const SHORT: Record<AxisKey, string> = {
  discipline: 'Discipline',
  profit_factor: 'Profit F.',
  win_rate: 'Win Rate',
  avg_win_loss: 'Avg W/L',
  max_drawdown: 'Drawdown',
  consistency: 'Consistency',
}

function fmtRaw(raw: number | null, fmt: 'pct' | 'frac' | 'x'): string {
  if (raw === null) return '—'
  if (!Number.isFinite(raw)) return '∞'
  if (fmt === 'pct') return `${raw.toFixed(0)}%`
  if (fmt === 'frac') return `${(raw * 100).toFixed(0)}%`
  return `${raw.toFixed(2)}×`
}

const bandFmt = (key: AxisKey) => EDGE_SCORE_BANDS.find((b) => b.key === key)!.rawFormat

export default function EdgeScorePanel() {
  const { result, loading, error } = useEdgeScore()
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])

  const radarData = useMemo(
    () =>
      result
        ? result.axes.map((a) => ({
            axis: SHORT[a.key],
            sub: a.sub ?? 0,
            rawText: fmtRaw(a.raw, bandFmt(a.key)),
          }))
        : [],
    [result],
  )

  if (error) {
    if (typeof console !== 'undefined') console.error('[edge-score]', error)
    return null // never blow up the page for a score failure
  }
  if (loading || !result) return <Shell><div className="skeleton h-[240px]" /></Shell>

  if (result.suppressed) {
    return (
      <Shell>
        <div className="rounded-md border border-dashed border-border-subtle bg-bg-1 p-6 text-center text-sm text-fg-secondary">
          Not enough trades to score yet — the Edge Score needs at least 5 in the
          last 90 days (you have {result.n}).
        </div>
      </Shell>
    )
  }

  return (
    <Shell n={result.n} provisional={result.provisional}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[200px_1fr]">
        {/* Score number */}
        <div className="flex flex-col items-center justify-center gap-1 sm:items-start">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-6xl font-semibold tabular-nums text-gold">
              {result.score}
            </span>
            <span className="font-mono text-lg text-fg-muted">/100</span>
          </div>
          <div className="text-xs text-fg-tertiary">
            How sharp you are right now — process-weighted.
          </div>
        </div>

        {/* Radar */}
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top: 12, right: 24, bottom: 12, left: 24 }}>
              <PolarGrid stroke={palette.grid} />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: palette.axis, fontSize: 11 }}
              />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="sub"
                stroke={GOLD}
                fill={GOLD}
                fillOpacity={0.18}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Tooltip
                contentStyle={{
                  background: resolved === 'dark' ? '#10131a' : '#ffffff',
                  border: `1px solid ${palette.grid}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number, _name, entry) => [
                  `${Math.round(value)}/100 · ${(entry?.payload as { rawText?: string })?.rawText ?? ''}`,
                  'sub-score',
                ]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Published formula — weights + bands + raw values (the published-formula rule). */}
      <div className="mt-5 border-t border-border-subtle/60 pt-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Weights &amp; bands
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {result.axes.map((a) => (
            <AxisRow key={a.key} axis={a} />
          ))}
        </div>
      </div>
    </Shell>
  )
}

function AxisRow({ axis }: { axis: AxisResult }) {
  const band = EDGE_SCORE_BANDS.find((b) => b.key === axis.key)!
  const cov = axis.coverage
  const showCov = axis.key === 'discipline' && cov && cov.total > 0
  const covPct = showCov ? Math.round((cov!.complete / cov!.total) * 100) : 0
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="font-medium text-fg-primary">{axis.label}</span>
        <span className="font-mono text-[10px] text-fg-muted tnum">{axis.weight}%</span>
        {showCov && (
          <span
            className="shrink-0 rounded border border-border-subtle bg-bg-1 px-1.5 py-0.5 font-mono text-[10px] text-fg-tertiary tnum"
            title="Trades with complete indicator data — the rest are excluded from the discipline read."
          >
            based on {cov!.complete} of {cov!.total} trades ({covPct}%)
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-baseline gap-3">
        <span className="font-mono text-[10px] text-fg-muted">{band.band}</span>
        <span className="w-12 text-right font-mono text-fg-secondary tnum">
          {fmtRaw(axis.raw, band.rawFormat)}
        </span>
      </div>
    </div>
  )
}

function Shell({
  children,
  n,
  provisional,
}: {
  children: React.ReactNode
  n?: number
  provisional?: boolean
}) {
  return (
    <section
      aria-label="Edge Score"
      className="rounded-lg border border-border-subtle bg-bg-2 p-5"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Edge Score
        </h2>
        <div className="flex items-center gap-2">
          {provisional && (
            <span className="rounded-md border border-gold/40 bg-gold/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
              Provisional
            </span>
          )}
          {n != null && (
            <span className="font-mono text-[10px] text-fg-muted tnum">
              n = {n} · last 90 days
            </span>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}
