import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Upload, AlertCircle } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import KpiStrip from '@/components/dashboard/KpiStrip'
import RunningPnlChart from '@/components/dashboard/RunningPnlChart'
import AverageTradePnlChart from '@/components/dashboard/AverageTradePnlChart'
import MonthCalendarPreview from '@/components/dashboard/MonthCalendarPreview'
import LatestSessionTable from '@/components/dashboard/LatestSessionTable'
import MaxLossBanner from '@/components/dashboard/MaxLossBanner'
import TimeRangeToggle from '@/components/dashboard/TimeRangeToggle'
import TodaySessionCard from '@/components/dashboard/TodaySessionCard'
import MarketSentimentCard from '@/components/dashboard/MarketSentimentCard'
import WelcomeBanner from '@/components/dashboard/WelcomeBanner'
import QuoteOfDayCard from '@/components/dashboard/QuoteOfDayCard'
import JournalCard from '@/components/dashboard/JournalCard'
import GoalChallengeBand from '@/components/dashboard/GoalChallengeBand'
import EdgeIqDebriefCard from '@/components/dashboard/EdgeIqDebriefCard'
import BrandMark from '@/components/layout/BrandMark'
import { ipc } from '@/lib/ipc'
import { longDate } from '@/lib/format'
import { todayDateISO } from '@/core/session/today'
import { RANGE_LABEL, type DashboardData, type TimeRange } from '@shared/dashboard-types'

export default function Dashboard() {
  const [range, setRange] = useState<TimeRange>('30d')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ipc
      .dashboardGet(range)
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setErr(e.message)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [range])

  if (err) {
    return (
      <PageShell title="Dashboard" subtitle="Overview of your trading performance.">
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary"
        >
          <AlertCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-loss">
              Failed to load dashboard
            </div>
            <div className="mt-1">{err}</div>
          </div>
        </div>
      </PageShell>
    )
  }

  if (loading && !data) {
    return (
      <PageShell title="Dashboard" subtitle="Overview of your trading performance.">
        <LoadingSkeleton />
      </PageShell>
    )
  }

  if (!data) return null

  if (data.empty) {
    return (
      <PageShell title="Dashboard" subtitle="Overview of your trading performance.">
        <EmptyState />
      </PageShell>
    )
  }

  // local date (matches the trades' Eastern day + the EdgeIQ card); the UTC
  // slice rolled over after ~8pm ET and falsely zeroed today's P&L.
  const today = todayDateISO(new Date())
  const todayPnl = data.latest.date === today ? data.latest.net_pnl : 0

  return (
    <PageShell
      title="Dashboard"
      subtitle={
        data.latest.date
          ? <>Latest session <span className="text-fg-primary">{longDate(data.latest.date)}</span> · stats show {RANGE_LABEL[data.range]}</>
          : `Stats below show ${RANGE_LABEL[data.range]}.`
      }
    >
      <div className="space-y-5">
        {/* Welcome greeting — reads the existing profile display_name; honest
            "Welcome back" fallback when unset. First content element. */}
        <WelcomeBanner />

        <MaxLossBanner
          todayPnl={todayPnl}
          maxDailyLoss={data.settings.max_daily_loss}
          date={data.latest.date}
        />

        {/* TODAY'S SESSION — always renders. Shows active stats when
            trades exist, the no-trade-day flow when sitting out, or the
            blank-canvas prompt before the market session begins. */}
        <TodaySessionCard />

        {/* TEMP placement (v0.2.5 beat 1) — the standalone Market Sentiment
            card extracted from Today's Session. The final three-widget row is a
            later beat; mounted here for now so it's live-lookable. */}
        <MarketSentimentCard />

        {/* TEMP placement (v0.2.5 beat 2) — the standalone Quote of the Day,
            extracted from Today's Session. todayPnl drives the "+$X Today"
            badge. The final three-card row (Today's Session | Quote | Journal)
            is a later layout beat. */}
        <QuoteOfDayCard todayPnl={todayPnl} />

        {/* TEMP placement (v0.2.5 beat 3) — the standalone Journal card, taking
            over the journal affordance removed from Today's Session. The final
            three-card row (Today's Session | Quote | Journal) is a later layout
            beat. */}
        <JournalCard />

        {/* Goals + EdgeIQ debrief row (below Today's Session). Two columns
            at lg: the Daily Goal / Main Challenge
            band (left) and the EdgeIQ "Today's Trading Debrief" card (right);
            stacks to one column below lg. Both self-contained — the band reads
            todayPnl + settings and fetches the active equity goal; the debrief
            card owns its own today/30-day score, worked/leaked and focus.
            items-start so the shorter column doesn't stretch to match. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          <GoalChallengeBand
            todayPnl={todayPnl}
            dailyProfitTarget={data.settings.daily_profit_target}
            maxDailyLoss={data.settings.max_daily_loss}
          />
          <EdgeIqDebriefCard />
        </div>

        {/* Discipline streak chip used to render here; it now lives only in
            the sidebar footer (single source of truth). */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <TimeRangeToggle value={range} onChange={setRange} />
        </div>

        <KpiStrip overview={data.overview} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card
            title="Running P&L"
            subtitle="Net P&L per trading day in range."
          >
            <RunningPnlChart daily={data.daily} />
          </Card>
          <Card
            title="Average trade P&L"
            subtitle="Daily P&L divided by that day's trade count."
          >
            <AverageTradePnlChart daily={data.daily} />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <Card title="Latest session" padded={false} className="overflow-hidden">
            <LatestSessionTable session={data.latest} today={today} />
          </Card>
          <Card title="This month">
            <MonthCalendarPreview month={data.month} />
          </Card>
        </div>
      </div>
    </PageShell>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-[280px]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-[78px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-[240px]" />
        <Skeleton className="h-[240px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-[360px]" />
        <Skeleton className="h-[360px]" />
      </div>
    </div>
  )
}

// MASTER §5.11 — rich empty state with dotted backdrop, icon, headline,
// body, primary action. Never a bare "No data." line.
function EmptyState() {
  return (
    <div className="empty-grid rounded-lg border border-border-subtle bg-bg-2 px-6 py-16 text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.06]">
        <BrandMark variant="mark" className="h-12 w-12" />
      </div>
      <div className="text-lg font-semibold text-fg-primary">
        No trades yet — let's change that.
      </div>
      <div className="mx-auto mt-2 max-w-md text-sm text-fg-tertiary">
        Drop a DAS Trader CSV on the Import page. Your KPIs, equity curve, and
        calendar will populate immediately.
      </div>
      <Link
        to="/import"
        className="mt-6 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim"
      >
        <Upload size={14} strokeWidth={2.25} />
        Go to Import
      </Link>
    </div>
  )
}

