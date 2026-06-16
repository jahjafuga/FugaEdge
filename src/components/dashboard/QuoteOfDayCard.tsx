import { useMemo } from 'react'
import { Sparkles, Clock } from 'lucide-react'
import { signed } from '@/lib/format'
import { todayDateISO } from '@/core/session/today'
import { quoteForDate, type DayContext } from '@/core/quotes/tradingQuotes'

// QUOTE OF THE DAY — standalone dashboard widget. The quote is DAY-PINNED:
// quoteForDate(today, ctx) is deterministic, so the same calendar day always
// shows the same quote (stable across reloads/saves), rolling the next day —
// unlike the old in-monolith picker which re-rolled on every save/remount.
//
// Attribution is the REAL author (the pool has no house lines), never a
// fabricated "Coach". The "+$X Today" badge is today's net P&L (passed from
// the Dashboard, which already computes it).
//
// Data approach: PURE — no fetch. The only inputs are `todayPnl` (prop) and the
// calendar date. Context is derived from the P&L sign (winning / losing /
// mixed) — a deliberate simplification of the monolith's full contextFor
// (which also distinguished no-trade / journal-only from the day's status); a
// standalone widget only has todayPnl, so those collapse to 'mixed'. Quote
// flavour by P&L is enough for a daily quote and keeps the widget fetch-free.

/** ~200 wpm reading estimate, floored — these are short (<25-word) quotes, so
 *  this lands at a few seconds. Honest (derived from the actual text), not a
 *  hardcoded "5 sec". */
function readSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(3, Math.round(words / 3.3))
}

export default function QuoteOfDayCard({ todayPnl }: { todayPnl: number }) {
  const today = useMemo(() => todayDateISO(), [])
  const ctx: DayContext = todayPnl > 0 ? 'winning' : todayPnl < 0 ? 'losing' : 'mixed'
  const quote = useMemo(() => quoteForDate(today, ctx), [today, ctx])
  const sec = readSeconds(quote.text)

  const badgeTone =
    todayPnl > 0
      ? 'border-win/40 bg-win/[0.10] text-win'
      : todayPnl < 0
        ? 'border-loss/40 bg-loss/[0.10] text-loss'
        : 'border-border-subtle bg-bg-3 text-fg-tertiary'

  return (
    <section
      aria-label="Quote of the day"
      data-tour="quote-of-day"
      className="card-premium flex flex-col gap-3 p-4"
    >
      {/* Header — eyebrow + today's P&L badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Quote of the day
        </span>
        <span
          className={`inline-flex items-baseline gap-1 rounded-md border px-2 py-0.5 ${badgeTone}`}
          title="Today's net P&L"
        >
          <span className="font-mono text-xs font-semibold tnum">{signed(todayPnl)}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80">Today</span>
        </span>
      </div>

      {/* The day-pinned quote */}
      <blockquote
        className="flex-1 font-serif italic text-fg-primary/90"
        style={{ fontSize: '18px', lineHeight: 1.5 }}
      >
        <span className="mr-0.5 align-[-0.05em] text-[22px] leading-none text-gold">“</span>
        {quote.text}
        <span className="ml-0.5 align-[-0.05em] text-[22px] leading-none text-gold">”</span>
      </blockquote>

      {/* Footer — real author + honest read time */}
      <div className="flex items-center justify-between gap-2 border-t border-border-subtle/60 pt-2">
        <span
          className="flex items-center gap-1.5 font-sans text-fg-secondary"
          style={{ fontSize: '13px' }}
        >
          <Sparkles size={11} strokeWidth={2} className="text-gold" />
          {quote.author}
        </span>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-fg-tertiary">
          <Clock size={11} strokeWidth={2} />
          Read time ~{sec} sec
        </span>
      </div>
    </section>
  )
}
