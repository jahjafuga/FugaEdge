import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import type { TradeListRow } from '@shared/trades-types'
import type { MistakeAxis, MistakeDef, MistakeTag } from '@shared/mistakes-types'

interface TradeMistakePickerProps {
  trade: TradeListRow
}

// The two axes render top-to-bottom in this fixed order (the modal is narrow —
// stacked, never side-by-side). Labelled headers only, no per-axis colour-coding
// (mirrors MistakesVocabularyEditor's restraint).
const AXES: { axis: MistakeAxis; label: string }[] = [
  { axis: 'technical', label: 'Technical' },
  { axis: 'psychological', label: 'Psychological' },
]

// Beat 2c — the per-trade two-axis mistake picker (the trade_mistake junction).
// Adapted from ConfluenceTags: load the trade's tags + the active vocabulary, then
// add/remove a tag per click and re-fetch the tag set for a clean refresh. The repo
// dual-writes trades.mistakes_json behind tradeMistakeTagAdd/Remove, so this picker
// is purely junction-facing and the existing mistakes_json readers stay correct.
// Self-contained + relocatable — it moves into the future Trades remodel as a unit.
export default function TradeMistakePicker({ trade }: TradeMistakePickerProps) {
  const [tags, setTags] = useState<MistakeTag[] | null>(null)
  const [defs, setDefs] = useState<MistakeDef[] | null>(null)
  const [busy, setBusy] = useState(false)

  // The trade's current tags — reloads when the trade changes. May include a
  // since-archived def (history is preserved), which is why it can carry tags the
  // active add-list below won't offer.
  useEffect(() => {
    let cancelled = false
    ipc
      .tradeMistakeTagsGet(trade.id)
      .then((t) => {
        if (!cancelled) setTags(t)
      })
      .catch(() => {
        if (!cancelled) setTags([])
      })
    return () => {
      cancelled = true
    }
  }, [trade.id])

  // The active vocabulary for the add dropdowns (loaded once). Archived defs are
  // excluded by mistakeDefsGet, so they never appear as something to add.
  useEffect(() => {
    let cancelled = false
    ipc
      .mistakeDefsGet()
      .then((d) => {
        if (!cancelled) setDefs(d)
      })
      .catch(() => {
        if (!cancelled) setDefs([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refetchTags = useCallback(async () => {
    setTags(await ipc.tradeMistakeTagsGet(trade.id))
  }, [trade.id])

  const addTag = useCallback(
    async (mistakeDefId: number) => {
      if (busy) return
      setBusy(true)
      try {
        await ipc.tradeMistakeTagAdd({ trade_id: trade.id, mistake_def_id: mistakeDefId })
        await refetchTags()
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [busy, trade.id, refetchTags],
  )

  const removeTag = useCallback(
    async (mistakeDefId: number) => {
      if (busy) return
      setBusy(true)
      try {
        await ipc.tradeMistakeTagRemove({ trade_id: trade.id, mistake_def_id: mistakeDefId })
        await refetchTags()
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [busy, trade.id, refetchTags],
  )

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Mistakes
        </div>
        <p className="mt-1 text-sm text-fg-secondary">
          Tag what went wrong — these roll up in Analytics → Psychology.
        </p>
      </div>

      {AXES.map(({ axis, label }) => (
        <AxisBlock
          key={axis}
          axis={axis}
          label={label}
          tags={tags}
          defs={defs}
          busy={busy}
          onAdd={addTag}
          onRemove={removeTag}
        />
      ))}
    </div>
  )
}

// One axis: a labelled header, the trade's tags for that axis as removable chips, and
// a "+ Add" dropdown of that axis's active, not-yet-tagged defs. Each AxisBlock owns
// its OWN open-state + ref, so the two dropdowns are fully independent (opening one
// never touches the other). Click-outside + Escape mirror ConfluenceTags/PlaybookPicker.
function AxisBlock({
  axis,
  label,
  tags,
  defs,
  busy,
  onAdd,
  onRemove,
}: {
  axis: MistakeAxis
  label: string
  tags: MistakeTag[] | null
  defs: MistakeDef[] | null
  busy: boolean
  onAdd: (mistakeDefId: number) => void
  onRemove: (mistakeDefId: number) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const axisTags = (tags ?? []).filter((t) => t.axis === axis)
  const taggedIds = new Set(axisTags.map((t) => t.id))
  // Active defs for this axis the trade isn't already carrying. (defs is active-only,
  // so an archived-but-tagged def is correctly absent here yet still a chip above.)
  const available = (defs ?? []).filter((d) => d.axis === axis && !taggedIds.has(d.id))

  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {axisTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-fg-secondary"
          >
            <span>{tag.name}</span>
            <button
              type="button"
              onClick={() => onRemove(tag.id)}
              disabled={busy}
              aria-label={`Remove ${tag.name}`}
              className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-fg-tertiary transition-colors hover:text-red disabled:opacity-40"
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          </span>
        ))}

        {/* + Add — dropdown mirroring ConfluenceTags' mechanics, scoped to this axis. */}
        <div ref={wrapRef} className="relative inline-flex">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={busy}
            aria-label={`Add ${label} mistake`}
            className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-subtle transition-colors duration-150 hover:border-gold/40 hover:text-gold disabled:opacity-40"
          >
            <Plus size={11} strokeWidth={2.5} />
            <span>Add</span>
            {open ? (
              <ChevronUp size={11} strokeWidth={2} />
            ) : (
              <ChevronDown size={11} strokeWidth={2} />
            )}
          </button>
          {open && (
            <div className="absolute left-0 top-full z-30 mt-1 max-h-[240px] w-[240px] overflow-auto rounded-md border border-white/[0.08] bg-bg/95 p-1 shadow-lg backdrop-blur">
              {!defs && <div className="px-2 py-2 text-[10px] text-muted">Loading…</div>}
              {defs && available.length === 0 && (
                <div className="px-2 py-2 text-[10px] text-muted">
                  {axisTags.length > 0 ? 'All tagged.' : 'Nothing to add.'}
                </div>
              )}
              {available.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onAdd(d.id)
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs text-text transition-colors duration-150 hover:bg-white/[0.04]"
                >
                  <span>{d.name}</span>
                  <Plus size={11} strokeWidth={2.5} className="text-fg-tertiary" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
