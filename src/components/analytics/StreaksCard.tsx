import Card from '@/components/ui/Card'
import type { CurrentStreak, Streak } from '@shared/analytics-types'
import { int, signed, longDate, pnlClass } from '@/lib/format'

interface StreaksCardProps {
  longestWin: Streak | null
  longestLoss: Streak | null
  current: CurrentStreak | null
}

export default function StreaksCard({
  longestWin,
  longestLoss,
  current,
}: StreaksCardProps) {
  return (
    <Card title="Streaks" subtitle="Scratches end an active streak.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StreakBlock
          label="Longest winning"
          accent="text-win"
          length={longestWin?.length ?? 0}
          range={
            longestWin
              ? `${longDate(longestWin.start_date)} → ${longDate(longestWin.end_date)}`
              : null
          }
          totalPnl={longestWin?.total_pnl ?? null}
        />
        <StreakBlock
          label="Longest losing"
          accent="text-loss"
          length={longestLoss?.length ?? 0}
          range={
            longestLoss
              ? `${longDate(longestLoss.start_date)} → ${longDate(longestLoss.end_date)}`
              : null
          }
          totalPnl={longestLoss?.total_pnl ?? null}
        />
        <StreakBlock
          label="Current"
          accent={
            current
              ? current.kind === 'win'
                ? 'text-win'
                : 'text-loss'
              : 'text-fg-tertiary'
          }
          length={current?.length ?? 0}
          range={current ? `since ${longDate(current.start_date)}` : null}
          totalPnl={current?.total_pnl ?? null}
          suffix={current?.kind ?? ''}
        />
      </div>
    </Card>
  )
}

function StreakBlock({
  label,
  accent,
  length,
  range,
  totalPnl,
  suffix,
}: {
  label: string
  accent: string
  length: number
  range: string | null
  totalPnl: number | null
  suffix?: string
}) {
  return (
    <div className="rounded-md border border-border-subtle/60 bg-bg-1/40 p-4">
      <div className="text-[10px] uppercase tracking-widest text-fg-tertiary">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`font-mono text-2xl font-medium ${accent}`}>
          {length > 0 ? int(length) : '—'}
        </span>
        {suffix && length > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-tertiary">
            {suffix}
          </span>
        )}
      </div>
      {range && (
        <div className="mt-1 text-[11px] text-fg-secondary">{range}</div>
      )}
      {totalPnl !== null && length > 0 && (
        <div className={`mt-1 font-mono text-xs ${pnlClass(totalPnl)}`}>
          {signed(totalPnl)}
        </div>
      )}
    </div>
  )
}
