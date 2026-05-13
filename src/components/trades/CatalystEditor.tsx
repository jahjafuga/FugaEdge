import { useState } from 'react'
import { CATALYST_TYPES } from '@shared/trades-types'

interface CatalystEditorProps {
  catalystType: string | null
  daysSince: number | null
  /** Fires when either value changes. The IPC save commits both columns
   *  atomically so we always pass both in the same payload. */
  onChange: (catalystType: string | null, daysSince: number | null) => void
}

// Two-field editor for the trade's catalyst metadata. Dropdown selects
// from the canonical CATALYST_TYPES list (a "—" sentinel clears the type);
// number input edits days_since.
//
// Both fields save on change (dropdown: onChange; days: onBlur/Enter to
// avoid IPC-spam during typing).
export default function CatalystEditor({
  catalystType,
  daysSince,
  onChange,
}: CatalystEditorProps) {
  const [draft, setDraft] = useState<string>(daysSince == null ? '' : String(daysSince))

  // Keep the input draft in sync when the parent value changes externally
  // (e.g. trade swap inside the modal).
  if (
    document.activeElement?.tagName !== 'INPUT' &&
    draft !== (daysSince == null ? '' : String(daysSince))
  ) {
    setDraft(daysSince == null ? '' : String(daysSince))
  }

  const commitDays = () => {
    const trimmed = draft.trim()
    if (trimmed === '') {
      if (daysSince !== null) onChange(catalystType, null)
      return
    }
    const n = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(n) || n < 0) {
      // Revert visual to the saved value on invalid input.
      setDraft(daysSince == null ? '' : String(daysSince))
      return
    }
    if (n !== daysSince) onChange(catalystType, n)
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
      <div>
        <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
          Catalyst type
        </label>
        <select
          value={catalystType ?? ''}
          onChange={(e) => {
            const next = e.target.value === '' ? null : e.target.value
            onChange(next, daysSince)
          }}
          className="h-8 w-full cursor-pointer rounded-md border border-border-subtle bg-bg-1 px-2 text-sm text-fg-primary transition-colors duration-150 focus:border-gold focus:outline-none"
        >
          <option value="">— None —</option>
          {CATALYST_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
          Days since
        </label>
        <input
          type="number"
          min={0}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDays}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            } else if (e.key === 'Escape') {
              setDraft(daysSince == null ? '' : String(daysSince))
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          placeholder="0"
          aria-label="Days since catalyst"
          className="h-8 w-full rounded-md border border-border-subtle bg-bg-1 px-2.5 font-mono text-sm text-fg-primary placeholder:text-fg-muted transition-colors duration-150 focus:border-gold focus:outline-none"
        />
      </div>
    </div>
  )
}
