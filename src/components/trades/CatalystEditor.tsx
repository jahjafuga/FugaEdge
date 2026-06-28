import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import type { CatalystDef } from '@shared/catalyst-types'

interface CatalystEditorProps {
  catalystType: string | null
  daysSince: number | null
  /** Fires when either value changes. The IPC save commits both columns
   *  atomically so we always pass both in the same payload. */
  onChange: (catalystType: string | null, daysSince: number | null) => void
}

// Two-field editor for the trade's catalyst metadata. Dropdown selects from the
// user-customizable catalyst_def vocabulary (lazy-loaded; a "—" sentinel clears
// the type); number input edits days_since. A value not in the active list (an
// archived/renamed catalyst, or a pre-migration legacy string) still shows as a
// "(current)" option so a save never silently drops it.
//
// Both fields save on change (dropdown: onChange; days: onBlur/Enter to
// avoid IPC-spam during typing).
export default function CatalystEditor({
  catalystType,
  daysSince,
  onChange,
}: CatalystEditorProps) {
  const [draft, setDraft] = useState<string>(daysSince == null ? '' : String(daysSince))
  const [defs, setDefs] = useState<CatalystDef[] | null>(null)

  // Lazy-load the ACTIVE catalyst vocabulary once (archived excluded). Until it
  // resolves the select still renders "— None —" + the current value, so it is
  // never blank during load.
  useEffect(() => {
    let cancelled = false
    ipc.catalystDefsGet().then((list) => {
      if (!cancelled) setDefs(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

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

  // Surface a value that isn't in the active list (archived / renamed / legacy)
  // as a "(current)" option so it stays selected and a save preserves it.
  const names = defs?.map((d) => d.name) ?? []
  const showCurrent =
    catalystType != null && catalystType !== '' && !names.includes(catalystType)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
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
          {showCurrent && (
            <option value={catalystType ?? ''}>{catalystType} (current)</option>
          )}
          {(defs ?? []).map((d) => (
            <option key={d.id} value={d.name}>{d.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
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
