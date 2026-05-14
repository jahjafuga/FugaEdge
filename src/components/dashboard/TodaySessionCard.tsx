import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CalendarOff,
  CheckCircle2,
  CircleDashed,
  NotebookPen,
  Pencil,
  Save,
  Sparkles,
} from 'lucide-react'
import { useTodaySession } from '@/lib/useTodaySession'
import {
  NO_TRADE_REASON_CHIPS,
  type SessionStatus,
  type TodaySessionStatus,
} from '@/core/session/today'
import {
  contextFor,
  pickQuoteForContext,
  type TradingQuote,
} from '@/core/quotes/tradingQuotes'
import { longDate, money, signed } from '@/lib/format'
import { SENTIMENT_LABELS } from '@shared/session-types'

// TODAY'S SESSION CARD
//
// Three visible modes, picked from the derived session state:
//   1. NOT-STARTED + not committed → big prompt with action buttons
//   2. EDIT MODE (user clicked the EDIT link, or pressed "Mark no-trade")
//      → form with textarea + reason chips + Save / Unmark
//   3. COMMITTED + not editing → compact "logged" state with status
//      badge, summary line, sentiment badge, motivational quote, EDIT link
//
// "Committed" is a pure derivation in /src/core/session/today — trades
// imported, no-trade-day saved with a reason, OR a journal entry exists.

const LAST_QUOTE_STORAGE_KEY = 'fugaedge-today-quote-id'

function readLastQuoteId(): number | null {
  if (typeof window === 'undefined') return null
  const v = window.localStorage.getItem(LAST_QUOTE_STORAGE_KEY)
  if (!v) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

function writeLastQuoteId(id: number): void {
  window.localStorage.setItem(LAST_QUOTE_STORAGE_KEY, String(id))
}

export default function TodaySessionCard() {
  const { status, noTradeDaysThisMonth, loading, error, save } = useTodaySession()
  const navigate = useNavigate()

  // User can explicitly enter edit mode from the completed state.
  // Also auto-engaged when the user clicks "Mark as no-trade day" from
  // the not-started prompt.
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  // Quote rotates each time the committed-state remounts (i.e. on save).
  // `nonce` resets the lookup to pick a fresh one not equal to last shown.
  const [quoteNonce, setQuoteNonce] = useState(() => Date.now())

  // Hydrate textarea + edit-mode default when persisted state changes.
  useEffect(() => {
    setReason(status.meta.no_trade_reason ?? '')
  }, [status.meta.no_trade_reason])

  const sentiment = status.meta.sentiment

  const handleSaveNoTrade = async () => {
    setSaving(true)
    await save({
      date: status.date,
      sentiment,
      no_trade_day: true,
      no_trade_reason: reason.trim(),
    })
    setSaving(false)
    setEditing(false)
    setSavedFlash(true)
    setQuoteNonce(Date.now())
    setTimeout(() => setSavedFlash(false), 2500)
  }

  const handleUnmarkNoTrade = async () => {
    setSaving(true)
    await save({
      date: status.date,
      sentiment,
      no_trade_day: false,
      no_trade_reason: '',
    })
    setEditing(false)
    setSaving(false)
  }

  const handleSetSentiment = async (next: number | null) => {
    await save({
      date: status.date,
      sentiment: next,
      no_trade_day: status.meta.no_trade_day,
      no_trade_reason: status.meta.no_trade_reason,
    })
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
          quoteNonce={quoteNonce}
          noTradeDaysThisMonth={noTradeDaysThisMonth}
          onEdit={() => setEditing(true)}
          onJournal={() => navigate('/journal')}
          onSetSentiment={handleSetSentiment}
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
          onJournal={() => navigate('/journal')}
          onSetSentiment={handleSetSentiment}
        />
      )}
    </SessionCardShell>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────

function SessionCardShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Today's session"
      data-tour="today-session"
      className="rounded-lg border border-border-subtle bg-bg-2 p-4 shadow-sm"
    >
      {children}
    </section>
  )
}

// ── Completed view ───────────────────────────────────────────────────────

function CompletedView({
  status,
  quoteNonce,
  noTradeDaysThisMonth,
  onEdit,
  onJournal,
  onSetSentiment,
  savedFlash,
}: {
  status: TodaySessionStatus
  quoteNonce: number
  noTradeDaysThisMonth: number
  onEdit: () => void
  onJournal: () => void
  onSetSentiment: (v: number | null) => void
  savedFlash: boolean
}) {
  // Pick a quote each time the nonce changes (save → completed re-entry).
  // Persist the picked id so a fresh tab doesn't repeat the same one.
  const quote = useMemo<TradingQuote>(() => {
    const ctx = contextFor({
      status: status.status,
      netPnL: status.stats?.netPnL ?? null,
      hasJournalEntry: status.hasJournalEntry,
    })
    const last = readLastQuoteId()
    const picked = pickQuoteForContext(ctx, last, quoteNonce)
    writeLastQuoteId(picked.id)
    return picked
  }, [quoteNonce, status.status, status.stats, status.hasJournalEntry])

  const summary = buildSummaryLine(status)
  const badge = badgeForCommittedStatus(status)
  const sentiment = status.meta.sentiment

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4">
      {/* Left — header */}
      <header className="flex shrink-0 flex-col lg:w-[260px]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Today's session
        </span>
        <span className="mt-0.5 text-lg font-semibold tracking-tight text-fg-primary">
          {longDate(status.date)}
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
            <span className="text-[10px] uppercase tracking-wider text-win">
              Saved
            </span>
          )}
        </div>
      </header>

      {/* Center — summary + quote */}
      <div className="flex-1 border-t border-border-subtle/60 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <div className="text-sm text-fg-secondary">{summary}</div>
        <QuoteCard quote={quote} />
      </div>

      {/* Right — sentiment + journal + edit */}
      <aside className="flex shrink-0 flex-col gap-2 border-t border-border-subtle/60 pt-3 lg:w-[200px] lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
          Market sentiment
        </span>
        {sentiment != null ? (
          <SentimentBadge value={sentiment} onClear={() => onSetSentiment(null)} />
        ) : (
          <SentimentRow value={null} onChange={onSetSentiment} />
        )}
        <button
          type="button"
          onClick={onJournal}
          className="mt-auto inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
        >
          <NotebookPen size={12} strokeWidth={2} />
          Open journal
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-7 cursor-pointer items-center justify-center gap-1 self-end text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-gold"
        >
          <Pencil size={11} strokeWidth={2} />
          Edit
        </button>
      </aside>
    </div>
  )
}

function buildSummaryLine(status: TodaySessionStatus): React.ReactNode {
  if (status.status === 'active' && status.stats != null) {
    const s = status.stats
    const netTone =
      s.netPnL > 0 ? 'text-win' : s.netPnL < 0 ? 'text-loss' : 'text-fg-primary'
    const grossTone =
      s.grossPnL > 0 ? 'text-win' : s.grossPnL < 0 ? 'text-loss' : 'text-fg-primary'
    // v0.1.5: fees are always shown — even $0 — so the user knows it's a
    // tracked line item. Zero reads as `text-fg-secondary` (de-emphasized);
    // any actual fee burden reads as `text-fg-primary` so the user notices.
    const feesTone = s.totalFees > 0 ? 'text-fg-primary' : 'text-fg-secondary'
    const wr = s.winRate == null ? '—' : `${Math.round(s.winRate * 100)}% win rate`
    return (
      <>
        <span className="text-fg-primary tnum">{s.trades}</span>{' '}
        {s.trades === 1 ? 'trade' : 'trades'} ·{' '}
        <span className={`tnum ${grossTone}`}>Gross {signed(s.grossPnL)}</span>{' '}
        · <span className={`tnum ${feesTone}`}>Fees {money(s.totalFees)}</span>{' '}
        · <span className={`font-medium tnum ${netTone}`}>Net {signed(s.netPnL)}</span>{' '}
        · <span className="text-fg-secondary tnum">{wr}</span>
        {s.bestTrade && (
          <>
            {' · '}
            <span className="text-fg-tertiary tnum">
              best {s.bestTrade.symbol} {money(s.bestTrade.pnl)}
            </span>
          </>
        )}
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

// ── Quote card ───────────────────────────────────────────────────────────

function QuoteCard({ quote }: { quote: TradingQuote }) {
  return (
    <figure className="mt-3 rounded-md border-l-2 border-gold/60 bg-bg-3 px-3 py-2 transition-colors">
      <blockquote className="font-serif text-[13px] italic leading-snug text-fg-secondary">
        “{quote.text}”
      </blockquote>
      <figcaption className="mt-1 flex items-center gap-1.5 text-xs tracking-wider text-fg-tertiary">
        <Sparkles size={10} strokeWidth={2} className="text-gold/70" />
        {quote.author}
      </figcaption>
    </figure>
  )
}

// ── Sentiment badge (set state, single chip with clear-on-click) ─────────

function SentimentBadge({
  value,
  onClear,
}: {
  value: number
  onClear: () => void
}) {
  const safe = value as 1 | 2 | 3 | 4 | 5
  const tone =
    value <= 2
      ? 'border-win/40 bg-win/[0.10] text-win'
      : value === 3
        ? 'border-gold/40 bg-gold/[0.10] text-gold'
        : 'border-loss/40 bg-loss/[0.10] text-loss'
  return (
    <button
      type="button"
      onClick={onClear}
      title={`Sentiment ${value}/5 — ${SENTIMENT_LABELS[safe]}. Click to clear.`}
      data-tour="sentiment"
      className={`inline-flex h-7 cursor-pointer items-center gap-2 self-start rounded-md border px-2 font-mono text-xs ${tone}`}
    >
      <span className="font-semibold">{value}/5</span>
      <span className="text-[10px] opacity-80">{SENTIMENT_LABELS[safe]}</span>
    </button>
  )
}

// ── Editable view (existing input flows) ─────────────────────────────────

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
  onJournal,
  onSetSentiment,
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
  onJournal: () => void
  onSetSentiment: (v: number | null) => void
}) {
  const sentiment = status.meta.sentiment
  // The form opens automatically when status is no-trade (already marked
  // but user wants to edit) OR when `editing` is set explicitly from the
  // not-started prompt.
  const showForm = editing || (status.status === 'no-trade' && !status.committed)

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4">
      {/* Left — header */}
      <header className="flex shrink-0 flex-col lg:w-[260px]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Today's session
        </span>
        <span className="mt-0.5 text-lg font-semibold tracking-tight text-fg-primary">
          {longDate(status.date)}
        </span>
        <div className="mt-2 flex items-center gap-2">
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
      </header>

      {/* Center — form or empty prompt */}
      <div className="flex-1 border-t border-border-subtle/60 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
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
          <NotStartedPrompt
            onMarkNoTrade={onMarkNoTrade}
            onOpenJournal={onJournal}
          />
        )}
      </div>

      {/* Right — sentiment + journal */}
      <aside className="flex shrink-0 flex-col gap-2 border-t border-border-subtle/60 pt-3 lg:w-[200px] lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
          Market sentiment
        </span>
        <SentimentRow value={sentiment} onChange={onSetSentiment} />
        <button
          type="button"
          onClick={onJournal}
          className="mt-auto inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
        >
          <NotebookPen size={12} strokeWidth={2} />
          Add journal entry
        </button>
      </aside>
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
  onOpenJournal,
}: {
  onMarkNoTrade: () => void
  onOpenJournal: () => void
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
        <button
          type="button"
          onClick={onOpenJournal}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
        >
          <NotebookPen size={12} strokeWidth={2} />
          Add journal entry
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
        placeholder="Market choppy, no clean setups · Sat out, sentiment 5 · FOMC day"
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

function SentimentRow({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  const levels: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5]
  return (
    <div className="flex items-center gap-1" data-tour="sentiment">
      {levels.map((n) => {
        const active = value === n
        const tone =
          n <= 2
            ? 'border-win/40 text-win hover:border-win'
            : n === 3
              ? 'border-gold/40 text-gold hover:border-gold'
              : 'border-loss/40 text-loss hover:border-loss'
        const activeBg =
          n <= 2 ? 'bg-win/[0.15]' : n === 3 ? 'bg-gold/[0.15]' : 'bg-loss/[0.12]'
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(active ? null : n)}
            aria-pressed={active}
            title={`Sentiment ${n}/5 — ${SENTIMENT_LABELS[n]}`}
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border font-mono text-xs font-semibold transition-colors duration-150 ${tone} ${active ? activeBg : 'bg-transparent'}`}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}
