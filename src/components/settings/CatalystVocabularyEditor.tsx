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
import type { CatalystDef } from '@shared/catalyst-types'

// SELF-CONTAINED + RELOCATABLE (the MistakesVocabularyEditor precedent): this
// section owns its OWN load (ipc.catalystDefsGet) and its OWN writes (the schema-35
// catalyst_def CRUD client fns). It does NOT touch the Settings page's shared
// editor / snapshot / handleSave. The future Settings remodel moves this ONE file
// + the ONE <CatalystVocabularyEditor /> line as a unit. Renderer UI + IPC only —
// no DB access (ARCHITECTURE #1).
//
// A single flat list over the catalyst_def vocabulary (no axis — catalyst is one
// list, unlike the two-axis mistakes editor this clones). Reorder is up/down arrows
// (no dnd dependency); rename is click-to-edit inline (the RuleList idiom); the
// remove control is driven by the SERVER-SIDE delete guard's RESULT (hard-delete
// only a custom, unused row — otherwise archive). Feedback is inline (no toast).

type Feedback = {
  tone: 'error' | 'note'
  id: number | null // row-scoped (rename / unarchive / delete); null = panel-level
  text: string
}

// IPC errors arrive wrapped ("Error invoking remote method '...': Error: <msg>").
// Surface just the repo's message.
function errText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  const i = m.lastIndexOf('Error: ')
  return i >= 0 ? m.slice(i + 7) : m
}

export default function CatalystVocabularyEditor() {
  const [defs, setDefs] = useState<CatalystDef[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [draft, setDraft] = useState('')
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false) // reorder in-flight (arrows disabled)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  // Load (re-loads when "Show archived" toggles — the only time we need archived).
  useEffect(() => {
    let cancelled = false
    ipc
      .catalystDefsGet(showArchived)
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

  const activeDefs = useCallback(
    () =>
      (defs ?? [])
        .filter((d) => !d.is_archived)
        .sort((a, b) => a.sort_position - b.sort_position),
    [defs],
  )
  const archivedDefs = useCallback(
    () =>
      (defs ?? [])
        .filter((d) => d.is_archived)
        .sort((a, b) => a.sort_position - b.sort_position),
    [defs],
  )

  // ── reorder (arrows) ──
  const move = async (id: number, dir: 'up' | 'down') => {
    if (busy) return
    const active = activeDefs()
    const idx = active.findIndex((d) => d.id === id)
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= active.length) return
    const reordered = active.slice()
    ;[reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]]
    const ordered_ids = reordered.map((d) => d.id)
    setBusy(true)
    setFeedback(null)
    try {
      const updated = await ipc.catalystDefsReorder({ ordered_ids })
      // `updated` is the FULL active list in new order (catalyst reorder returns
      // listCatalystDefs(), not a per-axis slice). Keep the archived rows from
      // prev, replace ALL active rows with the returned list.
      setDefs((prev) => [...(prev ?? []).filter((d) => d.is_archived), ...updated])
    } catch (e) {
      setFeedback({ tone: 'error', id: null, text: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  // ── rename (inline) ──
  const startEdit = (d: CatalystDef) => {
    setConfirmingId(null)
    setFeedback(null)
    setEditingId(d.id)
    setEditingValue(d.name)
  }
  const commitRename = async (d: CatalystDef) => {
    const name = editingValue.trim()
    if (!name || name === d.name) {
      setEditingId(null)
      return
    }
    try {
      const updated = await ipc.catalystDefRename({ id: d.id, name })
      setDefs((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)))
      setEditingId(null)
      setFeedback(null)
    } catch (e) {
      // Keep the input open so the user can fix the duplicate.
      setFeedback({ tone: 'error', id: d.id, text: errText(e) })
    }
  }

  // ── add ──
  const addDraft = async () => {
    const name = draft.trim()
    if (!name) return
    try {
      const created = await ipc.catalystDefCreate({ name })
      setDefs((prev) => [...(prev ?? []), created])
      setDraft('')
      setFeedback(null)
    } catch (e) {
      setFeedback({ tone: 'error', id: null, text: errText(e) })
    }
  }

  // ── remove (single confirm; guard decides delete vs archive via the result) ──
  const confirmRemove = async (d: CatalystDef) => {
    setConfirmingId(null)
    try {
      const result = await ipc.catalystDefDelete({ id: d.id })
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
          id: null,
          text: `“${d.name}” was kept in your history — it’s a default or it’s used on trades.`,
        })
      }
    } catch (e) {
      setFeedback({ tone: 'error', id: d.id, text: errText(e) })
    }
  }

  // ── un-archive ──
  const unarchive = async (d: CatalystDef) => {
    try {
      const updated = await ipc.catalystDefUnarchive({ id: d.id })
      setDefs((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)))
      setFeedback(null)
    } catch (e) {
      setFeedback({ tone: 'error', id: d.id, text: errText(e) })
    }
  }

  const rowFeedback = (id: number) =>
    feedback && feedback.id === id ? <FeedbackLine fb={feedback} /> : null

  const active = activeDefs()
  const archived = archivedDefs()

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Catalysts
          </div>
          <div className="mt-1 text-sm text-fg-secondary">
            Your catalyst vocabulary. Rename, reorder, add your own, or remove
            — defaults and catalysts used on trades are archived, not deleted.
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
            Couldn't load catalysts
          </span>
          <span>{err}</span>
        </div>
      )}

      {defs === null && !err && (
        <div className="text-sm text-fg-tertiary">Loading catalysts…</div>
      )}

      {defs !== null && (
        <Card
          title="Catalyst type"
          hover={false}
          right={
            <span className="font-mono tnum text-fg-secondary">{active.length}</span>
          }
        >
          <div className="space-y-2">
            {active.length === 0 ? (
              <div className="rounded-md border border-border-subtle/60 bg-bg-1/40 px-3 py-3 text-center text-xs text-fg-tertiary">
                No catalysts yet — add one below.
              </div>
            ) : (
              <ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border-subtle/60 bg-bg-1/40">
                {active.map((d, i) => (
                  <li key={d.id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          aria-label={`Move ${d.name} up`}
                          disabled={i === 0 || busy}
                          onClick={() => move(d.id, 'up')}
                          className="flex h-3.5 w-4 items-center justify-center text-fg-tertiary transition-colors hover:text-gold disabled:opacity-25 disabled:hover:text-fg-tertiary"
                        >
                          <ChevronUp size={12} strokeWidth={2.5} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${d.name} down`}
                          disabled={i === active.length - 1 || busy}
                          onClick={() => move(d.id, 'down')}
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
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void addDraft()
                  }
                }}
                placeholder="Add a catalyst (press Enter)"
                className="flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void addDraft()}
                disabled={!draft.trim()}
                className="rounded-sm border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
              >
                add
              </button>
            </div>

            {feedback && feedback.id === null && <FeedbackLine fb={feedback} />}

            {showArchived && archived.length > 0 && (
              <div className="pt-1">
                <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                  Archived
                </div>
                <ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border-subtle/40 bg-bg-1/20">
                  {archived.map((d) => (
                    <li key={d.id} className="px-3 py-2">
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
