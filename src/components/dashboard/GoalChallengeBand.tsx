import { useEffect, useState, type ReactNode } from 'react'
import { Target, Trophy, Info } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { int, percent } from '@/lib/format'
import { dailyTargetProgress } from '@/core/dailyTarget/progress'
import { remainingRisk } from '@/core/dailyTarget/remainingRisk'
import { pickMainChallenge } from '@/core/goals/mainChallenge'
import type { GoalWithProgress } from '@shared/identity-types'

// v0.2.5 — the dashboard's paired Daily Goal / Main Challenge band (built to
// the gooals.png mockup). Presentational + self-contained: the Daily Goal half
// is pure-from-props (todayPnl + settings, already in dashboard scope); the
// Main Challenge half fetches active equity goals via the side-effect-free
// goalsProgressRead and picks the main one with the pure pickMainChallenge.
// Colors via win/gold/loss tokens only (light/dark-correct). No fabricated
// numbers — unset/empty states render a prompt, never $0-as-real or NaN.
//
// NUMBER FORMAT NOTE: the mockup uses whole dollars ($18,245, +$86), so this
// uses whole-dollar formatting (int() + $) rather than the dashboard's 2-dp
// signed()/money() — flagged for the live-look.

const whole = (n: number): string => `$${int(Math.round(n))}`
const wholeSigned = (n: number): string =>
  `${n >= 0 ? '+' : '-'}$${int(Math.abs(Math.round(n)))}`

interface GoalChallengeBandProps {
  todayPnl: number
  dailyProfitTarget: number
  maxDailyLoss: number
}

export default function GoalChallengeBand({
  todayPnl,
  dailyProfitTarget,
  maxDailyLoss,
}: GoalChallengeBandProps) {
  // null = no active equity goal; undefined = still loading.
  const [mainGoal, setMainGoal] = useState<GoalWithProgress | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    ipc
      .goalsProgressRead()
      .then((goals) => {
        if (!cancelled) setMainGoal(pickMainChallenge(goals))
      })
      .catch(() => {
        if (!cancelled) setMainGoal(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-3" aria-label="Daily goal and main challenge">
      <DailyGoalCard todayPnl={todayPnl} target={dailyProfitTarget} maxDailyLoss={maxDailyLoss} />
      <MainChallengeCard goal={mainGoal} />
    </div>
  )
}

// ── Daily Goal (green / win) ───────────────────────────────────────────────

function DailyGoalCard({
  todayPnl,
  target,
  maxDailyLoss,
}: {
  todayPnl: number
  target: number
  maxDailyLoss: number
}) {
  const prog = dailyTargetProgress(todayPnl, target)

  return (
    <section aria-label="Daily goal" className="card-premium p-5">
      {prog === null ? (
        <div className="flex items-center gap-4">
          <IconBadge Icon={Target} tone="win" muted />
          <div>
            <Eyebrow label="Daily goal" tone="text-win/70" />
            <div className="mt-1 text-sm text-fg-tertiary">
              Set a daily target in Settings to track today against it.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            {/* Left — icon + label + today's P&L vs target */}
            <IconBadge Icon={Target} tone="win" />
            <div className="min-w-0">
              <Eyebrow label="Daily goal" tone="text-win" />
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold leading-none tabular-nums text-win">
                  {wholeSigned(todayPnl)}
                </span>
                <span className="font-mono text-lg text-fg-muted">/ {whole(target)}</span>
              </div>
            </div>

            {/* Right cluster — %, max loss, remaining risk, status */}
            <div className="ml-auto flex items-center gap-4 sm:gap-6">
              <span className="font-mono text-2xl font-bold tabular-nums text-win">
                {percent(prog.fraction, 0)}
              </span>
              <Divider />
              <StatCol label="Max loss">
                <span className="text-loss">
                  {maxDailyLoss > 0 ? `-${whole(maxDailyLoss)}` : '—'}
                </span>
              </StatCol>
              <Divider />
              <StatCol label="Remaining risk">
                <RemainingRisk todayPnl={todayPnl} maxDailyLoss={maxDailyLoss} />
              </StatCol>
              <Divider />
              <StatCol label="Status">
                <StatusPill todayPnl={todayPnl} hit={prog.hit} maxDailyLoss={maxDailyLoss} />
              </StatCol>
            </div>
          </div>

          <ProgressBar fraction={prog.fraction} tone="win" thick />
        </>
      )}
    </section>
  )
}

function RemainingRisk({ todayPnl, maxDailyLoss }: { todayPnl: number; maxDailyLoss: number }) {
  const left = remainingRisk(todayPnl, maxDailyLoss)
  return <span className="text-fg-primary">{left === null ? '—' : whole(left)}</span>
}

function StatusPill({
  todayPnl,
  hit,
  maxDailyLoss,
}: {
  todayPnl: number
  hit: boolean
  maxDailyLoss: number
}) {
  const breached = maxDailyLoss > 0 && todayPnl <= -maxDailyLoss
  const { label, cls } = breached
    ? { label: 'Max loss', cls: 'border-loss/40 bg-loss/[0.12] text-loss' }
    : hit
      ? { label: 'Goal hit', cls: 'border-gold/40 bg-gold/[0.12] text-gold' }
      : { label: 'In play', cls: 'border-win/40 bg-win/[0.12] text-win' }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${cls}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

// ── Main Challenge (gold) ──────────────────────────────────────────────────

function MainChallengeCard({ goal }: { goal: GoalWithProgress | null | undefined }) {
  if (goal === undefined) {
    return (
      <section aria-label="Main challenge" className="card-premium p-5">
        <div className="skeleton h-[64px]" />
      </section>
    )
  }

  if (goal === null || goal.progress === null) {
    return (
      <section aria-label="Main challenge" className="card-premium p-5">
        <div className="flex items-center gap-4">
          <IconBadge Icon={Trophy} tone="gold" muted />
          <div>
            <Eyebrow label="Main challenge" tone="text-gold/70" />
            <div className="mt-1 text-sm text-fg-tertiary">
              No challenge set —{' '}
              <span className="text-gold/80">create one in Profile</span>.
            </div>
          </div>
        </div>
      </section>
    )
  }

  const { current, target, fraction } = goal.progress
  const remaining = Math.max(0, target - current)

  return (
    <section aria-label="Main challenge" className="card-premium p-5">
      <div className="flex items-center gap-4">
        {/* Left — icon + label + title */}
        <IconBadge Icon={Trophy} tone="gold" />
        <div className="min-w-0 shrink-0">
          <Eyebrow label="Main challenge" tone="text-gold" />
          <div className="mt-0.5 truncate text-base font-semibold text-fg-primary" title={goal.title}>
            {goal.title}
          </div>
        </div>

        {/* Center — current vs target */}
        <div className="mx-auto flex items-baseline gap-2">
          <span className="font-mono text-3xl font-bold leading-none tabular-nums text-gold">
            {whole(current)}
          </span>
          <span className="font-mono text-lg text-fg-muted">/ {whole(target)}</span>
        </div>

        {/* Right cluster — complete %, remaining */}
        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          <StatCol label="Complete" align="end">
            <span className="text-gold">{percent(fraction, 2)}</span>
          </StatCol>
          <Divider />
          <StatCol label="Remaining" align="end">
            <span className="text-fg-primary">{whole(remaining)}</span>
          </StatCol>
        </div>
      </div>

      <ProgressBar fraction={fraction} tone="gold" />
    </section>
  )
}

// ── Shared bits ────────────────────────────────────────────────────────────

function IconBadge({
  Icon,
  tone,
  muted = false,
}: {
  Icon: typeof Target
  tone: 'win' | 'gold'
  muted?: boolean
}) {
  const ring = tone === 'win' ? 'bg-win/10 ring-win/20 text-win' : 'bg-gold/10 ring-gold/20 text-gold'
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ${ring} ${muted ? 'opacity-60' : ''}`}
    >
      <Icon size={22} strokeWidth={2} />
    </span>
  )
}

function Eyebrow({ label, tone }: { label: string; tone: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${tone}`}>{label}</span>
      <Info size={12} strokeWidth={2} className="text-fg-muted" aria-hidden="true" />
    </div>
  )
}

function StatCol({
  label,
  children,
  align = 'start',
}: {
  label: string
  children: ReactNode
  align?: 'start' | 'end'
}) {
  return (
    <div className={`flex flex-col gap-1 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {label}
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums">{children}</span>
    </div>
  )
}

function Divider() {
  return <div className="h-8 w-px shrink-0 bg-border-subtle" aria-hidden="true" />
}

function ProgressBar({
  fraction,
  tone,
  thick = false,
}: {
  fraction: number
  tone: 'win' | 'gold'
  thick?: boolean
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <div className={`mt-4 w-full overflow-hidden rounded-full bg-bg-3 ${thick ? 'h-2.5' : 'h-1.5'}`}>
      <div
        className={`h-full rounded-full ${tone === 'win' ? 'bg-win' : 'bg-gold'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
