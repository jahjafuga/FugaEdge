import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { longDate } from '@/lib/format'
import type { JournalDay } from '@shared/journal-types'

interface NoTradeDayModalProps {
  date: string
  onClose: () => void
  onSaved: () => void
}

// Preset reasons. The "Other" path swaps in a free-text input. Saved as
// `Sat out: <reason>` on the journal row's postsession_notes; the
// `no-trade-day` chip on day_tags is the cheap lookup signal for "this
// day was an intentional sit-out".
// The stored label must stay in sync with the calendar-cell holiday mark:
// handleSave writes "Sat out: Holiday (Market Closed)" to postsession_notes, and
// electron/calendar/get.ts LIKE-matches that exact label to flag is_holiday so
// the day cell renders the closed sign. Keep all three spellings identical.
const HOLIDAY_REASON = 'Holiday (Market Closed)'

const REASONS = [
  'Market was choppy',
  'No setups',
  HOLIDAY_REASON,
  'No plan',
  'Sick or unwell',
  'Personal time',
] as const

const NO_TRADE_TAG = 'no-trade-day'
const STORED_PREFIX = 'Sat out: '

function extractReason(text: string | undefined | null): string | null {
  if (!text) return null
  const trimmed = text.trim()
  if (!trimmed.startsWith(STORED_PREFIX)) return null
  return trimmed.slice(STORED_PREFIX.length).trim() || null
}

export default function NoTradeDayModal({
  date,
  onClose,
  onSaved,
}: NoTradeDayModalProps) {
  const [reason, setReason] = useState<string>('')
  const [otherText, setOtherText] = useState<string>('')
  const [existing, setExisting] = useState<JournalDay | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Whether the open day is CURRENTLY a no-trade-day via EITHER store — the
  // calendar day's no_trade_day is the OR of the journal.day_tags chip and
  // session_meta.no_trade_day (electron/calendar/get.ts). Drives the Remove
  // affordance; priorTags carries the day's existing tags so a remove strips
  // only the chip and preserves the rest.
  const [isNoTradeDay, setIsNoTradeDay] = useState(false)
  const [priorTags, setPriorTags] = useState<string[]>([])

  // Load the existing journal (to pre-select the user's last answer if they're
  // editing) AND the calendar day (to know whether the day is already a
  // no-trade-day, via either store, and what other day_tags it carries).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    Promise.all([
      ipc.journalGet(date),
      ipc.calendarGet(Number(date.slice(0, 4)), Number(date.slice(5, 7))),
    ])
      .then(([j, month]) => {
        if (cancelled) return
        setExisting(j)
        const prior = extractReason(j.entry?.postsession_notes)
        if (prior) {
          if ((REASONS as readonly string[]).includes(prior)) {
            setReason(prior)
            setOtherText('')
          } else {
            setReason('Other')
            setOtherText(prior)
          }
        }
        const day = month.days.find((d) => d.date === date)
        setIsNoTradeDay(day?.no_trade_day ?? false)
        setPriorTags(day?.day_tags ?? [])
        setLoading(false)
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
  }, [date])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const finalReason =
    reason === 'Other' ? otherText.trim() : reason.trim()
  const canSave = finalReason.length > 0 && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setErr(null)
    try {
      // Preserve any pre-existing journal fields (premarket plan, emotion,
      // etc.) — we only own postsession_notes + the no-trade-day tag.
      const entry = existing?.entry
      const rulesFollowed = entry?.rules_followed ?? []
      const ruleViolations = entry?.rule_violations ?? []
      await ipc.journalSave({
        date,
        premarket_notes: entry?.premarket_notes ?? '',
        postsession_notes: `${STORED_PREFIX}${finalReason}`,
        emotion_rating: entry?.emotion_rating ?? null,
        rules_followed: rulesFollowed,
        rule_violations: ruleViolations,
      })

      // Make sure the no-trade-day tag is set without removing whatever
      // tags the user already had on this date.
      const priorTags = await ipc
        .calendarGet(
          Number(date.slice(0, 4)),
          Number(date.slice(5, 7)),
        )
        .then((m) => m.days.find((d) => d.date === date)?.day_tags ?? [])
        .catch(() => [] as string[])
      const tags = priorTags.includes(NO_TRADE_TAG)
        ? priorTags
        : [...priorTags, NO_TRADE_TAG]
      await ipc.dayTagsSave({ date, tags })

      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // Remove — fully un-mark the day. Clears BOTH stores (the journal.day_tags
  // chip AND session_meta.no_trade_day) plus the "Sat out:" reason note, while
  // preserving every OTHER day_tag and any unrelated journal text. A NEW action,
  // separate from the affirmative Mark-sit-out save above.
  const handleRemove = async () => {
    if (saving) return
    setSaving(true)
    setErr(null)
    try {
      // 1. day_tags — strip ONLY the chip; preserve the rest (mirrors the add
      //    path's preserve logic, NEVER a blind []). Skip when there's no chip
      //    (e.g. a session_meta-only sit-out) so day_tags is left untouched.
      if (priorTags.includes(NO_TRADE_TAG)) {
        await ipc.dayTagsSave({
          date,
          tags: priorTags.filter((t) => t !== NO_TRADE_TAG),
        })
      }
      // 2. session_meta — clear the flag + reason (reuses the dashboard's own
      //    setter with false). Safe no-op when the day was never flagged there.
      await ipc.sessionNoTradeSave({
        date,
        no_trade_day: false,
        no_trade_reason: '',
      })
      // 3. reason note — blank ONLY the "Sat out:" line; leave a genuine
      //    post-session note (a session_meta-only day) and every other journal
      //    field intact. journalSave is a full-row upsert, so the preserved
      //    fields are passed back explicitly (the Mark-sit-out precedent).
      const entry = existing?.entry
      if ((entry?.postsession_notes ?? '').trim().startsWith(STORED_PREFIX)) {
        await ipc.journalSave({
          date,
          premarket_notes: entry?.premarket_notes ?? '',
          postsession_notes: '',
          emotion_rating: entry?.emotion_rating ?? null,
          rules_followed: entry?.rules_followed ?? [],
          rule_violations: entry?.rule_violations ?? [],
        })
      }

      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="no-trade-day-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-1/85 p-6 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-md border border-border-subtle bg-bg-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between border-b border-border-subtle/60 px-5 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
              Sit-out day
            </div>
            <div
              id="no-trade-day-title"
              className="mt-0.5 text-base font-medium text-fg-primary"
            >
              {longDate(date)}
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

        <div className="space-y-4 px-5 py-4">
          <div className="text-sm text-fg-primary">
            Did you sit out today? Why?
          </div>

          {loading ? (
            <div className="text-xs text-fg-tertiary">Loading existing entry…</div>
          ) : (
            <div className="flex flex-col gap-2">
              {REASONS.map((r) => (
                <ReasonButton
                  key={r}
                  label={r}
                  active={reason === r}
                  onClick={() => setReason(r)}
                />
              ))}
              <ReasonButton
                label="Other"
                active={reason === 'Other'}
                onClick={() => setReason('Other')}
              />
              {reason === 'Other' && (
                <textarea
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="What kept you out of the market today?"
                  className="mt-1 w-full resize-y rounded-sm border border-border-subtle bg-bg-1 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted focus:border-gold focus:outline-none"
                />
              )}
            </div>
          )}

          {err && (
            <div className="rounded-md border border-loss/40 bg-loss/[0.08] p-2 text-xs text-loss">
              {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-border-subtle/40 pt-4">
            {/* Remove — only when the day is already a no-trade-day (either
                store). mr-auto pushes it to the far left, away from the
                affirmative Cancel / Mark-sit-out cluster. */}
            {isNoTradeDay && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={saving}
                className="mr-auto rounded-md border border-loss/50 px-3 py-1.5 text-xs text-loss transition-colors duration-150 hover:border-loss hover:bg-loss/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove no-trade-day
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-fg-secondary transition-colors duration-150 hover:border-muted hover:text-fg-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-md bg-gold px-4 py-1.5 text-xs font-medium text-accent-ink transition-all duration-150 hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Mark sit-out'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReasonButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors duration-150 ${
        active
          ? 'border-gold/60 bg-gold/[0.10] text-gold'
          : 'border-border-subtle bg-bg-1/40 text-fg-primary hover:border-gold/40 hover:text-gold'
      }`}
    >
      <span>{label}</span>
      {active && <Check size={13} strokeWidth={2.5} />}
    </button>
  )
}
