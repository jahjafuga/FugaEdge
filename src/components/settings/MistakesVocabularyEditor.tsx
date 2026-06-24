import { useCallback, useEffect, useState } from 'react'
import {
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import { ipc } from '@/lib/ipc'
import type { MistakeAxis, MistakeDef } from '@shared/mistakes-types'

// SELF-CONTAINED + RELOCATABLE (the DnaSettingsSection precedent): this section
// owns its OWN load (ipc.mistakeDefsGet) and its OWN writes (the schema-34
// mistake_def CRUD client fns). It does NOT touch the Settings page's shared
// editor / snapshot / handleSave. The future Settings remodel moves this ONE file
// + the ONE <MistakesVocabularyEditor /> line as a unit. Renderer UI + IPC only —
// no DB access (ARCHITECTURE #1).
//
// Two axis panels (Technical | Psychological) over the mistake_def vocabulary.
// Reorder is up/down arrows (no dnd dependency); rename is click-to-edit inline
// (the RuleList idiom); the remove control is driven by the SERVER-SIDE delete
// guard's RESULT (hard-delete only a custom, unreferenced row — otherwise archive).
// Feedback is inline (the app convention — no toast).

const AXES: { axis: MistakeAxis; label: string }[] = [
  { axis: 'technical', label: 'Technical' },
  { axis: 'psychological', label: 'Psychological' },
]

type Feedback = {
  tone: 'error' | 'note'
  axis: MistakeAxis | null // panel-scoped (create / reorder / archive note)
  id: number | null // row-scoped (rename / unarchive / delete)
  text: string
}

// IPC errors arrive wrapped ("Error invoking remote method '...': Error: <msg>").
// Surface just the repo's message.
function errText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  const i = m.lastIndexOf('Error: ')
  return i >= 0 ? m.slice(i + 7) : m
}

export default function MistakesVocabularyEditor() {
  const [defs, setDefs] = useState<MistakeDef[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [drafts, setDrafts] = useState<Record<MistakeAxis, string>>({
    technical: '',
    psychological: '',
  })
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false) // reorder in-flight (arrows disabled)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  // Load (re-loads when "Show archived" toggles — the only time we need archived).
  useEffect(() => {
    let cancelled = false
    ipc
      .mistakeDefsGet(showArchived)
      .then((all) => {
        if (!cancelled) {
          setDefs(all)
          setErr(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(errText(e))
      })
    return () => {
      cancelled = true
    }
  }, [showArchived])

  const activeOf = useCallback(
    (axis: MistakeAxis) =>
      (defs ?? [])
        .filter((d) => d.axis === axis && !d.is_archived)
        .sort((a, b) => a.sort_position - b.sort_position),
    [defs],
  )
  const archivedOf = useCallback(
    (axis: MistakeAxis) =>
      (defs ?? [])
        .filter((d) => d.axis === axis && d.is_archived)
        .sort((a, b) => a.sort_position - b.sort_position),
    [defs],
  )

  // ── reorder (arrows) ──
  const move = async (axis: MistakeAxis, id: number, dir: 'up' | 'down') => {
    if (busy) return
    const active = activeOf(axis)
    const idx = active.findIndex((d) => d.id === id)
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= active.length) return
    const reordered = active.slice()
    ;[reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]]
    const ordered_ids = reordered.map((d) => d.id)
    setBusy(true)
    setFeedback(null)
    try {
      const updated = await ipc.mistakeDefsReorder({ axis, ordered_ids })
      // `updated` is this axis's ACTIVE rows in new order; keep the other axis +
      // this axis's archived rows untouched.
      setDefs((prev) => [
        ...(prev ?? []).filter((d) => !(d.axis === axis && !d.is_archived)),
        ...updated,
      ])
    } catch (e) {
      setFeedback({ tone: 'error', axis, id: null, text: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  // ── rename (inline) ──
  const startEdit = (d: MistakeDef) => {
    setConfirmingId(null)
    setFeedback(null)
    setEditingId(d.id)
    setEditingValue(d.name)
  }
  const commitRename = async (d: MistakeDef) => {
    const name = editingValue.trim()
    if (!name || name === d.name) {
      setEditingId(null)
      return
    }
    try {
      const updated = await ipc.mistakeDefRename({ id: d.id, name })
      setDefs((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)))
      setEditingId(null)
      setFeedback(null)
    } catch (e) {
      // Keep the input open so the user can fix the duplicate.
      setFeedback({ tone: 'error', axis: null, id: d.id, text: errText(e) })
    }
  }

  // ── add ──
  const addDraft = async (axis: MistakeAxis) => {
    const name = (drafts[axis] ?? '').trim()
    if (!name) return
    try {
      const created = await ipc.mistakeDefCreate({ axis, name })
      setDefs((prev) => [...(prev ?? []), created])
      setDrafts((prev) => ({ ...prev, [axis]: '' }))
      setFeedback(null)
    } catch (e) {
      setFeedback({ tone: 'error', axis, id: null, text: errText(e) })
    }
  }

  // ── remove (single confirm; guard decides delete vs archive via the result) ──
  const confirmRemove = async (d: MistakeDef) => {
    setConfirmingId(null)
    try {
      const result = await ipc.mistakeDefDelete({ id: d.id })
      if (result.deleted) {
        setDefs((prev) => (prev ?? []).filter((x) => x.id !== d.id))
        setFeedback(null)
      } else {
        // Archived instead — mark archived in place (drops out of the active list;
        // visible under "Show archived").
        setDefs((prev) =>
          (prev ?? []).map((x) => (x.id === d.id ? { ...x, is_archived: true } : x)),
        )
        setFeedback({
          tone: 'note',
          axis: d.axis,
          id: null,
          text: `“${d.name}” was kept in your history — it's a default or it's on existing trades.`,
        })
      }
    } catch (e) {
      setFeedback({ tone: 'error', axis: null, id: d.id, text: errText(e) })
    }
  }

  // ── un-archive ──
  const unarchive = async (d: MistakeDef) => {
    try {
      const updated = await ipc.mistakeDefUnarchive({ id: d.id })
      setDefs((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)))
      setFeedback(null)
    } catch (e) {
      setFeedback({ tone: 'error', axis: null, id: d.id, text: errText(e) })
    }
  }

  const rowFeedback = (id: number) =>
    feedback && feedback.id === id ? <FeedbackLine fb={feedback} /> : null

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Mistakes
          </div>
          <div className="mt-1 text-sm text-fg-secondary">
            Your two-axis mistake vocabulary. Rename, reorder, add your own, or remove
            — defaults and trade-tagged mistakes are archived, not deleted.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="shrink-0 rounded-sm border border-border-subtle px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-gold hover:text-gold"
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

      {err && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-sm text-fg-secondary"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-loss">
            Couldn't load mistakes
          </span>
          <span>{err}</span>
        </div>
      )}

      {defs === null && !err && (
        <div className="text-sm text-fg-tertiary">Loading mistakes…</div>
      )}

      {defs !== null && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {AXES.map(({ axis, label }) => {
            const active = activeOf(axis)
            const archived = archivedOf(axis)
            return (
              <Card
                key={axis}
                title={label}
                hover={false}
                right={
                  <span className="font-mono tnum text-fg-secondary">
                    {active.length}
                  </span>
                }
              >
                <div className="space-y-2">
                  {active.length === 0 ? (
                    <div className="rounded-md border border-border-subtle/60 bg-bg-1/40 px-3 py-3 text-center text-xs text-fg-tertiary">
                      No mistakes on this axis yet — add one below.
                    </div>
                  ) : (
                    <ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border-subtle/60 bg-bg-1/40">
                      {active.map((d, i) => (
                        <li key={d.id} className="px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col">
                              <button
                                type="button"
                                aria-label={`Move ${d.name} up`}
                                disabled={i === 0 || busy}
                                onClick={() => move(axis, d.id, 'up')}
                                className="flex h-3.5 w-4 items-center justify-center text-fg-tertiary transition-colors hover:text-gold disabled:opacity-25 disabled:hover:text-fg-tertiary"
                              >
                                <ChevronUp size={12} strokeWidth={2.5} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Move ${d.name} down`}
                                disabled={i === active.length - 1 || busy}
                                onClick={() => move(axis, d.id, 'down')}
                                className="flex h-3.5 w-4 items-center justify-center text-fg-tertiary transition-colors hover:text-gold disabled:opacity-25 disabled:hover:text-fg-tertiary"
                              >
                                <ChevronDown size={12} strokeWidth={2.5} />
                              </button>
                            </div>

                            {editingId === d.id ? (
                              <input
                                autoFocus
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    void commitRename(d)
                                  } else if (e.key === 'Escape') {
                                    setEditingId(null)
                                    setFeedback(null)
                                  }
                                }}
                                onBlur={() => void commitRename(d)}
                                className="flex-1 rounded-sm border border-transparent bg-transparent px-2 py-1 text-sm text-fg-primary focus:border-gold focus:outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEdit(d)}
                                title="Click to rename"
                                className="flex-1 truncate px-2 py-1 text-left text-sm text-fg-primary transition-colors hover:text-gold"
                              >
                                {d.name}
                              </button>
                            )}

                            {confirmingId === d.id ? (
                              <div className="flex shrink-0 items-center gap-1 text-[11px]">
                                <span className="text-fg-tertiary">Remove?</span>
                                <button
                                  type="button"
                                  onClick={() => void confirmRemove(d)}
                                  className="rounded-sm border border-loss/40 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-loss transition-colors hover:bg-loss/10"
                                >
                                  Yes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingId(null)}
                                  className="rounded-sm border border-border-subtle px-1.5 py-0.5 uppercase tracking-wider text-fg-tertiary transition-colors hover:border-border"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Remove ${d.name}`}
                                onClick={() => {
                                  setFeedback(null)
                                  setEditingId(null)
                                  setConfirmingId(d.id)
                                }}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border-subtle text-fg-tertiary transition-colors duration-150 hover:border-loss hover:text-loss"
                              >
                                <Trash2 size={13} strokeWidth={2} />
                              </button>
                            )}
                          </div>
                          {rowFeedback(d.id)}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-1 px-3 py-2 focus-within:border-gold">
                    <Plus size={12} strokeWidth={2.5} className="text-fg-tertiary" />
                    <input
                      value={drafts[axis]}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [axis]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void addDraft(axis)
                        }
                      }}
                      placeholder="Add a mistake (press Enter)"
                      className="flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void addDraft(axis)}
                      disabled={!drafts[axis].trim()}
                      className="rounded-sm border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      add
                    </button>
                  </div>

                  {feedback && feedback.axis === axis && feedback.id === null && (
                    <FeedbackLine fb={feedback} />
                  )}

                  {showArchived && archived.length > 0 && (
                    <div className="pt-1">
                      <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                        Archived
                      </div>
                      <ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border-subtle/40 bg-bg-1/20">
                        {archived.map((d) => (
                          <li key={d.id} className="px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <span className="flex-1 truncate px-2 text-sm text-fg-tertiary">
                                {d.name}
                              </span>
                              <button
                                type="button"
                                aria-label={`Restore ${d.name}`}
                                onClick={() => void unarchive(d)}
                                className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-gold hover:text-gold"
                              >
                                <ArchiveRestore size={11} strokeWidth={2} />
                                restore
                              </button>
                            </div>
                            {rowFeedback(d.id)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FeedbackLine({ fb }: { fb: Feedback }) {
  const isErr = fb.tone === 'error'
  return (
    <div
      role={isErr ? 'alert' : undefined}
      className={`mt-1 px-1 text-[11px] ${isErr ? 'text-loss' : 'text-fg-tertiary'}`}
    >
      {fb.text}
    </div>
  )
}
