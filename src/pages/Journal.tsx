import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import EmotionPicker from '@/components/ui/EmotionPicker'
import JournalHeader from '@/components/journal/JournalHeader'
import DayPnlBanner from '@/components/journal/DayPnlBanner'
import RuleChecklist from '@/components/journal/RuleChecklist'
import { activeRules, splitRuleMarks, type RuleState } from '@/core/journal/rules'
import SentimentIconPicker from '@/components/sentiment/SentimentIconPicker'
import VoiceRecorder from '@/components/voice/VoiceRecorder'
import IntradayPnLChart from '@/components/charts/IntradayPnLChart'
import { ipc } from '@/lib/ipc'
import { mmss, wordCount } from '@/lib/format'
import { extractTopics, type TopicCategory } from '@/core/topics/extract'
import { CURATED_TERMS } from '@/core/topics/terms'
import type { JournalDay, SaveJournalInput } from '@shared/journal-types'
import type { TradeListRow } from '@shared/trades-types'

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

interface EditorState {
  premarket: string
  postsession: string
  emotion: number | null
  rules: Record<string, RuleState>
  premarketDuration: number | null
  postsessionDuration: number | null
}

function emptyEditor(): EditorState {
  return {
    premarket: '',
    postsession: '',
    emotion: null,
    rules: {},
    premarketDuration: null,
    postsessionDuration: null,
  }
}

function editorFrom(day: JournalDay | null): EditorState {
  if (!day || !day.entry) return emptyEditor()
  const rules: Record<string, RuleState> = {}
  for (const r of day.entry.rules_followed) rules[r] = 'followed'
  for (const r of day.entry.rule_violations) rules[r] = 'violated'
  return {
    premarket: day.entry.premarket_notes,
    postsession: day.entry.postsession_notes,
    emotion: day.entry.emotion_rating,
    rules,
    premarketDuration: day.entry.premarket_recording_duration ?? null,
    postsessionDuration: day.entry.postsession_recording_duration ?? null,
  }
}

function isDirty(saved: EditorState, current: EditorState): boolean {
  if (saved.premarket !== current.premarket) return true
  if (saved.postsession !== current.postsession) return true
  if (saved.emotion !== current.emotion) return true
  if (saved.premarketDuration !== current.premarketDuration) return true
  if (saved.postsessionDuration !== current.postsessionDuration) return true
  const allKeys = new Set([...Object.keys(saved.rules), ...Object.keys(current.rules)])
  for (const k of allKeys) {
    if ((saved.rules[k] ?? 'neutral') !== (current.rules[k] ?? 'neutral')) return true
  }
  return false
}

const AUTOSAVE_DEBOUNCE_MS = 1500

// Build the journalSave payload from an editor snapshot. Pure — shared by the
// debounced save and the flush-on-navigate path so the two can't drift.
function buildSaveInput(snapshot: EditorState, date: string): SaveJournalInput {
  // Save marks BY ID, including ids for rules no longer in the active checklist
  // (archived rules' history) — splitRuleMarks is the re-orphan guard, so
  // re-saving a day never drops an archived rule's mark.
  const { followed: rules_followed, violated: rule_violations } = splitRuleMarks(
    snapshot.rules,
  )
  return {
    date,
    premarket_notes: snapshot.premarket,
    postsession_notes: snapshot.postsession,
    emotion_rating: snapshot.emotion,
    rules_followed,
    rule_violations,
    premarket_recording_duration: snapshot.premarketDuration ?? undefined,
    postsession_recording_duration: snapshot.postsessionDuration ?? undefined,
  }
}

// Inline recording metadata under each field: the recording length (m:ss, only
// when a clip exists) + the whole-field word count (only when there's text),
// joined by "·". Renders nothing for an empty field (honest empty state).
function RecordingMeta({
  text,
  durationSeconds,
}: {
  text: string
  durationSeconds: number | null
}) {
  const words = wordCount(text)
  const parts: string[] = []
  if (typeof durationSeconds === 'number' && durationSeconds > 0) {
    parts.push(mmss(durationSeconds))
  }
  if (words > 0) parts.push(`${words} ${words === 1 ? 'word' : 'words'}`)
  if (parts.length === 0) return null
  return <div className="text-[11px] tabular-nums text-fg-muted">{parts.join(' · ')}</div>
}

// Neutral chip styling — no win/loss colours. Tickers render monospaced (they
// are symbols); setups and curated terms share the same calm treatment. This is
// a reflection of what the entry mentions, not a scoreboard.
function topicChipClass(category: TopicCategory): string {
  const base =
    'rounded-full border border-border bg-bg-1 px-2.5 py-0.5 text-[11px] text-fg-secondary'
  return category === 'ticker' ? `${base} font-mono tabular-nums` : base
}

// Honest, derive-live topic chips for the current entry. Pure local matching
// (src/core/topics) against the day's traded tickers, the user's setup names,
// and the curated term list — no model, no API, no network, no save. Renders
// nothing when the entry mentions none of them (honest empty state).
function EntryTopics({
  text,
  tickers,
  setups,
}: {
  text: string
  tickers: string[]
  setups: string[]
}) {
  const topics = useMemo(
    () => extractTopics(text, { tickers, setups, terms: CURATED_TERMS }),
    [text, tickers, setups],
  )
  if (topics.length === 0) return null
  return (
    <div className="space-y-2 rounded-lg border border-border bg-bg-1 px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
        Topics in this entry
      </span>
      <div className="flex flex-wrap gap-1.5">
        {topics.map((t) => (
          <span key={`${t.category}-${t.term}`} className={topicChipClass(t.category)}>
            {t.term}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Journal() {
  const today = useMemo(todayISO, [])
  const [date, setDate] = useState(today)
  const [day, setDay] = useState<JournalDay | null>(null)
  // Trades for the journal date — used to render the intraday P&L curve at
  // the top of the entry. Fetched lazily on date change; null while loading,
  // [] when there were no trades that day.
  const [dayTrades, setDayTrades] = useState<TradeListRow[] | null>(null)
  // Setup names from the playbook library — the "setup" half of the topic
  // vocabulary. Date-independent, so loaded once on mount; tolerates failure
  // (empty vocab just means no setup chips, never an error).
  const [setupNames, setSetupNames] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState>(emptyEditor())
  const [savedSnapshot, setSavedSnapshot] = useState<EditorState>(emptyEditor())
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState(false)

  // Latest values for the flush-on-navigate / unmount path (no stale closures).
  const editorRef = useRef(editor)
  editorRef.current = editor
  const savedSnapshotRef = useRef(savedSnapshot)
  savedSnapshotRef.current = savedSnapshot
  const dayRef = useRef(day)
  dayRef.current = day
  // The exact snapshot of the last save attempt — holds off auto-retry on a
  // standing error until the user edits again (avoids a tight retry loop).
  const lastAttemptRef = useRef<EditorState | null>(null)

  useEffect(() => {
    let cancelled = false
    setDay(null)
    setDayTrades(null)
    setSavedAt(null)
    // Journal payload (notes / rules / emotion) and the day's trades load in
    // parallel — they're independent and the chart shouldn't gate on the
    // notes fetch.
    ipc
      .journalGet(date)
      .then((d) => {
        if (cancelled) return
        setDay(d)
        const e = editorFrom(d)
        setEditor(e)
        setSavedSnapshot(e)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    ipc
      .tradesList({ date })
      .then((list) => {
        if (!cancelled) setDayTrades(list)
      })
      .catch(() => {
        if (!cancelled) setDayTrades([])
      })
    return () => {
      cancelled = true
      // Flush a pending edit for THIS date before reload / on unmount, so the
      // last sub-debounce window isn't silently lost (the old manual-save gap).
      // Fire-and-forget — no setState (the component is reloading / unmounting).
      const d = dayRef.current
      if (d && isDirty(savedSnapshotRef.current, editorRef.current)) {
        ipc.journalSave(buildSaveInput(editorRef.current, date)).catch(() => {})
      }
    }
  }, [date])

  // Load setup names once for the topic vocabulary (read-only; never blocks the
  // page). The playbook library is global, so this is independent of the date.
  useEffect(() => {
    let cancelled = false
    ipc
      .playbooksList()
      .then((list) => {
        if (!cancelled) setSetupNames(list.map((p) => p.name))
      })
      .catch(() => {
        if (!cancelled) setSetupNames([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Memoised so the topic matcher doesn't re-run on every keystroke for a
  // value that only changes when the day's trades reload.
  const dayTickers = useMemo(() => dayTrades?.map((t) => t.symbol) ?? [], [dayTrades])

  // NO-REHYDRATE save: persist a snapshot, then advance the saved baseline ONLY.
  // It NEVER calls setEditor/setDay from the response — rehydrating would clobber
  // keystrokes typed during the async save (silent data loss). If the editor
  // moved on, it stays dirty and the debounce simply saves again.
  const save = useCallback(
    async (snapshot: EditorState) => {
      if (!day) return
      setSaving(true)
      setSaveError(false)
      try {
        await ipc.journalSave(buildSaveInput(snapshot, date))
        setSavedSnapshot(snapshot)
        setSavedAt(Date.now())
      } catch {
        setSaveError(true) // leave the baseline un-advanced → still dirty → retries
      } finally {
        setSaving(false)
      }
    },
    [day, date],
  )

  const setRuleState = useCallback((rule: string, next: RuleState) => {
    setEditor((prev) => ({
      ...prev,
      rules: { ...prev.rules, [rule]: next },
    }))
  }, [])

  // Debounced auto-save: ~1.5s after edits stop, persist dirty state — each edit
  // resets the timer. Gated on !saving (no overlapping saves); when a save ends
  // with the editor still dirty, this re-runs and reschedules. After a failed
  // save it holds off until the user edits again (lastAttemptRef), so a
  // persistent failure doesn't become a tight retry loop.
  useEffect(() => {
    if (!day || saving) return
    if (!isDirty(savedSnapshot, editor)) return
    if (saveError && lastAttemptRef.current === editor) return
    const t = setTimeout(() => {
      lastAttemptRef.current = editor
      void save(editor)
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [editor, savedSnapshot, day, saving, saveError, save])

  const dirty = isDirty(savedSnapshot, editor)

  if (err) {
    return (
      <PageShell title="Journal" subtitle="Pre-market plan, post-session debrief, rule scoring.">
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary">
          <AlertCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-loss">
              Failed to load journal
            </div>
            <div className="mt-1">{err}</div>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell title="Journal" subtitle="Pre-market plan, post-session debrief, rule scoring.">
      <div className="space-y-5">
        <JournalHeader
          date={date}
          onPrev={() => setDate(addDays(date, -1))}
          onNext={() => setDate(addDays(date, 1))}
          onToday={() => setDate(today)}
          onDateChange={setDate}
          isToday={date === today}
        />

        {!day ? (
          <div className="space-y-5">
            <Skeleton className="h-[64px] border border-border" />
            <Skeleton className="h-[160px] border border-border" />
            <Skeleton className="h-[160px] border border-border" />
            <Skeleton className="h-[220px] border border-border" />
          </div>
        ) : (
          <>
            <DayPnlBanner summary={day.summary} />

            <Card
              title="Market sentiment"
              subtitle="How was the overall market environment today? Drives the by-sentiment Analytics breakdown."
            >
              <SentimentIconPicker
                value={day.sentiment}
                showLabels
                iconSize={30}
                onChange={(next) => {
                  // Optimistic — flip the local payload immediately so the
                  // selector stays in sync without waiting for the IPC round
                  // trip. The next journalGet on date change will re-hydrate.
                  setDay((prev) => (prev ? { ...prev, sentiment: next } : prev))
                  ipc.sessionSentimentSave({ date, sentiment: next }).catch(() => {
                    // Silent — non-critical. The Calendar/Analytics will reflect
                    // the correct value on next fetch.
                  })
                }}
              />
            </Card>

            {dayTrades && dayTrades.length > 0 && (
              <IntradayPnLChart trades={dayTrades} date={date} />
            )}

            <Card title="Premarket plan" subtitle="Setup, thesis, levels, risk plan.">
              <div className="space-y-3">
                <VoiceRecorder
                  onTranscript={(t) =>
                    setEditor((p) => ({
                      ...p,
                      premarket: p.premarket ? `${p.premarket}\n${t}` : t,
                    }))
                  }
                  onDuration={(s) =>
                    setEditor((p) => ({
                      ...p,
                      premarketDuration: (p.premarketDuration ?? 0) + s,
                    }))
                  }
                />
                <textarea
                  value={editor.premarket}
                  onChange={(e) => setEditor({ ...editor, premarket: e.target.value })}
                  rows={6}
                  placeholder="What are you watching today? What's the plan if it triggers?"
                  className="w-full resize-y rounded-md border border-border-strong bg-bg-1 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-tertiary outline-none transition-colors duration-150 focus:border-gold"
                />
                <RecordingMeta text={editor.premarket} durationSeconds={editor.premarketDuration} />
              </div>
            </Card>

            <Card title="Post-session debrief" subtitle="What worked. What didn't. What to fix tomorrow.">
              <div className="space-y-3">
                <VoiceRecorder
                  onTranscript={(t) =>
                    setEditor((p) => ({
                      ...p,
                      postsession: p.postsession ? `${p.postsession}\n${t}` : t,
                    }))
                  }
                  onDuration={(s) =>
                    setEditor((p) => ({
                      ...p,
                      postsessionDuration: (p.postsessionDuration ?? 0) + s,
                    }))
                  }
                />
                <textarea
                  value={editor.postsession}
                  onChange={(e) => setEditor({ ...editor, postsession: e.target.value })}
                  rows={6}
                  placeholder="Mistakes, lessons, what to do differently next session."
                  className="w-full resize-y rounded-md border border-border-strong bg-bg-1 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-tertiary outline-none transition-colors duration-150 focus:border-gold"
                />
                <RecordingMeta text={editor.postsession} durationSeconds={editor.postsessionDuration} />
              </div>
            </Card>

            <EntryTopics
              text={`${editor.premarket}\n${editor.postsession}`}
              tickers={dayTickers}
              setups={setupNames}
            />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
              <Card title="Rules" subtitle="Mark each as followed (✓) or violated (✗). Leave blank if not applicable.">
                <RuleChecklist
                  rules={activeRules(day.rules)}
                  states={editor.rules}
                  onChange={setRuleState}
                />
                {(() => {
                  // Read-only history: marks on rules that are now archived (e.g.
                  // resurrected orphans) stay visible even though they're off the
                  // active checklist — the recovered history, made visible.
                  const archivedMarked = day.rules.filter(
                    (r) =>
                      r.archived &&
                      (editor.rules[r.id] === 'followed' ||
                        editor.rules[r.id] === 'violated'),
                  )
                  if (archivedMarked.length === 0) return null
                  return (
                    <div className="mt-3 rounded-md border border-border-subtle/60 bg-bg-1/40 px-4 py-3">
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                        Archived rules marked this day
                      </div>
                      <ul className="space-y-1">
                        {archivedMarked.map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center justify-between text-sm text-fg-secondary"
                          >
                            <span>{r.name}</span>
                            <span
                              className={
                                editor.rules[r.id] === 'followed' ? 'text-win' : 'text-loss'
                              }
                            >
                              {editor.rules[r.id] === 'followed' ? 'Followed' : 'Violated'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })()}
              </Card>

              <Card title="Emotion" subtitle="How was the headspace? 1 = awful, 5 = great.">
                <EmotionPicker
                  value={editor.emotion}
                  onChange={(next) => setEditor({ ...editor, emotion: next })}
                />
              </Card>
            </div>

            {/* Auto-save status — replaces the manual Save button. Saves fire
                ~1.5s after edits stop; this line is the reassurance. */}
            <div className="flex h-9 items-center justify-end gap-2 text-[11px]">
              {saving ? (
                <span className="flex items-center gap-1.5 text-fg-muted">
                  <Loader2 size={12} className="animate-spin" />
                  Saving…
                </span>
              ) : saveError ? (
                <span className="flex items-center gap-2 text-loss">
                  <AlertCircle size={12} strokeWidth={2} />
                  <span>Couldn&apos;t save</span>
                  <button
                    type="button"
                    onClick={() => void save(editor)}
                    className="cursor-pointer rounded border border-loss/40 px-2 py-0.5 font-medium transition-colors hover:bg-loss/10"
                  >
                    Retry
                  </button>
                </span>
              ) : dirty ? (
                <span className="text-fg-muted">Unsaved changes…</span>
              ) : savedAt ? (
                <span className="flex items-center gap-1.5 uppercase tracking-wider text-win">
                  <Check size={12} strokeWidth={2.5} />
                  Saved
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
