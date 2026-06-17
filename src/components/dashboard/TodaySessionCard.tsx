import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CalendarOff,
  CheckCircle2,
  CircleDashed,
  Moon,
  Pencil,
  Save,
  Sun,
} from 'lucide-react'
import { useTodaySession } from '@/lib/useTodaySession'
import {
  NO_TRADE_REASON_CHIPS,
  type SessionStatus,
  type TodaySessionStats,
  type TodaySessionStatus,
} from '@/core/session/today'
import { longDate, money, percent, signed } from '@/lib/format'

// TODAY'S SESSION CARD
//
// Three visible modes, picked from the derived session state:
//   1. NOT-STARTED + not committed → prompt with action button(s)
//   2. EDIT MODE (user clicked the EDIT link, or pressed "Mark no-trade")
//      → form with textarea + reason chips + Save / Unmark
//   3. COMMITTED + not editing → compact "logged" state: header (a time-aware
//      sun/moon icon + the date), the status badge, then the compact 3-up stat
//      row (active days) or the no-trade / journal summary line, + an EDIT link
//
// Vertical layout — the card lives in a narrow third of the dashboard's
// three-card row (Today's Session | Quote | Journal), so it stacks instead of
// spreading into wide columns.
//
// "Committed" is a pure derivation in /src/core/session/today — trades
// imported, no-trade-day saved with a reason, OR a journal entry exists.

export default function TodaySessionCard() {
  const { status, noTradeDaysThisMonth, loading, error, save } = useTodaySession()

  // User can explicitly enter edit mode from the completed state. Also
  // auto-engaged when "Mark as no-trade day" is pressed from the prompt.
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  // Hydrate textarea + edit-mode default when persisted state changes.
  useEffect(() => {
    setReason(status.meta.no_trade_reason ?? '')
  }, [status.meta.no_trade_reason])

  const handleSaveNoTrade = async () => {
    setSaving(true)
    await save({
      date: status.date,
      no_trade_day: true,
      no_trade_reason: reason.trim(),
    })
    setSaving(false)
    setEditing(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2500)
  }

  const handleUnmarkNoTrade = async () => {
    setSaving(true)
    await save({
      date: status.date,
      no_trade_day: false,
      no_trade_reason: '',
    })
    setEditing(false)
    setSaving(false)
  }

  if (error) {
    return (
      <SessionCardShell>
        <div className="flex items-center gap-2 text-sm text-loss">
          <AlertCircle size={16} strokeWidth={2} />
          Couldn't load today's session: {error}
        </div>
      </SessionCardShell>
    )
  }

  if (loading) {
    return (
      <SessionCardShell>
        <div className="text-sm text-fg-tertiary">Loading today's session…</div>
      </SessionCardShell>
    )
  }

  const showCompleted = status.committed && !editing

  return (
    <SessionCardShell>
      {showCompleted ? (
        <CompletedView
          status={status}
          noTradeDaysThisMonth={noTradeDaysThisMonth}
          onEdit={() => setEditing(true)}
          savedFlash={savedFlash}
        />
      ) : (
        <EditableView
          status={status}
          noTradeDaysThisMonth={noTradeDaysThisMonth}
          editing={editing}
          reason={reason}
          onReasonChange={setReason}
          onMarkNoTrade={() => setEditing(true)}
          onSave={handleSaveNoTrade}
          onUnmark={status.meta.no_trade_day ? handleUnmarkNoTrade : undefined}
          onCancelEdit={() => setEditing(false)}
          saving={saving}
        />
      )}
    </SessionCardShell>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────
// card-premium so the three cards in the row share one surface idiom. flex-col
// + the inner flex-1 lets the active stats sit at the card's bottom (mt-auto),
// aligning across the stretched row.

function SessionCardShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Today's session"
      data-tour="today-session"
      className="card-premium flex flex-col p-4"
    >
      {children}
    </section>
  )
}

// ── Shared header — time-aware sun/moon icon + eyebrow + date ──────────────

function SessionHeader({ status }: { status: TodaySessionStatus }) {
  return (
    <div className="flex items-center gap-2.5">
      <SessionIcon />
      <div className="flex min-w-0 flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Today's session
        </span>
        <span className="truncate text-lg font-semibold leading-tight tracking-tight text-fg-primary">
          {longDate(status.date)}
        </span>
      </div>
    </div>
  )
}

// Sun during local daytime (06:00–17:59), Moon overnight (18:00–05:59) — a
// presentational time-of-day cue read from the user's local clock at render.
function SessionIcon() {
  const hr = new Date().getHours()
  const Icon = hr >= 6 && hr < 18 ? Sun : Moon
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.08] text-gold">
      <Icon size={17} strokeWidth={2} />
    </span>
  )
}

// ── Completed view ───────────────────────────────────────────────────────

function CompletedView({
  status,
  noTradeDaysThisMonth,
  onEdit,
  savedFlash,
}: {
  status: TodaySessionStatus
  noTradeDaysThisMonth: number
  onEdit: () => void
  savedFlash: boolean
}) {
  const badge = badgeForCommittedStatus(status)

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* Header — session icon + date, with Edit top-right */}
      <div className="flex items-start justify-between gap-2">
        <SessionHeader status={status} />
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-gold"
        >
          <Pencil size={11} strokeWidth={2} />
          Edit
        </button>
      </div>

      {/* Status badge + counters */}
      <div className="flex flex-wrap items-center gap-2">
        {badge}
        {noTradeDaysThisMonth > 0 && (
          <span
            className="text-[10px] text-fg-tertiary tnum"
            title="Distinct no-trade days marked this calendar month."
          >
            {noTradeDaysThisMonth} no-trade {noTradeDaysThisMonth === 1 ? 'day' : 'days'} this month
          </span>
        )}
        {savedFlash && (
          <span className="text-[10px] uppercase tracking-wider text-win">Saved</span>
        )}
      </div>

      {/* Active → compact stats; otherwise the no-trade / journal summary. */}
      {status.status === 'active' && status.stats != null ? (
        <CompactStats stats={status.stats} />
      ) : (
        <div className="text-sm text-fg-secondary">{buildSummaryLine(status)}</div>
      )}
    </div>
  )
}

// Compact 3-up stat row — fits the narrow third-of-row column (the wide
// stretched-out mockup layout won't). The cells STRETCH to fill the card's
// leftover height (flex-1 row + stretched tiles), so the active card reads
// balanced top-to-bottom instead of stranding the stats near the top. Honest:
// winRate is null until a decided trade exists (shown "—") and the W/L record
// sits under it; BEST is the day's best WINNING trade — the P&L figure as the
// hero with its symbol on the sub-line, "—" on an all-losers day (never a red
// "best"). The middle BEST cell is the focal hero (a faint win wash). Today's
// NET P&L is deliberately NOT repeated here — it already shows on the Daily
// Goal widget and the KPI strip, so the day's +$ was appearing in too many
// places.
function CompactStats({ stats }: { stats: TodaySessionStats }) {
  // Best is shown only when it's an actual winning trade; a non-positive "best"
  // (an all-losers day) collapses to null → "—", so the cell never paints a
  // red number as the day's highlight.
  const best = stats.bestTrade
  const bestWin = best != null && best.pnl > 0 ? best : null
  const wr = stats.winRate == null ? '—' : percent(stats.winRate, 0)
  return (
    <div className="flex flex-1 gap-2">
      <StatCell label="Trades" value={String(stats.trades)} />
      <StatCell
        label="Best"
        value={bestWin == null ? '—' : signed(bestWin.pnl)}
        tone={bestWin == null ? 'text-fg-primary' : 'text-win'}
        sub={bestWin?.symbol}
        cellClass={
          bestWin == null ? 'border-border-strong bg-bg-2' : 'border-win/25 bg-win/[0.06]'
        }
      />
      <StatCell label="Win rate" value={wr} sub={`${stats.winners}W / ${stats.losers}L`} />
    </div>
  )
}

// One stat tile. flex-1 so the three split the row evenly and each stretches to
// the row's (stretched) height; the value is vertically centered with the label
// pinned to the top and the optional sub pinned to the bottom. Every cell
// reserves the sub line (nbsp when absent) so the three hero values stay
// baseline-aligned across the row.
function StatCell({
  label,
  value,
  tone,
  sub,
  cellClass,
}: {
  label: string
  value: string
  tone?: string
  sub?: string
  cellClass?: string
}) {
  return (
    <div
      className={`flex flex-1 flex-col rounded-md border px-2.5 py-3 ${
        cellClass ?? 'border-border-subtle bg-bg-1'
      }`}
    >
      <div className="text-[9px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {label}
      </div>
      <div className="flex flex-1 items-center">
        <span className={`font-mono text-xl font-bold leading-none tnum ${tone ?? 'text-fg-primary'}`}>
          {value}
        </span>
      </div>
      <div className="font-mono text-[10px] font-medium text-fg-tertiary tnum">{sub ?? ' '}</div>
    </div>
  )
}

// Summary line for the NON-active committed states (no-trade day, journal-only).
// The active branch is retained as a defensive fallback but is normally
// superseded by CompactStats.
function buildSummaryLine(status: TodaySessionStatus): React.ReactNode {
  if (status.status === 'active' && status.stats != null) {
    const s = status.stats
    const netTone =
      s.netPnL > 0 ? 'text-win' : s.netPnL < 0 ? 'text-loss' : 'text-fg-primary'
    const grossTone =
      s.grossPnL > 0 ? 'text-win' : s.grossPnL < 0 ? 'text-loss' : 'text-fg-primary'
    const feesTone = s.totalFees > 0 ? 'text-fg-primary' : 'text-fg-secondary'
    const wr = s.winRate == null ? '—' : `${percent(s.winRate, 0)} win rate`
    return (
      <>
        <span className="text-fg-primary tnum">{s.trades}</span>{' '}
        {s.trades === 1 ? 'trade' : 'trades'} ·{' '}
        <span className={`tnum ${grossTone}`}>Gross {signed(s.grossPnL)}</span>{' '}
        · <span className={`tnum ${feesTone}`}>Fees {money(s.totalFees)}</span>{' '}
        · <span className={`font-medium tnum ${netTone}`}>Net {signed(s.netPnL)}</span>{' '}
        · <span className="text-fg-secondary tnum">{wr}</span>
      </>
    )
  }
  if (status.status === 'no-trade') {
    const r = status.meta.no_trade_reason.trim()
    return (
      <>
        <span className="text-fg-primary">No-trade day</span>
        {r && (
          <>
            {' · '}
            <span className="text-fg-tertiary">Reason:</span>{' '}
            <span className="text-fg-secondary">{r}</span>
          </>
        )}
      </>
    )
  }
  // Journal-only path
  return (
    <>
      <span className="text-fg-primary">Journal entry logged</span>{' '}
      <span className="text-fg-tertiary">— review or update it from the Journal page.</span>
    </>
  )
}

function badgeForCommittedStatus(status: TodaySessionStatus) {
  if (status.status === 'no-trade') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/[0.10] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
        <CalendarOff size={11} strokeWidth={2.25} />
        No-trade day
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-win/40 bg-win/[0.10] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-win">
      <CheckCircle2 size={11} strokeWidth={2.25} />
      Session logged
    </span>
  )
}

// ── Editable view (not-committed / editing) ───────────────────────────────

function EditableView({
  status,
  noTradeDaysThisMonth,
  editing,
  reason,
  onReasonChange,
  onMarkNoTrade,
  onSave,
  onUnmark,
  onCancelEdit,
  saving,
}: {
  status: TodaySessionStatus
  noTradeDaysThisMonth: number
  editing: boolean
  reason: string
  onReasonChange: (v: string) => void
  onMarkNoTrade: () => void
  onSave: () => void
  onUnmark?: () => void
  onCancelEdit: () => void
  saving: boolean
}) {
  // The form opens automatically when status is no-trade (already marked but
  // user wants to edit) OR when `editing` is set explicitly from the prompt.
  const showForm = editing || (status.status === 'no-trade' && !status.committed)

  return (
    <div className="flex flex-1 flex-col gap-3">
      <SessionHeader status={status} />
      <div className="flex items-center gap-2">
        <StatusBadge status={status.status} />
        {noTradeDaysThisMonth > 0 && (
          <span
            className="text-[10px] text-fg-tertiary tnum"
            title="Distinct no-trade days marked this calendar month."
          >
            {noTradeDaysThisMonth} no-trade {noTradeDaysThisMonth === 1 ? 'day' : 'days'} this month
          </span>
        )}
      </div>
      <div className="flex-1">
        {showForm ? (
          <NoTradeFlow
            reason={reason}
            onReasonChange={onReasonChange}
            onSave={onSave}
            onUnmark={onUnmark}
            onCancel={onCancelEdit}
            saving={saving}
            alreadyMarked={status.meta.no_trade_day}
          />
        ) : (
          <NotStartedPrompt onMarkNoTrade={onMarkNoTrade} />
        )}
      </div>
    </div>
  )
}

// ── Reusable bits ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SessionStatus }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-win/40 bg-win/[0.10] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-win">
        <CheckCircle2 size={11} strokeWidth={2.25} />
        Active
      </span>
    )
  }
  if (status === 'no-trade') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/[0.10] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
        <CalendarOff size={11} strokeWidth={2.25} />
        No-trade day
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-bg-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
      <CircleDashed size={11} strokeWidth={2.25} />
      Not started
    </span>
  )
}

function NotStartedPrompt({
  onMarkNoTrade,
}: {
  onMarkNoTrade: () => void
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="text-sm text-fg-secondary">
        No trades imported for today yet. If you're sitting out, mark it as a
        no-trade day so the streak keeps counting — discipline IS a trade.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onMarkNoTrade}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-gold/40 bg-gold/[0.08] px-3 text-[10px] font-semibold uppercase tracking-wider text-gold transition-colors duration-150 hover:bg-gold/[0.14]"
        >
          <CalendarOff size={12} strokeWidth={2} />
          Mark as no-trade day
        </button>
      </div>
    </div>
  )
}

function NoTradeFlow({
  reason,
  onReasonChange,
  onSave,
  onUnmark,
  onCancel,
  saving,
  alreadyMarked,
}: {
  reason: string
  onReasonChange: (v: string) => void
  onSave: () => void
  onUnmark?: () => void
  onCancel: () => void
  saving: boolean
  alreadyMarked: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] uppercase tracking-wider text-fg-tertiary">
        Why no trades today?
      </label>
      <textarea
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        rows={2}
        placeholder="Market choppy, no clean setups · Sat out, sentiment 1 · FOMC day"
        className="w-full resize-y rounded-md border border-border-strong bg-bg-1 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-tertiary outline-none transition-colors duration-150 focus:border-gold"
      />
      <div className="flex flex-wrap gap-1.5">
        {NO_TRADE_REASON_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onReasonChange(c)}
            className="cursor-pointer rounded-full border border-border-strong bg-bg-1 px-2.5 py-0.5 text-[10px] text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            {c}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !reason.trim()}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-3 text-[10px] font-semibold uppercase tracking-wider text-accent-ink transition-colors duration-150 hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={12} strokeWidth={2.25} />
          {alreadyMarked ? 'Update reason' : 'Save no-trade day'}
        </button>
        {onUnmark && (
          <button
            type="button"
            onClick={onUnmark}
            disabled={saving}
            className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border-strong bg-bg-1 px-3 text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-loss/40 hover:text-loss disabled:opacity-50"
          >
            Unmark
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex h-8 cursor-pointer items-center rounded-md px-3 text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-fg-primary disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
