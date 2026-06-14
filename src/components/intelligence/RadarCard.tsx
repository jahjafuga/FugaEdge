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
import type { UseEdgeScoreResult } from '@/lib/useEdgeScore'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'
import { SHORT, fmtRaw, bandFmt } from './edgeScoreFormat'

// v0.2.5 Edge Intelligence — Beat 2. The radar as its OWN compact card (right of
// the ScoreCard in the /intelligence 2-col row). The 6-axis shape with the
// per-axis "sub/100 · raw" hover tooltip — moved verbatim from the old
// EdgeScorePanel. card-premium + card-glow-gold first-class treatment (B2
// tuning); reads the lifted useEdgeScore result and owns its loading /
// suppressed / error.

const GOLD = '#d4af37' // brand accent, theme-constant (matches EquityChart)

export default function RadarCard({ result, loading, error }: UseEdgeScoreResult) {
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
    if (typeof console !== 'undefined') console.error('[edge-score radar]', error)
    return null
  }

  return (
    <section aria-label="Edge shape" className="card-premium card-glow-gold p-5">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
        Edge shape
      </h2>
      {loading || !result ? (
        <div className="skeleton h-[240px]" />
      ) : result.suppressed ? (
        <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed border-border-subtle bg-bg-1 p-6 text-center text-sm text-fg-secondary">
          Not enough trades to map your edge shape yet.
        </div>
      ) : (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top: 12, right: 24, bottom: 12, left: 24 }}>
              <PolarGrid stroke={palette.grid} />
              <PolarAngleAxis dataKey="axis" tick={{ fill: palette.axis, fontSize: 11 }} />
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
      )}
    </section>
  )
}
