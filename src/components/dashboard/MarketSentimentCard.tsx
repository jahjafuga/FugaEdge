import { useCallback, useEffect, useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { todayDateISO } from '@/core/session/today'
import { SENTIMENT_LABELS } from '@shared/session-types'
import SentimentIconPicker from '@/components/sentiment/SentimentIconPicker'

// MARKET SENTIMENT CARD — the standalone dashboard widget for the trader's
// daily 1..5 market read (snowflake/ice → fire). Self-contained: reads today's
// pick via ipc.sessionGet and writes via ipc.sessionSentimentSave (the same
// sentiment-only path the Journal/Calendar surfaces use), with optimistic
// local state. NO useTodaySession dependency — sentiment has ONE owner now:
// this card. The CARD background tints cold→hot to the active level; an unset
// day is an honest neutral card, never a fake default pick.
//
// The 1→5 icon ladder is the shared <SentimentIconPicker> (the same component
// the Journal page uses). The card keeps ONLY its tint + data fetch; the picker
// markup + icon imports live in the shared component.

type Level = 1 | 2 | 3 | 4 | 5

// Per-level card tint — a flat low-alpha background + border that transitions
// smoothly cold→hot (transition-colors, NOT the radial card-glow which can't
// animate). Alpha ramps UP toward the hot end so each step reads as a distinct
// intensity; the orange-3 → soft-red-4 step gets a clear density + hue jump (3
// is a true orange with almost no blue; 4 is the pinker --loss at higher alpha)
// so clicking 3 then 4 feels like a step, not a nudge.
// CSS vars: --info (icy blue) · --neutral (gray) · --sentiment-3 (true orange,
// net-new) · --loss (soft red) · --danger (deep red).
const TINT: Record<Level, { bg: string; border: string }> = {
  1: { bg: 'rgb(var(--info) / 0.09)', border: 'rgb(var(--info) / 0.32)' },
  2: { bg: 'rgb(var(--neutral) / 0.09)', border: 'rgb(var(--neutral) / 0.30)' },
  3: { bg: 'rgb(var(--sentiment-3) / 0.12)', border: 'rgb(var(--sentiment-3) / 0.40)' },
  4: { bg: 'rgb(var(--loss) / 0.16)', border: 'rgb(var(--loss) / 0.48)' },
  5: { bg: 'rgb(var(--danger) / 0.20)', border: 'rgb(var(--danger) / 0.58)' },
}

export default function MarketSentimentCard() {
  const today = useMemo(() => todayDateISO(), [])
  const [sentiment, setSentiment] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Own fetch-on-mount — independent of useTodaySession.
  useEffect(() => {
    let cancelled = false
    ipc
      .sessionGet(today)
      .then((meta) => {
        if (!cancelled) {
          setSentiment(meta?.sentiment ?? null)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [today])

  // Persist the picker's chosen level (the picker already handles tap-to-clear
  // → null). Optimistic; re-read the persisted truth on failure so the UI
  // never lies.
  const persist = useCallback(
    (next: number | null) => {
      setSentiment(next)
      ipc.sessionSentimentSave({ date: today, sentiment: next }).catch(() => {
        ipc
          .sessionGet(today)
          .then((m) => setSentiment(m?.sentiment ?? null))
          .catch(() => {})
      })
    },
    [today],
  )

  const active = sentiment != null ? (sentiment as Level) : null
  const tint = active ? TINT[active] : undefined

  return (
    <section
      aria-label="Market sentiment"
      data-tour="market-sentiment"
      className="card-premium flex flex-col gap-3 p-4 transition-colors duration-300"
      style={tint ? { backgroundColor: tint.bg, borderColor: tint.border } : undefined}
    >
      {/* Header — eyebrow + info affordance (matches the dashboard card idiom). */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Market sentiment
        </span>
        <span
          className="flex h-4 w-4 cursor-help items-center justify-center text-fg-muted transition-colors duration-150 hover:text-fg-secondary"
          title="Your read on today's market — 1 (thin tape, no runners) to 5 (3+ stocks up >100%). Tap a level to log it; tap it again to clear."
        >
          <Info size={13} strokeWidth={2} />
        </span>
      </div>

      {/* The 1→5 icon ladder (cold→hot) — shared with the Journal page. */}
      <SentimentIconPicker value={sentiment} onChange={persist} iconSize={36} />

      {/* Active label / honest empty prompt. */}
      <div className="min-h-[16px] text-center text-xs">
        {loading ? (
          <span className="text-fg-muted">Loading…</span>
        ) : active ? (
          <span className="text-fg-secondary">
            <span className="font-semibold text-fg-primary">{active}/5</span>
            {' · '}
            {SENTIMENT_LABELS[active]}
          </span>
        ) : (
          <span className="text-fg-muted">Tap a level to log today's market read.</span>
        )}
      </div>
    </section>
  )
}
