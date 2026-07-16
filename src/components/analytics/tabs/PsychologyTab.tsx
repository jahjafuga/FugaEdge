import Card from '@/components/ui/Card'
import SectionHeader from '@/components/ui/SectionHeader'
import MistakesCard from '@/components/analytics/MistakesCard'
import RuleBreaksCard from '@/components/analytics/RuleBreaksCard'
import SentimentBreakdownCard from '@/components/analytics/SentimentBreakdownCard'
import Tooltip from '@/components/ui/Tooltip'
import { Info } from 'lucide-react'
import { int, money, percent } from '@/lib/format'
import type { AnalyticsData, GivebackStats } from '@shared/analytics-types'

const DASH = '—'

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

      <GivebackCard data={data.giveback} />

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

// "Gave back profits" (djsevans87) — the goal-triggered giveback rollup, sibling
// of RuleBreaksCard. Three stats; an em-dash (never a fabricated zero) when there
// are no giveback days, and a "set a goal" empty state when no daily goal was
// ever set. Point-in-time since schema 48 (Dave #9): the old "uses your CURRENT
// goal / past days aren't historically exact" caveat is RETIRED — it became
// false. The subtitle names this card computed-from-trades so it can't be read
// as the MANUAL "Gave back" rule-break tag in the card above (separate surface;
// nothing here writes the journal_rule_break junction).
function GivebackCard({ data }: { data: GivebackStats }) {
  return (
    <Card
      title="Gave back profits"
      subtitle="Days you crossed your daily goal, then surrendered some before the close. Computed from your trades — separate from the manual rule-break tags above."
      hover
      right={
        <Tooltip
          content={
            <>
              Goal-triggered: a day counts only when your cumulative P&L crossed
              the daily goal in force that day and then gave some back. "Off the
              top" is the giveback as a share of that day's peak, computed from
              the day's closed trades in order. Point-in-time: each day evaluates
              against the goal you had set on that day — goal changes are
              recorded from this version forward, and days before your first
              recorded change use the goal you had when you upgraded.
            </>
          }
        >
          <Info size={14} strokeWidth={2} aria-hidden="true" className="cursor-help text-fg-tertiary" />
        </Tooltip>
      }
    >
      {!data.goal_set ? (
        <div className="rounded-md border border-gold/30 bg-gold/[0.04] p-4 text-xs text-fg-secondary">
          <div className="mb-1 uppercase tracking-wider text-gold">No daily goal set</div>
          Set a daily profit goal in Settings to track how often you hit it and
          gave some back.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <GivebackStat label="Days gave back" value={int(data.days)} tone="neutral" />
          <GivebackStat
            label="Total given back"
            value={data.days > 0 ? money(data.total_giveback) : DASH}
            tone="loss"
          />
          <GivebackStat
            label="Avg off the top"
            value={data.avg_pct_off_top == null ? DASH : percent(data.avg_pct_off_top, 1)}
            tone="gold"
          />
        </div>
      )}
    </Card>
  )
}

function GivebackStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'neutral' | 'loss' | 'gold'
}) {
  const color =
    tone === 'loss' ? 'text-loss' : tone === 'gold' ? 'text-gold' : 'text-fg-primary'
  return (
    <div className="rounded-md border border-border-subtle/40 bg-bg-1/40 p-4">
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div className={`mt-1.5 font-mono text-2xl font-medium ${color}`}>{value}</div>
    </div>
  )
}
