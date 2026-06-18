import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import EmotionPicker from '@/components/ui/EmotionPicker'
import JournalHeader from '@/components/journal/JournalHeader'
import DayPnlBanner from '@/components/journal/DayPnlBanner'
import RuleChecklist, { type RuleState } from '@/components/journal/RuleChecklist'
import SentimentIconPicker from '@/components/sentiment/SentimentIconPicker'
import VoiceRecorder from '@/components/voice/VoiceRecorder'
import IntradayPnLChart from '@/components/charts/IntradayPnLChart'
import { ipc } from '@/lib/ipc'
import type { JournalDay } from '@shared/journal-types'
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

export default function Journal() {
  const today = useMemo(todayISO, [])
  const [date, setDate] = useState(today)
  const [day, setDay] = useState<JournalDay | null>(null)
  // Trades for the journal date — used to render the intraday P&L curve at
  // the top of the entry. Fetched lazily on date change; null while loading,
  // [] when there were no trades that day.
  const [dayTrades, setDayTrades] = useState<TradeListRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState>(emptyEditor())
  const [savedSnapshot, setSavedSnapshot] = useState<EditorState>(emptyEditor())
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

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
    }
  }, [date])

  const handleSave = useCallback(async () => {
    if (saving || !day) return
    setSaving(true)
    try {
      const rules_followed: string[] = []
      const rule_violations: string[] = []
      for (const rule of day.rules) {
        const state = editor.rules[rule] ?? 'neutral'
        if (state === 'followed') rules_followed.push(rule)
        else if (state === 'violated') rule_violations.push(rule)
      }
      const updated = await ipc.journalSave({
        date,
        premarket_notes: editor.premarket,
        postsession_notes: editor.postsession,
        emotion_rating: editor.emotion,
        rules_followed,
        rule_violations,
        premarket_recording_duration: editor.premarketDuration ?? undefined,
        postsession_recording_duration: editor.postsessionDuration ?? undefined,
      })
      setDay(updated)
      const next = editorFrom(updated)
      setEditor(next)
      setSavedSnapshot(next)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }, [saving, day, editor, date])

  const setRuleState = useCallback((rule: string, next: RuleState) => {
    setEditor((prev) => ({
      ...prev,
      rules: { ...prev.rules, [rule]: next },
    }))
  }, [])

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
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
              <Card title="Rules" subtitle="Mark each as followed (✓) or violated (✗). Leave blank if not applicable.">
                <RuleChecklist
                  rules={day.rules}
                  states={editor.rules}
                  onChange={setRuleState}
                />
              </Card>

              <Card title="Emotion" subtitle="How was the headspace? 1 = awful, 5 = great.">
                <EmotionPicker
                  value={editor.emotion}
                  onChange={(next) => setEditor({ ...editor, emotion: next })}
                />
              </Card>
            </div>

            <div className="flex items-center justify-end gap-3">
              {savedAt && !dirty && (
                <span className="text-[10px] uppercase tracking-wider text-win">
                  saved
                </span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="inline-flex h-9 cursor-pointer items-center rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save journal entry'}
              </button>
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
