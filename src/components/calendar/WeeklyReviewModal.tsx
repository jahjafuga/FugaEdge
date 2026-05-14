import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { int, longDate, money, pnlClass, signed } from '@/lib/format'
import type { WeeklySummary } from '@shared/calendar-types'
import type { TradeListRow } from '@shared/trades-types'

interface WeeklyReviewModalProps {
  summary: WeeklySummary
  onClose: () => void
  onNotesSaved: (text: string) => void
}

function addDaysStr(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

function timeOf(iso: string): string {
  const m = iso.match(/T?(\d{2}):(\d{2})/)
  if (!m) return '—'
  return `${m[1]}:${m[2]}`
}

export default function WeeklyReviewModal({
  summary,
  onClose,
  onNotesSaved,
}: WeeklyReviewModalProps) {
  const [notes, setNotes] = useState(summary.notes ?? '')
  const [trades, setTrades] = useState<TradeListRow[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    setNotes(summary.notes ?? '')
    setSavedAt(null)
  }, [summary.week_start, summary.notes])

  // Pull every day's trades inside the week in parallel, then flatten + sort.
  useEffect(() => {
    let cancelled = false
    const dates: string[] = []
    for (let i = 0; i < 7; i++) dates.push(addDaysStr(summary.week_start, i))
    Promise.all(dates.map((d) => ipc.tradesList({ date: d })))
      .then((lists) => {
        if (cancelled) return
        const all: TradeListRow[] = []
        for (const list of lists) all.push(...list)
        all.sort((a, b) =>
          a.open_time < b.open_time ? -1 : a.open_time > b.open_time ? 1 : 0,
        )
        setTrades(all)
      })
      .catch(() => {
        if (!cancelled) setTrades([])
      })
    return () => {
      cancelled = true
    }
  }, [summary.week_start])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const dirty = notes !== (summary.notes ?? '')

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const res = await ipc.weekNotesSave({ week_start: summary.week_start, text: notes })
      onNotesSaved(res.text)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg-1/85 p-6 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[1100px] rounded-md border border-border-subtle bg-bg-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between border-b border-border-subtle/60 px-6 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
              Weekly review
            </div>
            <div className="mt-0.5 text-base font-medium text-fg-primary">
              {longDate(summary.week_start)} → {longDate(summary.week_end)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-subtle px-3 py-1 text-xs text-fg-secondary transition-colors duration-150 hover:border-muted hover:text-fg-primary"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Section title="Performance">
              <Stat
                label="Net P&L"
                value={
                  <span className={`font-mono text-2xl font-semibold ${pnlClass(summary.net_pnl)}`}>
                    {summary.trade_count > 0 ? signed(summary.net_pnl) : '—'}
                  </span>
                }
              />
              <Stat label="Trades" value={int(summary.trade_count)} />
              <Stat
                label="Win rate"
                value={summary.win_rate == null ? '—' : `${(summary.win_rate * 100).toFixed(0)}%`}
              />
              <Stat
                label="Profit factor"
                value={
                  summary.profit_factor == null
                    ? '—'
                    : summary.profit_factor === Infinity
                      ? '∞'
                      : summary.profit_factor.toFixed(2)
                }
              />
              <Stat
                label="Avg winner"
                value={summary.avg_winner == null ? '—' : money(summary.avg_winner)}
              />
              <Stat
                label="Avg loser"
                value={summary.avg_loser == null ? '—' : money(summary.avg_loser)}
              />
              <Stat label="Total fees" value={money(summary.total_fees)} />
            </Section>

            <Section title="Best & worst">
              <Stat
                label="Best day"
                value={
                  summary.best_day ? (
                    <span>
                      <span className="font-mono text-fg-primary">{summary.best_day.date}</span>
                      <span className="ml-2 font-mono text-win">
                        {signed(summary.best_day.net_pnl)}
                      </span>
                    </span>
                  ) : '—'
                }
              />
              <Stat
                label="Worst day"
                value={
                  summary.worst_day ? (
                    <span>
                      <span className="font-mono text-fg-primary">{summary.worst_day.date}</span>
                      <span className="ml-2 font-mono text-loss">
                        {signed(summary.worst_day.net_pnl)}
                      </span>
                    </span>
                  ) : '—'
                }
              />
              <Stat
                label="Best symbol"
                value={
                  summary.best_symbol ? (
                    <span>
                      <span className="font-mono text-fg-primary">{summary.best_symbol.symbol}</span>
                      <span
                        className={`ml-2 font-mono ${pnlClass(summary.best_symbol.net_pnl)}`}
                      >
                        {signed(summary.best_symbol.net_pnl)}
                      </span>
                    </span>
                  ) : '—'
                }
              />
            </Section>

            <Section title="Discipline">
              <Stat
                label="Days traded vs journaled"
                value={`${int(summary.days_journaled)} / ${int(summary.days_traded)}`}
              />
              <Stat
                label="Top mistake"
                value={
                  summary.top_mistake
                    ? `${summary.top_mistake.name} (${summary.top_mistake.count}×)`
                    : '—'
                }
              />
              <Stat
                label="Emotion avg"
                value={summary.emotion_avg == null ? '—' : summary.emotion_avg.toFixed(1)}
              />
            </Section>

            <Section title="Streak into next week">
              {summary.streak.kind === 'none' ? (
                <div className="text-sm text-fg-tertiary">No active streak.</div>
              ) : (
                <div
                  className={`font-mono text-lg font-medium ${
                    summary.streak.kind === 'win' ? 'text-win' : 'text-loss'
                  }`}
                >
                  {summary.streak.days}-day {summary.streak.kind}
                </div>
              )}
            </Section>

            <Section title="Trades">
              {trades === null ? (
                <div className="text-xs text-fg-tertiary">Loading trades…</div>
              ) : trades.length === 0 ? (
                <div className="text-xs text-fg-tertiary">No trades this week.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-fg-tertiary">
                      <tr className="border-b border-border-subtle/60">
                        <th className="px-2 py-2 text-left font-semibold">Date</th>
                        <th className="px-2 py-2 text-left font-semibold">Symbol</th>
                        <th className="px-2 py-2 text-left font-semibold">Side</th>
                        <th className="px-2 py-2 text-left font-semibold">Entry</th>
                        <th className="px-2 py-2 text-right font-semibold">Net P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t) => (
                        <tr
                          key={t.id}
                          className="border-b border-border-subtle/30 hover:bg-white/[0.015]"
                        >
                          <td className="px-2 py-1.5 font-mono text-fg-primary">{t.date}</td>
                          <td className="px-2 py-1.5 font-mono text-fg-primary">{t.symbol}</td>
                          <td
 className={`px-2 py-1.5 uppercase ${
                              t.side === 'short' ? 'text-loss' : 'text-win'
                            }`}
                          >
                            {t.side}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-fg-tertiary">
                            {timeOf(t.open_time)}
                          </td>
                          <td
                            className={`px-2 py-1.5 text-right font-mono font-medium ${pnlClass(t.net_pnl)}`}
                          >
                            {signed(t.net_pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
                Week notes
              </div>
              {savedAt && !dirty && (
                <span className="text-[10px] uppercase tracking-wider text-win">
                  saved
                </span>
              )}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={16}
              placeholder="What worked this week? What didn't? What's the plan for next week?"
              className="w-full resize-y rounded-sm border border-border-subtle bg-bg-1 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted focus:border-gold focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="w-full rounded-md bg-gold px-4 py-2 text-xs font-medium text-accent-ink transition-all duration-150 hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save weekly reflection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 border-b border-border-subtle/40 pb-1 text-[10px] uppercase tracking-wider text-gold">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">{children}</div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div className="mt-0.5 text-sm text-fg-primary">{value}</div>
    </div>
  )
}
