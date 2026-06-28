import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Segmented from '@/components/ui/Segmented'
import { ipc } from '@/lib/ipc'
import type { MistakeAxis, MistakeDef } from '@shared/mistakes-types'
import { signed, pnlClass } from '@/lib/format'

type Mode = 'add' | 'remove'

const MODE_OPTS: { key: Mode; label: string }[] = [
  { key: 'add', label: 'Add' },
  { key: 'remove', label: 'Remove' },
]

const AXES: { axis: MistakeAxis; label: string }[] = [
  { axis: 'technical', label: 'Technical' },
  { axis: 'psychological', label: 'Psychological' },
]

interface BulkSetMistakesModalProps {
  open: boolean
  onClose: () => void
  /** Number of selected trades the action applies to. */
  count: number
  /** Combined Net P&L of the selection (preview only). */
  netPnlTotal?: number
  /** In-flight flag — disables the buttons and swaps the Apply label. */
  busy?: boolean
  /** Apply-reject error; shown inline, modal stays open for retry. */
  error?: string | null
  onApply: (mode: Mode, mistakeDefIds: number[]) => void
}

// Phase 2 bulk-retag — the "Set mistakes" surface: an Add/Remove mode toggle + an
// axis-grouped multi-select of the live mistake vocabulary (keyed by mistake_def_id,
// the junction key) + an Apply-to-N confirm. Add unions the picked mistakes into
// every selected trade (keeps existing); Remove strips them (leaves the rest) — no
// replace-all. Clones BulkSetCatalystModal's scaffold; multi-select (no placeholder/
// touched — an empty selection disables Apply). Gold/non-destructive.
export default function BulkSetMistakesModal({
  open,
  onClose,
  count,
  netPnlTotal,
  busy = false,
  error = null,
  onApply,
}: BulkSetMistakesModalProps) {
  const [mode, setMode] = useState<Mode>('add')
  const [defs, setDefs] = useState<MistakeDef[] | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  // Reset (mode -> add, clear pick) and reload the ACTIVE vocabulary each open.
  useEffect(() => {
    if (!open) return
    setMode('add')
    setSelectedIds([])
    let cancelled = false
    ipc.mistakeDefsGet().then((list) => {
      if (!cancelled) setDefs(list)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const toggle = (id: number) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const plural = count === 1 ? '' : 's'
  const mPlural = selectedIds.length === 1 ? '' : 's'
  const canApply = selectedIds.length > 0

  // Axis-grouped: drop empty sections, render Technical then Psychological with a
  // divider only BETWEEN rendered sections (the MistakesFilterDropdown pattern,
  // keyed by mistake_def_id rather than {axis, name}).
  const sections = AXES.map(({ axis, label }) => ({
    axis,
    label,
    rows: (defs ?? []).filter((d) => d.axis === axis),
  })).filter((s) => s.rows.length > 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit mistakes on ${count} trade${plural}?`}
      width={440}
    >
      <div className="flex flex-col gap-4">
        <Segmented options={MODE_OPTS} value={mode} onChange={setMode} />

        <div className="max-h-[260px] overflow-auto rounded-md border border-border-subtle bg-bg-1 p-2">
          {!defs && (
            <div className="px-2 py-2 text-[10px] text-fg-muted">Loading…</div>
          )}
          {defs && sections.length === 0 && (
            <div className="px-2 py-2 text-[10px] text-fg-muted">No mistakes</div>
          )}
          {defs &&
            sections.map((s, i) => (
              <div key={s.axis}>
                {i > 0 && <div className="my-1 h-px bg-border-subtle" />}
                <div className="mb-1 mt-0.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                  {s.label}
                </div>
                {s.rows.map((d) => {
                  const checked = selectedIds.includes(d.id)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggle(d.id)}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
                        checked ? 'bg-white/[0.04] text-fg-primary' : 'text-fg-primary hover:bg-white/[0.04]'
                      }`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-150 ${
                          checked ? 'border-gold bg-gold text-accent-ink' : 'border-border'
                        }`}
                      >
                        {checked && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span className="truncate">{d.name}</span>
                    </button>
                  )
                })}
              </div>
            ))}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-2 px-4 py-3">
          <div className="text-sm text-fg-secondary">
            {mode === 'add' ? 'Add' : 'Remove'}{' '}
            <span className="font-mono font-semibold text-fg-primary tnum">
              {selectedIds.length}
            </span>{' '}
            mistake{mPlural} {mode === 'add' ? 'to' : 'from'}{' '}
            <span className="font-mono font-semibold text-fg-primary tnum">{count}</span>{' '}
            trade{plural}
          </div>
          {netPnlTotal != null && (
            <div
              className={`shrink-0 font-mono text-sm font-semibold tnum ${pnlClass(netPnlTotal)}`}
            >
              {signed(netPnlTotal)}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="text-xs font-medium text-loss">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border-strong bg-bg-1 px-4 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(mode, selectedIds)}
            disabled={busy || !canApply}
            className="inline-flex h-9 cursor-pointer items-center rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Applying…' : `${mode === 'add' ? 'Add to' : 'Remove from'} ${count}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
