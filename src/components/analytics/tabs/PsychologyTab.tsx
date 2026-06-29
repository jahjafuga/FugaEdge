import Card from '@/components/ui/Card'
import SectionHeader from '@/components/ui/SectionHeader'
import MistakesCard from '@/components/analytics/MistakesCard'
import RuleBreaksCard from '@/components/analytics/RuleBreaksCard'
import SentimentBreakdownCard from '@/components/analytics/SentimentBreakdownCard'
import { int } from '@/lib/format'
import type { AnalyticsData } from '@shared/analytics-types'

interface PsychologyTabProps {
  data: AnalyticsData
}

export default function PsychologyTab({ data }: PsychologyTabProps) {
  const { discipline, mistakes } = data
  const fomoMistakes = mistakes.byMistake.filter((m) =>
    /fomo|chase/i.test(m.label),
  )

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Psychology"
        description="Discipline score, mistake patterns, and signals that the head got in the way."
      />

      <SentimentBreakdownCard data={data.sentiment} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <MistakesCard data={mistakes} />

        <div className="space-y-5">
          <Card title="Discipline">
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
                  Discipline score
                </div>
                <div
                  className={`mt-1 font-mono text-4xl font-medium ${
                    discipline.discipline_score >= 70
                      ? 'text-win'
                      : discipline.discipline_score >= 40
                        ? 'text-gold'
                        : 'text-loss'
                  }`}
                >
                  {discipline.discipline_score}
                </div>
                <div className="mt-1 text-[10px] text-fg-secondary">
                  out of 100
                </div>
              </div>

              <div className="border-t border-border-subtle/40 pt-3">
                <DisciplineRow
                  label="Days journaled"
                  value={int(discipline.days_journaled)}
                />
                <DisciplineRow
                  label="Days traded"
                  value={int(discipline.days_traded)}
                />
                <DisciplineRow
                  label="Current streak"
                  value={`${int(discipline.discipline_streak)} day${discipline.discipline_streak === 1 ? '' : 's'}`}
                  tone={
                    discipline.discipline_streak >= 5
                      ? 'gold'
                      : discipline.discipline_streak > 0
                        ? 'green'
                        : 'muted'
                  }
                />
              </div>
            </div>
          </Card>

          <Card title="FOMO / chase signal" subtitle="Mistakes tagged with FOMO- or chase-style labels.">
            {fomoMistakes.length === 0 ? (
              <div className="text-xs text-fg-tertiary">
                None of your tagged mistakes match FOMO / chase patterns.
              </div>
            ) : (
              <ul className="space-y-2 text-xs">
                {fomoMistakes.map((m) => (
                  <li
                    key={m.label}
                    className="flex items-baseline justify-between gap-3 border-b border-border-subtle/30 pb-2 last:border-b-0 last:pb-0"
                  >
                    <span className="text-fg-primary">{m.label}</span>
                    <span className="text-right">
                      <span className="font-mono text-loss">
                        {m.net_pnl >= 0 ? '+' : ''}${m.net_pnl.toFixed(0)}
                      </span>
                      <span className="ml-2 font-mono text-fg-tertiary">
                        × {int(m.trade_count)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <RuleBreaksCard data={data.ruleBreaks} />

      <Card title="Revenge / fatigue" subtitle="Surfaces from the Insights engine — check the dashboard banner.">
        <div className="rounded-md border border-border-subtle/40 bg-bg-1/40 p-4 text-xs text-fg-secondary">
          Revenge-trading and trade-of-day fatigue patterns are detected after
          each import and surfaced on the Dashboard. Click the gold "View all"
          on the insights banner to see the full list of behavioural signals.
        </div>
      </Card>
    </div>
  )
}

function DisciplineRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'gold' | 'green' | 'muted'
}) {
  const color =
    tone === 'gold'
      ? 'text-gold'
      : tone === 'green'
        ? 'text-win'
        : tone === 'muted'
          ? 'text-fg-tertiary'
          : 'text-fg-primary'
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-fg-secondary">{label}</span>
      <span className={`font-mono text-sm ${color}`}>{value}</span>
    </div>
  )
}
