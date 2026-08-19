import { useState } from 'react'
import { ChevronDown, Columns3 } from 'lucide-react'
import { viewControlIdle } from '@/components/trades/viewControlClasses'
import {
  ALL_COLUMN_IDS,
  COLUMN_LABELS,
  isLockedColumn,
  isVisible,
  resetColumnVisibility,
} from '@/lib/prefs/columns'

// The column-visibility control, lifted out of the table.
//
// It never needed the table instance: the ids, their order, their labels and which
// of them are locked all live in src/lib/prefs/columns.ts, and the visibility state
// is owned by whoever renders the table. So it renders wherever the state lives —
// beside the view switcher on the Trades page, which is where a control that
// governs the table belongs, rather than in a band of its own above it.
//
// A standalone table (tests, and any future embed) keeps its own copy of the state,
// so it still mounts this itself. One component, two mount points, decided by
// ownership — not two implementations.

export interface ColumnsMenuProps {
  visibility: Record<string, boolean>
  onChange: (next: Record<string, boolean>) => void
}

export default function ColumnsMenu({ visibility, onChange }: ColumnsMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      {/* A TRIGGER, at the view switcher's metric. Same height, radius, border
          token, surface and hover as the segmented control beside it, so the two
          read as equals — but with the chevron and popover of the app's existing
          menu triggers (MultiSelectMenu), because this opens a menu rather than
          selecting a view. Looking identical to a segment would claim it is one. */}
      <button
        type="button"
        data-testid="columns-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={viewControlIdle}
      >
        <Columns3 size={13} strokeWidth={2} />
        Columns
        <ChevronDown
          size={13}
          strokeWidth={2}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <>
          {/* Click-away catcher — the idiom's, and something this menu lacked. */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
        <div
          data-testid="columns-menu"
          className="absolute right-0 top-full z-40 mt-1 max-h-80 w-56 overflow-auto rounded-md border border-border-strong bg-bg-2 p-1 shadow-lg"
        >
          {ALL_COLUMN_IDS.map((id) => {
            const locked = isLockedColumn(id)
            return (
              <label
                key={id}
                data-testid={`col-toggle-${id}`}
                className={`flex items-center gap-2 px-1.5 py-1 text-xs ${
                  locked ? 'text-fg-muted' : 'cursor-pointer text-fg-secondary hover:text-gold'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isVisible(visibility, id)}
                  disabled={locked}
                  onChange={() =>
                    onChange({ ...visibility, [id]: !isVisible(visibility, id) })
                  }
                />
                <span>{COLUMN_LABELS[id] ?? id}</span>
              </label>
            )
          })}
          <button
            type="button"
            data-testid="columns-reset"
            onClick={() => onChange(resetColumnVisibility())}
            className="mt-1 w-full cursor-pointer rounded-md border border-border-subtle bg-bg-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 ease-out-soft hover:bg-bg-3 hover:text-fg-primary focus-visible:border-gold focus-visible:shadow-glow-gold focus-visible:outline-none"
          >
            Reset to defaults
          </button>
        </div>
        </>
      )}
    </div>
  )
}
