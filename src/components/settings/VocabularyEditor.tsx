import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from 'lucide-react'
import Card from '@/components/ui/Card'

// Shared vocabulary editor — the row state machine + chrome extracted verbatim
// from the (former) twin MistakesVocabularyEditor / CatalystVocabularyEditor.
// PURE React/presentation: it takes its data + the six CRUD ops + copy as PROPS;
// it does NOT import electron/fs/sqlite or call ipc.* — the CALLER owns the ipc
// wiring and passes the operations in. The component speaks a neutral `groupKey`;
// the caller's adapter translates that to the real shape (Mistakes adds an axis,
// Catalyst drops it), which is where the axis-vs-no-axis divergence is absorbed.
// SaaS-portable: a future web port swaps the caller's ipc for fetch, this file
// is untouched.

/** A vocabulary row, normalized: the grouping key (`group`) is the Mistakes axis
 *  or null for a single-list editor like Catalyst. */
export interface VocabDef {
  id: number
  name: string
  sort_position: number
  is_archived: boolean
  group: string | null
}

export interface VocabGroup {
  /** null for a single-list editor; the axis key for a grouped one. */
  key: string | null
  /** The per-group Card title (e.g. "Technical" / "Catalyst type"). */
  label: string
}

export interface VocabOperations {
  defsGet: (includeArchived: boolean) => Promise<VocabDef[]>
  create: (input: { groupKey: string | null; name: string }) => Promise<VocabDef>
  rename: (input: { id: number; name: string }) => Promise<VocabDef>
  reorder: (input: { groupKey: string | null; ordered_ids: number[] }) => Promise<VocabDef[]>
  delete: (input: { id: number }) => Promise<{ deleted: boolean; archivedInstead: boolean }>
  unarchive: (input: { id: number }) => Promise<VocabDef>
}

export interface VocabCopy {
  /** Section eyebrow (e.g. "Mistakes"); also drives the load / error nouns. */
  label: string
  description: string
  addPlaceholder: string
  /** The exact "kept in history" note shown when a delete archives instead. */
  keptInHistoryNote: (name: string) => string
  /** The note shown when a delete really DID hard-delete. The repo's guard permits that
   *  only for a custom entry with zero usages — a correct outcome, but it used to happen
   *  in total silence, so the row simply vanished and read as data loss. Neither branch
   *  of the delete may be wordless. */
  permanentlyRemovedNote: (name: string) => string
}

interface VocabularyEditorProps {
  groups: VocabGroup[]
  operations: VocabOperations
  copy: VocabCopy
}

type Feedback = {
  tone: 'error' | 'note'
  groupKey: string | null // panel-scoped (create / reorder / archive note)
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

// Drafts are keyed per group; normalize a null key to a stable string.
const draftKey = (k: string | null): string => k ?? '__default__'

export default function VocabularyEditor({ groups, operations, copy }: VocabularyEditorProps) {
  const [defs, setDefs] = useState<VocabDef[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((g) => [draftKey(g.key), ''])),
  )
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false) // reorder in-flight (arrows disabled)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const noun = copy.label.toLowerCase()

  // Load (re-loads when "Show archived" toggles — the only time we need archived).
  // operations is stable (callers build it module-level), so this fires only on
  // mount + showArchived, mirroring the original single-dep effect.
  useEffect(() => {
    let cancelled = false
    operations
      .defsGet(showArchived)
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
  }, [showArchived, operations])

  const activeOf = useCallback(
    (groupKey: string | null) =>
      (defs ?? [])
        .filter((d) => d.group === groupKey && !d.is_archived)
        .sort((a, b) => a.sort_position - b.sort_position),
    [defs],
  )
  const archivedOf = useCallback(
    (groupKey: string | null) =>
      (defs ?? [])
        .filter((d) => d.group === groupKey && d.is_archived)
        .sort((a, b) => a.sort_position - b.sort_position),
    [defs],
  )

  // ── reorder (arrows) ──
  const move = async (groupKey: string | null, id: number, dir: 'up' | 'down') => {
    if (busy) return
    const active = activeOf(groupKey)
    const idx = active.findIndex((d) => d.id === id)
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= active.length) return
    const reordered = active.slice()
    ;[reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]]
    const ordered_ids = reordered.map((d) => d.id)
    setBusy(true)
    setFeedback(null)
    try {
      const updated = await operations.reorder({ groupKey, ordered_ids })
      // Replace THIS group's active slice; keep other groups + this group's
      // archived. For a single null-key group this degenerates to "replace all
      // active" (the Catalyst behavior).
      setDefs((prev) => [
        ...(prev ?? []).filter((d) => !(d.group === groupKey && !d.is_archived)),
        ...updated,
      ])
    } catch (e) {
      setFeedback({ tone: 'error', groupKey, id: null, text: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  // ── rename (inline) ──
  const startEdit = (d: VocabDef) => {
    setConfirmingId(null)
    setFeedback(null)
    setEditingId(d.id)
    setEditingValue(d.name)
  }
  const commitRename = async (d: VocabDef) => {
    const name = editingValue.trim()
    if (!name || name === d.name) {
      setEditingId(null)
      return
    }
    try {
      const updated = await operations.rename({ id: d.id, name })
      setDefs((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)))
      setEditingId(null)
      setFeedback(null)
    } catch (e) {
      // Keep the input open so the user can fix the duplicate.
      setFeedback({ tone: 'error', groupKey: null, id: d.id, text: errText(e) })
    }
  }

  // ── add ──
  const addDraft = async (groupKey: string | null) => {
    const name = (drafts[draftKey(groupKey)] ?? '').trim()
    if (!name) return
    try {
      const created = await operations.create({ groupKey, name })
      setDefs((prev) => [...(prev ?? []), created])
      setDrafts((prev) => ({ ...prev, [draftKey(groupKey)]: '' }))
      setFeedback(null)
    } catch (e) {
      setFeedback({ tone: 'error', groupKey, id: null, text: errText(e) })
    }
  }

  // ── remove (single confirm; guard decides delete vs archive via the result) ──
  //
  // The SERVER decides. The repo's guard hard-deletes only a custom entry with zero usages
  // and archives everything else, and the renderer cannot predict which: VocabDef carries no
  // is_custom and no usage count, and no repo/IPC exposes one. So the outcome is reported
  // AFTER the fact, from the { deleted, archivedInstead } result — and BOTH branches must
  // report it. The delete branch used to setFeedback(null), which is why a correct, guarded
  // removal looked like the row had silently vanished.
  const confirmRemove = async (d: VocabDef) => {
    setConfirmingId(null)
    try {
      const result = await operations.delete({ id: d.id })
      if (result.deleted) {
        // Really gone (custom + unused). Say so — this is the branch that used to be silent.
        setDefs((prev) => (prev ?? []).filter((x) => x.id !== d.id))
        setFeedback({
          tone: 'note',
          groupKey: d.group,
          id: null,
          text: copy.permanentlyRemovedNote(d.name),
        })
      } else {
        // Archived instead — mark archived in place (drops out of the active list;
        // visible under "Show archived").
        setDefs((prev) =>
          (prev ?? []).map((x) => (x.id === d.id ? { ...x, is_archived: true } : x)),
        )
        setFeedback({
          tone: 'note',
          groupKey: d.group,
          id: null,
          text: copy.keptInHistoryNote(d.name),
        })
      }
    } catch (e) {
      setFeedback({ tone: 'error', groupKey: null, id: d.id, text: errText(e) })
    }
  }

  // ── un-archive ──
  const unarchive = async (d: VocabDef) => {
    try {
      const updated = await operations.unarchive({ id: d.id })
      setDefs((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)))
      setFeedback(null)
    } catch (e) {
      setFeedback({ tone: 'error', groupKey: null, id: d.id, text: errText(e) })
    }
  }

  const rowFeedback = (id: number) =>
    feedback && feedback.id === id ? <FeedbackLine fb={feedback} /> : null

  const renderGroup = (group: VocabGroup): ReactNode => {
    const active = activeOf(group.key)
    const archived = archivedOf(group.key)
    return (
      <Card
        key={draftKey(group.key)}
        title={group.label}
        hover={false}
        right={<span className="font-mono tnum text-fg-secondary">{active.length}</span>}
      >
        <div className="space-y-2">
          {active.length === 0 ? (
            <div className="rounded-md border border-border-subtle/60 bg-bg-1/40 px-3 py-3 text-center text-xs text-fg-tertiary">
              No {noun} {groups.length > 1 ? 'on this axis yet' : 'yet'} — add one below.
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
                        onClick={() => move(group.key, d.id, 'up')}
                        className="flex h-3.5 w-4 items-center justify-center text-fg-tertiary transition-colors hover:text-gold disabled:opacity-25 disabled:hover:text-fg-tertiary"
                      >
                        <ChevronUp size={12} strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${d.name} down`}
                        disabled={i === active.length - 1 || busy}
                        onClick={() => move(group.key, d.id, 'down')}
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
              value={drafts[draftKey(group.key)] ?? ''}
              onChange={(e) =>
                setDrafts((prev) => ({ ...prev, [draftKey(group.key)]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addDraft(group.key)
                }
              }}
              placeholder={copy.addPlaceholder}
              className="flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void addDraft(group.key)}
              disabled={!(drafts[draftKey(group.key)] ?? '').trim()}
              className="rounded-sm border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              add
            </button>
          </div>

          {feedback && feedback.id === null && feedback.groupKey === group.key && (
            <FeedbackLine fb={feedback} />
          )}

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
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            {copy.label}
          </div>
          <div className="mt-1 text-sm text-fg-secondary">{copy.description}</div>
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
            Couldn't load {noun}
          </span>
          <span>{err}</span>
        </div>
      )}

      {defs === null && !err && (
        <div className="text-sm text-fg-tertiary">Loading {noun}…</div>
      )}

      {defs !== null &&
        (groups.length > 1 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{groups.map(renderGroup)}</div>
        ) : (
          renderGroup(groups[0])
        ))}
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
