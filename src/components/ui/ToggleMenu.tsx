import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { viewControlIdle } from '@/components/trades/viewControlClasses'

// A chooser: a trigger, a list of switchable items, a locked subset that cannot
// be switched off, and a reset. EXTRACTED from ColumnsMenu, whose markup this is
// verbatim, because RANGES needs the identical control over a different list and
// a second copy is how the two drift until one forgets the locked rule.
//
// PERSISTENCE STAYS OUT, and that is the load-bearing constraint rather than a
// preference. This component never reads or writes a prefs key: it hands the
// whole next map upward and calls onReset. The two callers do not agree on
// scope — columns are stored under one global key, ranges may end up per-account
// — so a key baked in here would have to be torn back out, turning that decision
// into a second refactor.
//
// IDENTITY IS THE CALLER'S TOO. The testids are a prop, not derived from a base,
// because ColumnsMenu's items have always been addressed as col-toggle-<id>
// while its trigger is columns-button — no single base yields both. Deriving
// them would have renamed the handles nine test files hold.

export interface ToggleMenuItem {
  id: string
  label: string
}

/** The four handles a caller keeps. Passed in, never derived — see the note above. */
export interface ToggleMenuTestIds {
  button: string
  menu: string
  reset: string
  item: (id: string) => string
}

export interface ToggleMenuProps {
  items: readonly ToggleMenuItem[]
  /** Absent means ON, TanStack's rule (mirrors isVisible in lib/prefs/columns.ts). */
  value: Record<string, boolean>
  onChange: (next: Record<string, boolean>) => void
  /** The caller decides what its defaults are, and does its own persisting. */
  onReset: () => void
  /** The trigger's word — "Columns", "Ranges". */
  label: string
  /** Ids that may never be switched off. Omitted locks nothing. */
  locked?: ReadonlySet<string>
  icon?: ReactNode
  testIds: ToggleMenuTestIds
}

/** True when the item is switched on — absent counts as on. */
const isOn = (value: Record<string, boolean>, id: string) => value[id] !== false

export default function ToggleMenu({
  items,
  value,
  onChange,
  onReset,
  label,
  locked,
  icon,
  testIds,
}: ToggleMenuProps) {
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
        data-testid={testIds.button}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={viewControlIdle}
      >
        {icon}
        {label}
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
            data-testid={testIds.menu}
            className="absolute right-0 top-full z-40 mt-1 max-h-80 w-56 overflow-auto rounded-md border border-border-strong bg-bg-2 p-1 shadow-lg"
          >
            {items.map((item) => {
              const isLocked = locked?.has(item.id) ?? false
              return (
                <label
                  key={item.id}
                  data-testid={testIds.item(item.id)}
                  className={`flex items-center gap-2 px-1.5 py-1 text-xs ${
                    isLocked ? 'text-fg-muted' : 'cursor-pointer text-fg-secondary hover:text-gold'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isOn(value, item.id)}
                    disabled={isLocked}
                    onChange={() => {
                      // The locked rule must not live ONLY in an attribute.
                      // `disabled` is a rendering fact, and a change event
                      // raised programmatically walks straight past it — the
                      // extracted markup did exactly that when its own test
                      // clicked a locked row. No user can reach this: a real
                      // browser never delivers a click to a disabled control.
                      // It is here so the rule survives the day this checkbox
                      // becomes a styled div, which is when a chooser quietly
                      // forgets what it may not switch off.
                      if (isLocked) return
                      onChange({ ...value, [item.id]: !isOn(value, item.id) })
                    }}
                  />
                  <span>{item.label}</span>
                </label>
              )
            })}
            <button
              type="button"
              data-testid={testIds.reset}
              onClick={onReset}
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
