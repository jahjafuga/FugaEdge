import type { PeriodWording } from '@shared/period-wording'
import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { PeriodDetail } from '@shared/week-types'
import Card from '@/components/ui/Card'
import CelebrationBurst from '@/components/ui/CelebrationBurst'
import type { ReviewChannel } from '@/components/calendar/reviewChannel'
import IntradayPnLChart from '@/components/charts/IntradayPnLChart'
import StatStrip, {
  type Kpi,
  intCount,
  moneyOrDash,
  pctOrDash,
  signedOrDash,
} from '@/components/ui/StatStrip'
import { formatPnlRatio, int, signed, pnlClass, shortDate } from '@/lib/format'

// v0.2.2 Day 4.5b — Week Overview: the at-a-glance shape of the week. Equity
// curve across the week (the shared IntradayPnLChart in 'datetime' mode) +
// a narrative summary (net, win rate, best/worst DAY, streak).
export default function WeekOverviewTab({
  detail,
  wording,
  review,
}: {
  detail: PeriodDetail
  /** The period's own words, supplied by whoever mounts this tab. */
  wording: PeriodWording
  /** The period's review pair. The card renders IF AND ONLY IF this is
   *  given, so "is there a card" and "which channel does it reach" cannot
   *  disagree. There is no default: this tab must not name a channel,
   *  because the weekly GET handler does no validation at all
   *  (electron/xp/ipc.ts:45-52) and a wrong id would fail silently for
   *  ever. Omitted -> no card, no fetch, no button. */
  review?: ReviewChannel
}) {
  const m = detail.metrics

  // R5 — the review Complete button, on whichever period mounted this tab.
  // THE ID IS THE CHANNEL'S, NOT THIS TAB'S: a week is keyed on its Sunday
  // and a month on its YYYY-MM, and the period START is only the former.
  // The host binds it. Mount-fetch the completed state so reopening shows
  // it.
  const [reviewed, setReviewed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [burst, setBurst] = useState(0)

  useEffect(() => {
    if (!review) return
    let cancelled = false
    review
      .get()
      .then((s) => {
        if (!cancelled) setReviewed(s.completed)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [review])

  async function completeReview() {
    if (!review || submitting || reviewed) return
    setSubmitting(true)
    setReviewError(null)
    try {
      const res = await review.complete()
      if (res.completed) {
        setReviewed(true)
        if (res.awarded) setBurst((k) => k + 1) // light celebration on a FRESH award only
      } else {
        // Shouldn't happen — the period guard rejects a wrong-shaped id.
        setReviewError(res.error ?? 'Could not complete the review.')
      }
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const reviewCard = !review ? null : (
    <div className="relative flex items-center justify-between gap-3 overflow-visible rounded-lg border border-border-subtle bg-bg-2 p-4">
      <CelebrationBurst trigger={burst} intensity="light" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg-primary">{wording.reviewTitle}</div>
        <div className="text-xs text-fg-tertiary">
          {reviewed
            ? wording.reviewDone
            : wording.reviewPrompt}
        </div>
        {reviewError && <div className="mt-1 text-xs text-danger">{reviewError}</div>}
      </div>
      {reviewed ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gold/40 bg-gold/[0.08] px-3 py-1.5 text-sm font-medium text-gold">
          <CheckCircle2 aria-hidden className="h-4 w-4" strokeWidth={2} />
          Reviewed
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void completeReview()}
          disabled={submitting}
          className="shrink-0 rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-accent-ink hover:bg-gold-hover disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Complete review'}
        </button>
      )}
    </div>
  )

  if (m.tradeCount === 0) {
    return (
      <div className="space-y-4">
        {reviewCard}
        <div className="rounded-md border border-border-subtle bg-bg-2 p-6 text-sm text-fg-secondary">
          {wording.noTrades}
        </div>
      </div>
    )
  }

  // Quick-glance strip — same 10 cards as the dashboard, week-scoped. Reads the
  // same WeekMetrics the Performance tab uses. Largest winner/loser are the
  // single-TRADE extremes (biggestWin/worstLoss), NOT the best/worst DAY.
  const kpis: Kpi[] = [
    { label: 'Net P&L',        value: m.netPnl,             format: signedOrDash,  tone: 'auto' },
    { label: 'Gross P&L',      value: m.grossPnl,           format: signedOrDash,  tone: 'auto' },
    { label: 'Total fees',     value: m.totalFees,          format: moneyOrDash,   tone: 'red' },
    { label: 'Trade count',    value: m.tradeCount,         format: intCount,      tone: 'neutral' },
    { label: 'Win rate',       value: m.winRate,            format: pctOrDash,     tone: 'gold' },
    { label: 'P&L ratio',      value: m.pnlRatio,           format: formatPnlRatio, tone: 'gold' },
    { label: 'Avg winner',     value: m.avgWin,             format: moneyOrDash,   tone: 'green' },
    { label: 'Avg loser',      value: m.avgLoss,            format: moneyOrDash,   tone: 'red' },
    { label: 'Largest winner', value: m.biggestWin?.pnl ?? null, format: moneyOrDash, tone: 'green' },
    { label: 'Largest loser',  value: m.worstLoss?.pnl ?? null,  format: moneyOrDash, tone: 'red' },
  ]

  return (
    <div className="space-y-4">
      {reviewCard}
      <StatStrip items={kpis} />

      <Card
        title="Equity curve"
        subtitle={wording.equitySubtitle}
      >
        <IntradayPnLChart
          trades={detail.trades}
          date={detail.from}
          height={340}
          xLabelMode="datetime"
        />
      </Card>

      <div className="px-1 text-sm text-fg-secondary">
        <span className="font-medium text-fg-primary">
          {int(m.tradeCount)} trade{m.tradeCount === 1 ? '' : 's'}
        </span>
        {' over '}
        <span className="font-mono">
          {m.tradingDays} day{m.tradingDays === 1 ? '' : 's'}
        </span>
        {' · net '}
        <span className={`font-mono font-semibold ${pnlClass(m.netPnl)}`}>{signed(m.netPnl)}</span>
        {m.winRate !== null && (
          <>
            {' · '}
            <span className="font-mono">{(m.winRate * 100).toFixed(0)}%</span> win rate
          </>
        )}
        {m.bestDay && (
          <>
            {' · best '}
            <span className="font-mono text-fg-primary">{shortDate(m.bestDay.date)}</span>{' '}
            <span className="font-mono text-win">{signed(m.bestDay.netPnl)}</span>
          </>
        )}
        {m.worstDay && (
          <>
            {' · worst '}
            <span className="font-mono text-fg-primary">{shortDate(m.worstDay.date)}</span>{' '}
            <span className="font-mono text-loss">{signed(m.worstDay.netPnl)}</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Trades">
          <div className="font-mono text-2xl font-semibold text-fg-primary tnum">
            {int(m.tradeCount)}
          </div>
          <div className="mt-1 text-xs text-fg-tertiary tnum">
            {m.winCount}W · {m.lossCount}L · {m.scratchCount}S · {m.greenDays}/{m.tradingDays} green days
          </div>
        </Card>

        <Card title="Avg share size">
          <div className="font-mono text-2xl font-semibold text-fg-primary tnum">
            {m.avgShareSize == null ? '—' : int(Math.round(m.avgShareSize))}
          </div>
          <div className="mt-1 text-xs text-fg-tertiary tnum">
            per trade
          </div>
        </Card>

        <Card title={wording.streakLabel}>
          {m.streak.kind === 'none' ? (
            <div className="text-sm text-fg-tertiary">No active streak.</div>
          ) : (
            <div
              className={`font-mono text-2xl font-semibold ${
                m.streak.kind === 'win' ? 'text-win' : 'text-loss'
              }`}
            >
              {m.streak.days}-day {m.streak.kind}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
