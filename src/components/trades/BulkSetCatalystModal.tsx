import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { ipc } from '@/lib/ipc'
import type { CatalystDef } from '@shared/catalyst-types'
import { signed, pnlClass } from '@/lib/format'

interface BulkSetCatalystModalProps {
  open: boolean
  onClose: () => void
  /** Number of selected trades the pick will apply to. */
  count: number
  /** Combined Net P&L of the selection (preview only). */
  netPnlTotal?: number
  /** In-flight flag — disables the buttons and swaps the Apply label. */
  busy?: boolean
  /** Apply-reject error; shown inline, modal stays open for retry. */
  error?: string | null
  onApply: (catalystType: string | null) => void
}

// Sentinel for the "No catalyst" (null) pick — distinct from the empty-string
// disabled placeholder so we can tell "hasn't chosen" from "chose to clear".
const NONE = '__none__'

// Phase 2 bulk-retag — the "Set catalyst" surface: an inline single-select that
// reads the live catalyst vocabulary + an Apply-to-N confirm, in ONE modal. Clones
// BulkSetPlaybookModal's shell, swapping the PlaybookPicker for a plain <select>
// (catalyst has no rich picker; this matches CatalystEditor's select). Sets
// catalyst_type ONLY — each trade keeps its own days-since. Apply is disabled until
// the user picks (touched), so it never applies nothing; "No catalyst" bulk-clears.
export default function BulkSetCatalystModal({
  open,
  onClose,
  count,
  netPnlTotal,
  busy = false,
  error = null,
  onApply,
}: BulkSetCatalystModalProps) {
  const [defs, setDefs] = useState<CatalystDef[] | null>(null)
  const [selectValue, setSelectValue] = useState('')

  // Reset the pick and (re)load the ACTIVE vocabulary each time the modal opens, so
  // a vocabulary edit in Settings is always reflected on the next open.
  useEffect(() => {
    if (!open) return
    setSelectValue('')
    let cancelled = false
    ipc.catalystDefsGet().then((list) => {
      if (!cancelled) setDefs(list)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const touched = selectValue !== ''
  const pendingCatalyst: string | null = selectValue === NONE ? null : selectValue
  const plural = count === 1 ? '' : 's'

  return (
    <Modal
      open={open}
      onClose={onClose}
      premium
      title={`Set catalyst on ${count} trade${plural}?`}
      width={440}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Catalyst
          </span>
          <select
            value={selectValue}
            onChange={(e) => setSelectValue(e.target.value)}
            className="h-8 w-full cursor-pointer rounded-md border border-border-subtle bg-bg-1 px-2 text-sm text-fg-primary transition-colors duration-150 focus:border-gold focus:outline-none"
          >
            <option value="" disabled>
              Choose a catalyst…
            </option>
            <option value={NONE}>No catalyst</option>
            {(defs ?? []).map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-fg-tertiary">
            Sets the catalyst on all selected trades; their days-since is left
            unchanged. "No catalyst" clears it.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-2 px-4 py-3">
          <div className="font-mono text-base font-semibold text-fg-primary tnum">
            {count} trade{plural}
          </div>
          {netPnlTotal != null && (
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                Combined Net P&amp;L
              </div>
              <div
                className={`font-mono text-sm font-semibold tnum ${pnlClass(netPnlTotal)}`}
              >
                {signed(netPnlTotal)}
              </div>
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
            onClick={() => onApply(pendingCatalyst)}
            disabled={busy || !touched}
            className="inline-flex h-9 cursor-pointer items-center rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Applying…' : `Apply to ${count}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
