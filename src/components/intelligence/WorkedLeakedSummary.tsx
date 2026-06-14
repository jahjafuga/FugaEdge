import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import type { WeekMetrics } from '@shared/week-types'
import type { DayMetrics } from '@shared/day-types'
import { ipc } from '@/lib/ipc'
import { weekRepo } from '@/data/weekRepo'
import { dayRepo } from '@/data/dayRepo'
import { signed, shortDate } from '@/lib/format'
import {
  splitWorkedLeaked,
  type WorkedLeakedItem,
} from '@/core/analytics/whatWorkedLeaked'

// v0.2.5 Edge Intelligence Beat 4 — the "What worked / What leaked" range summary.
// DESCRIPTIVE, not prescriptive: it summarizes the most-recent session or week
// (a header stat strip + best/worst symbol, playbook, day, the biggest win /
// worst loss, top mistake tags) over the EXISTING WeekMetrics/DayMetrics — the
// same aggregate the Weekly Review uses (weekDetailGet / dayDetailGet, no new
// fetch, no forked compute). A session/week is too small for the pattern rules,
// so this draws no edge conclusions (that's the hero cards' job over 90 days).
// Beat 1 (flagship): the outer card adopts the §11.1 premium surface (neutral).

type Scope = 'session' | 'week'
type Metrics = WeekMetrics | DayMetrics

/** The Sunday (UTC) anchoring the calendar week of `date` — the Sunday-aligned
 *  weekStart that weekDetailGet expects. */
function sundayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay())
  return dt.toISOString().slice(0, 10)
}

const KIND_LABEL: Record<WorkedLeakedItem['kind'], string> = {
  symbol: 'Symbol',
  playbook: 'Playbook',
  day: 'Day',
  trade: 'Trade',
  mistake: 'Mistake',
}

const fmtPct = (p: number | null) => (p === null ? '—' : `${Math.round(p * 100)}%`)
const fmtPF = (pf: number | null) => (pf === null ? '—' : Number.isFinite(pf) ? pf.toFixed(2) : '∞')

interface HeaderStat {
  label: string
  value: string
  tone?: string
}

// Header stats — read straight off the already-fetched metrics (no extra fetch /
// compute). Common to both scopes: net P&L, win rate, profit factor. Week adds
// green days + streak; session adds the W/L record. Every field already exists
// on WeekMetrics/DayMetrics (no aggregate fork). Null/∞ handled gracefully.
function headerStats(m: Metrics, scope: Scope): HeaderStat[] {
  const stats: HeaderStat[] = [
    {
      label: 'Net P&L',
      value: signed(m.netPnl),
      tone: m.netPnl > 0 ? 'text-win' : m.netPnl < 0 ? 'text-loss' : 'text-fg-primary',
    },
    { label: 'Win rate', value: fmtPct(m.winRate) },
    { label: 'Profit factor', value: fmtPF(m.profitFactor) },
  ]
  if (scope === 'week') {
    const wm = m as WeekMetrics
    stats.push({ label: 'Green days', value: `${wm.greenDays}/${wm.tradingDays}` })
    stats.push({
      label: 'Streak',
      value: wm.streak.kind === 'none' ? '—' : `${wm.streak.days}d ${wm.streak.kind}`,
      tone: wm.streak.kind === 'win' ? 'text-win' : wm.streak.kind === 'loss' ? 'text-loss' : undefined,
    })
  } else {
    const dm = m as DayMetrics
    stats.push({ label: 'Record', value: `${dm.winCount}W ${dm.lossCount}L` })
  }
  return stats
}

export default function WorkedLeakedSummary() {
  const [scope, setScope] = useState<Scope>('week')
  const [anchor, setAnchor] = useState<{ session: string; week: string } | null>(null)
  const [noTrades, setNoTrades] = useState(false)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Derive the most-recent session + week anchors once.
  useEffect(() => {
    let cancelled = false
    ipc
      .tradesList()
      .then((trades) => {
        if (cancelled) return
        if (trades.length === 0) {
          setNoTrades(true)
          return
        }
        const maxDate = trades.reduce((mx, t) => (t.date > mx ? t.date : mx), trades[0].date)
        setAnchor({ session: maxDate, week: sundayOf(maxDate) })
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch the detail for the active scope (reuses the Weekly Review's data path).
  useEffect(() => {
    if (!anchor) return
    let cancelled = false
    setMetrics(null)
    const fetched =
      scope === 'week'
        ? weekRepo.getWeekDetail(anchor.week).then((d) => d.metrics)
        : dayRepo.getDayDetail(anchor.session).then((d) => d.metrics)
    fetched
      .then((m) => !cancelled && setMetrics(m))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [anchor, scope])

  const data = useMemo(() => (metrics ? splitWorkedLeaked(metrics) : null), [metrics])

  if (error) {
    if (typeof console !== 'undefined') console.error('[worked-leaked]', error)
    return null
  }

  const period =
    anchor === null
      ? ''
      : scope === 'week'
        ? `Week of ${shortDate(anchor.week)}`
        : shortDate(anchor.session)

  return (
    <section
      aria-label="What worked / What leaked"
      className="card-premium p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
            What worked / What leaked
          </h2>
          {period && <span className="font-mono text-[10px] text-fg-muted tnum">{period}</span>}
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-border-subtle">
          {(['session', 'week'] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
                scope === s
                  ? 'bg-gold text-accent-ink'
                  : 'bg-bg-2 text-fg-tertiary hover:text-fg-secondary'
              }`}
            >
              {s === 'session' ? 'Session' : 'Week'}
            </button>
          ))}
        </div>
      </div>

      {noTrades ? (
        <div className="rounded-md border border-dashed border-border-subtle bg-bg-1 p-6 text-center text-sm text-fg-secondary">
          No trades yet — import a session to see what worked and what leaked.
        </div>
      ) : metrics === null || data === null ? (
        <div className="space-y-4">
          <div className="skeleton h-[52px]" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="skeleton h-[140px]" />
            <div className="skeleton h-[140px]" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header stat strip — frames "was this a good period" before the breakdowns. */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border border-border-subtle bg-bg-1 px-4 py-3">
            {headerStats(metrics, scope).map((s) => (
              <div key={s.label} className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">{s.label}</span>
                <span className={`font-mono text-sm font-semibold tnum ${s.tone ?? 'text-fg-primary'}`}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Column
              title="What worked"
              Icon={TrendingUp}
              tone="text-win"
              items={data.worked}
              emptyText="Nothing green this period."
            />
            <Column
              title="What leaked"
              Icon={AlertTriangle}
              tone="text-loss"
              items={data.leaked}
              emptyText="Nothing red this period — clean."
            />
          </div>
        </div>
      )}
    </section>
  )
}

function Column({
  title,
  Icon,
  tone,
  items,
  emptyText,
}: {
  title: string
  Icon: typeof TrendingUp
  tone: string
  items: WorkedLeakedItem[]
  emptyText: string
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-1 p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <Icon size={13} strokeWidth={2.25} className={tone} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          {title}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-fg-muted">{emptyText}</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={`${it.kind}-${it.label}-${i}`} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 rounded border border-border-subtle bg-bg-2 px-1 py-0.5 text-[9px] uppercase tracking-wider text-fg-muted">
                  {KIND_LABEL[it.kind]}
                </span>
                <span className="truncate text-fg-primary">
                  {it.kind === 'day' ? shortDate(it.label) : it.label}
                </span>
              </span>
              <span className={`shrink-0 font-mono tnum ${it.netPnl !== null ? tone : 'text-fg-tertiary'}`}>
                {it.netPnl !== null ? signed(it.netPnl) : `${it.count}×`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
